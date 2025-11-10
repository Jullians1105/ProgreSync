// backend/routes/entregas.routes.js
import { Router } from "express";
import multer from "multer";
import path from "path";
import { pool } from "../services/db.js";
import { logCambio } from "../services/historial.js";

const router = Router();

// Log para confirmar que este archivo sí se llegó a cargar
console.log("✅ entregas.routes.js cargado");

/* ────────────────────── Multer: almacenamiento ────────────────────── */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads"), // carpeta relativa a backend/app.js
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname); // .pdf/.doc/.docx
    const base = path
      .basename(file.originalname, ext)
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/gi, "-")
      .slice(0, 50);
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${base}-${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

/* ────────────────────── Diagnóstico ────────────────────── */
router.get("/__ping", (_req, res) =>
  res.json({ ok: true, from: "entregas.routes.js" })
);

/* ────────────────────── Crear entrega (con archivo) ──────────────────────
   POST /api/entregas
*/
router.post("/", upload.single("archivo"), async (req, res) => {
  try {
    console.log('▶ POST /api/entregas - recibido');
    console.log('  req.body keys:', Object.keys(req.body));
    console.log('  archivo presente?:', !!req.file);
    const { titulo, descripcion, id_estudiante } = req.body;
    if (!titulo || !id_estudiante || !req.file) {
      return res.status(400).json({ error: "Faltan campos o archivo" });
    }

    const archivoUrl = `/uploads/${req.file.filename}`;
    const estado = "en_revision";

    // Insertar la entrega
    const [result] = await pool.query(
      `INSERT INTO entregas (id_estudiante, titulo, descripcion, archivo, estado, fecha)
       VALUES (?,?,?,?,?, NOW())`,
      [id_estudiante, titulo, descripcion ?? null, archivoUrl, estado]
    );

    const nuevaId = result.insertId;
    console.log(`  Entrega insertada id=${nuevaId} por estudiante=${id_estudiante}`);
    const usuarioId = req.session?.user?.id ?? Number(id_estudiante);
    await logCambio({
      entregaId: nuevaId,
      usuarioId,
      accion: "CREAR_ENTREGA",
      detalle: { titulo, archivo: archivoUrl }
    });

// ── HISTORIAL: registrar creación ──
try {
  const usuarioId2 = req.session?.user?.id ?? Number(id_estudiante);

  // a) creación (estado inicial)
  await pool.query(
    `INSERT INTO historial_entregas
      (entrega_id, usuario_id, usuario_rol, accion, campo, valor_anterior, valor_nuevo, comentario, fecha)
     VALUES (?,?,?,?,?,?,?,?, NOW())`,
    [
      nuevaId,
      usuarioId2,
      'estudiante',
      'CREACION',
      'estado',
      null,
      'en_revision',
      JSON.stringify({ titulo, archivo: archivoUrl }),
    ]
  );

  // b) archivo subido (opcional, deja si quieres ver este movimiento)
  await pool.query(
    `INSERT INTO historial_entregas
      (entrega_id, usuario_id, usuario_rol, accion, campo, valor_anterior, valor_nuevo, comentario, fecha)
      VALUES (?,?,?,?,?,?,?,?, NOW())`,
    [
      nuevaId,
      usuarioId2,
      'estudiante',
      'CAMBIO_ARCHIVO',
      'archivo',
      null,
      archivoUrl,
      'Archivo subido por el estudiante',
    ]
  );
} catch (e) {
  console.warn("⚠️ No se pudo registrar historial de creación:", e?.message);
}

    // ─────────────────────────────────────────────────────────────

    // NOTIFICAR a docentes: hay una nueva entrega en revisión
    try {
      // Obtener nombre del estudiante para el mensaje
      const [[stu]] = await pool.query(`SELECT nombre FROM usuarios WHERE id = ? LIMIT 1`, [id_estudiante]);
      const estudianteNombre = stu?.nombre ?? 'Estudiante';

      // Obtener docentes activos
      const [docentes] = await pool.query(`SELECT id FROM usuarios WHERE rol = 'docente'`);
      
      if (docentes.length === 0) {
        console.warn('⚠️ No hay docentes registrados para notificar');
      }

      const datos = JSON.stringify({ 
        entrega_id: nuevaId, 
        id_estudiante, 
        tipo: 'nueva_entrega',
        titulo,
        estudiante: estudianteNombre
      });
      
      const mensajeBase = `Nueva entrega pendiente de revisión: "${titulo}" del estudiante ${estudianteNombre}`;

      for (const d of docentes) {
        try {
          console.log(`📨 Creando notificación para docente ${d.id}`);
          const [ins] = await pool.query(
            `INSERT INTO notificaciones (id_usuario, tipo, mensaje, datos, leido, fecha)
             VALUES (?,?,?,?,0,NOW())`,
            [d.id, 'nueva_entrega', mensajeBase, datos]
          );
          console.log(`    -> notificacion insertId=${ins.insertId} affectedRows=${ins.affectedRows}`);
        } catch (e) {
          console.error('⚠️ Error al notificar al docente', d.id, ':', e?.message);
        }
      }
    } catch (e) {
      console.error('⚠️ Error al crear notificaciones para docentes:', e?.message);
      console.error(e);
    }

    return res.status(201).json({ ok: true, archivo: archivoUrl });
  } catch (err) {
    console.error("Error POST /api/entregas:", err);
    return res.status(500).json({ error: "No se pudo registrar la entrega" });
  }
});

/* ────────────────────── Listar mis entregas ──────────────────────
   GET /api/entregas/mis/:id_estudiante
*/
router.get("/mis/:id_estudiante", async (req, res) => {
  try {
    const { id_estudiante } = req.params;
    const [rows] = await pool.query(
      `SELECT id, titulo, descripcion, archivo, estado, comentario_docente, fecha
       FROM entregas
       WHERE id_estudiante = ?
       ORDER BY fecha DESC`,
      [id_estudiante]
    );
    res.json(rows);
  } catch (err) {
    console.error("Error GET /api/entregas/mis:", err);
    res.status(500).json({ error: "No se pudieron obtener las entregas" });
  }
});

/* ────────────────────── Pendientes para docente ──────────────────────
   GET /api/entregas/pendientes
*/
router.get("/pendientes", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT e.id, e.titulo, e.descripcion, e.archivo, e.estado, e.fecha,
              u.nombre AS estudiante, u.email AS estudiante_email
       FROM entregas e
       JOIN usuarios u ON u.id = e.id_estudiante
       WHERE e.estado = 'en_revision'
       ORDER BY e.fecha DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error("Error GET /api/entregas/pendientes:", err);
    res.status(500).json({ error: "No se pudieron obtener las pendientes" });
  }
});

/* ────────────────────── Entregas aprobadas ──────────────────────
   GET /api/entregas/aprobadas
*/
router.get("/aprobadas", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT e.id, e.titulo, e.descripcion, e.archivo, e.estado, e.fecha,
              e.comentario_docente,
              u.nombre AS estudiante, u.email AS estudiante_email
       FROM entregas e
       JOIN usuarios u ON u.id = e.id_estudiante
       WHERE e.estado = 'aprobado'
       ORDER BY e.fecha DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error("Error GET /api/entregas/aprobadas:", err);
    res.status(500).json({ error: "No se pudieron obtener las aprobadas" });
  }
});

/* ────────────────────── Entregas rechazadas ──────────────────────
   GET /api/entregas/rechazadas
*/
router.get("/rechazadas", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT e.id, e.titulo, e.descripcion, e.archivo, e.estado, e.fecha,
              e.comentario_docente,
              u.nombre AS estudiante, u.email AS estudiante_email
       FROM entregas e
       JOIN usuarios u ON u.id = e.id_estudiante
       WHERE e.estado = 'rechazado'
       ORDER BY e.fecha DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error("Error GET /api/entregas/rechazadas:", err);
    res.status(500).json({ error: "No se pudieron obtener las rechazadas" });
  }
});

/* ────────────────────── Historial por entrega ──────────────────────
   GET /api/entregas/:id/historial
*/
router.get("/:id/historial", async (req, res) => {
  try {
    const entregaId = Number(req.params.id);
    if (!entregaId) return res.status(400).json({ error: "ID inválido" });

    const limit = Math.min(Math.max(parseInt(req.query.limit || "100", 10), 1), 500);
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const offset = (page - 1) * limit;

    // Usamos tus columnas: accion, campo, valor_anterior, valor_nuevo, comentario, fecha
    // y devolvemos alias 'estado_anterior/estado_nuevo' SOLO cuando campo='estado'
    const [rows] = await pool.query(
      `
      SELECT
        h.id,
        h.entrega_id,
        h.usuario_id,
        u.nombre AS usuario_nombre,
        h.usuario_rol,
        h.accion,
        h.campo,
        h.valor_anterior,
        h.valor_nuevo,
        h.comentario,
        h.fecha,
        /* Aliases para el front (opcionales) */
        CASE WHEN h.campo = 'estado' THEN h.valor_anterior ELSE NULL END AS estado_anterior,
        CASE WHEN h.campo = 'estado' THEN h.valor_nuevo    ELSE NULL END AS estado_nuevo
      FROM historial_entregas h
      LEFT JOIN usuarios u ON u.id = h.usuario_id
      WHERE h.entrega_id = ?
      ORDER BY h.fecha DESC
      LIMIT ? OFFSET ?
      `,
      [entregaId, limit, offset]
    );

    res.json(rows);
  } catch (err) {
    console.error("Error GET /api/entregas/:id/historial:", err);
    res.status(500).json({ error: "No se pudo obtener el historial" });
  }
});


/* ────────────────────── Cambiar estado (Docente) ──────────────────────
   PATCH /api/entregas/:id/estado
*/
router.patch("/:id/estado", async (req, res) => {
  try {
      // 0) Verificar sesión del usuario (desde sesión o headers)
      const usuarioId = req.session?.user?.id || req.body?.usuario_id || req.headers['x-user-id'];
      const usuarioRol = req.session?.user?.rol || req.headers['x-user-role'];
    
      if (!usuarioId) {
      return res.status(401).json({ error: "No autenticado. Por favor, inicia sesión nuevamente." });
    }
    
      if (usuarioRol !== 'docente' && usuarioRol !== 'admin') {
        return res.status(403).json({ error: "Solo los docentes pueden calificar entregas." });
      }

    // 1) ID válido
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID inválido" });

    // 2) Mapeo del estado del front → valores en BD
    const estadoIn = String(req.body?.estado || "").toLowerCase();
    let dbEstado = "en_revision";
    if (estadoIn.includes("aprob")) dbEstado = "aprobado";
    else if (estadoIn.includes("rechaz")) dbEstado = "rechazado";

    // 3) Comentario opcional
    const comentario = String(req.body?.comentario || "").trim() || null;

    // 4) Obtener estado/comentario actuales (para validar y registrar historial)
    const [[actual]] = await pool.query(
      `SELECT estado AS estado_actual, comentario_docente AS comentario_actual
         FROM entregas
        WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!actual) return res.status(404).json({ error: "Entrega no encontrada" });

    // 5) Actualizar entrega
    const [result] = await pool.query(
      `UPDATE entregas
         SET estado = ?, comentario_docente = ?
       WHERE id = ?`,
      [dbEstado, comentario, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Entrega no encontrada" });
    }

    // Crear una notificación para el estudiante propietario de la entrega
    try {
      const [entRows] = await pool.query(
        `SELECT id_estudiante, titulo FROM entregas WHERE id = ? LIMIT 1`,
        [id]
      );
      const entrega = entRows[0];
      if (entrega) {
        const mensaje = `Tu entrega "${entrega.titulo}" cambió a ${dbEstado}.` +
          (comentario ? ` Comentario: ${comentario}` : "");
        const datos = JSON.stringify({ entrega_id: id, nuevo_estado: dbEstado });
        await pool.query(
          `INSERT INTO notificaciones (id_usuario, tipo, mensaje, datos, leido, fecha)
           VALUES (?,?,?,?,0,NOW())`,
          [entrega.id_estudiante, "estado_entrega", mensaje, datos]
        );
      }
    } catch (errNotify) {
      console.error("Error creando notificación:", errNotify);
      // No fallamos la petición principal por esto; sólo logueamos
    }
    // 6) Registrar en historial
// 6) Registrar en historial (usa tu esquema)
try {
  await pool.query(
    `INSERT INTO historial_entregas
      (entrega_id, usuario_id, usuario_rol, accion, campo, valor_anterior, valor_nuevo, comentario, fecha)
      VALUES (?,?,?,?,?,?,?,?, NOW())`,
    [
      id,
      usuarioId,
          usuarioRol,
      'CAMBIO_ESTADO',
      'estado',
      actual.estado_actual ?? null,
      dbEstado,
      comentario,
    ]
  );
} catch (e) {
  console.warn("⚠️ No se pudo registrar historial de cambio:", e?.message);
}


    // 7) Respuesta
    return res.json({
      ok: true,
      id,
      estado: dbEstado,
      comentario,
    });
  } catch (err) {
    console.error("Error PATCH /api/entregas/:id/estado:", err);
    return res.status(500).json({ error: "No se pudo actualizar el estado" });
  }
});

export default router;

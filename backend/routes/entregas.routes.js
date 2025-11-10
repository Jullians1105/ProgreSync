// backend/routes/entregas.routes.js

// === AÑADIDOS PARA PDF ===
import PDFDocument from "pdfkit";
import dayjs from "dayjs";
import "dayjs/locale/es.js";
dayjs.locale("es");

function sanitizeFilename(s = "") {
  return String(s)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quita tildes
    .replace(/[^\w\-]+/g, "_")                        // deja solo seguros
    .slice(0, 80);
}

import { Router } from "express";
import multer from "multer";
import path from "path";
import { pool } from "../services/db.js";
import { logCambio } from "../services/historial.js";

// Helper para insertar historial compatible con ambos esquemas
let _hasDetalleJsonCache = null;
async function hasDetalleJson() {
  if (typeof _hasDetalleJsonCache === 'boolean') return _hasDetalleJsonCache;
  try {
    const [rows] = await pool.query(`SHOW COLUMNS FROM historial_entregas LIKE 'detalle_json'`);
    _hasDetalleJsonCache = Array.isArray(rows) && rows.length > 0;
    return _hasDetalleJsonCache;
  } catch (err) {
    _hasDetalleJsonCache = false;
    return false;
  }
}

async function insertHistorialEntrega({
  entregaId,
  usuarioId,
  usuarioRol = null,
  accion,
  campo = null,
  valorAnterior = null,
  valorNuevo = null,
  comentario = null,
  detalle = null,
}) {
  const hasDetalle = await hasDetalleJson();
  if (hasDetalle && detalle) {
    // Esquema moderno
    await pool.query(
      `INSERT INTO historial_entregas (entrega_id, usuario_id, accion, detalle_json, fecha)
       VALUES (?, ?, ?, ?, NOW())`,
      [entregaId, usuarioId, String(accion).toUpperCase(), JSON.stringify(detalle)]
    );
    return;
  }
  // Esquema antiguo
  await pool.query(
    `INSERT INTO historial_entregas
      (entrega_id, usuario_id, usuario_rol, accion, campo, valor_anterior, valor_nuevo, comentario, fecha)
     VALUES (?,?,?,?,?,?,?,?, NOW())`,
    [
      entregaId,
      usuarioId,
      usuarioRol,
      String(accion).toUpperCase(),
      campo,
      valorAnterior,
      valorNuevo,
      comentario ?? (detalle ? JSON.stringify(detalle) : null)
    ]
  );
}

const router = Router();

// Log para confirmar que este archivo sí se llegó a cargar
console.log("✅ entregas.routes.js cargado");

/* ────────────────────── Multer: almacenamiento ────────────────────── */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, "uploads"), // carpeta relativa a backend/app.js
  filename: (_req, file, cb) => {
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
      await insertHistorialEntrega({
        entregaId: nuevaId,
        usuarioId: usuarioId2,
        usuarioRol: 'estudiante',
        accion: 'CREACION',
        campo: 'estado',
        valorAnterior: null,
        valorNuevo: 'en_revision',
        comentario: null,
        detalle: { titulo, archivo: archivoUrl }
      });
      // b) archivo subido (opcional)
      await insertHistorialEntrega({
        entregaId: nuevaId,
        usuarioId: usuarioId2,
        usuarioRol: 'estudiante',
        accion: 'CAMBIO_ARCHIVO',
        campo: 'archivo',
        valorAnterior: null,
        valorNuevo: archivoUrl,
        comentario: 'Archivo subido por el estudiante',
        detalle: null
      });
    } catch (e) {
      console.warn("⚠️ No se pudo registrar historial de creación:", e?.message);
    }

    // NOTIFICAR a docentes
    try {
      const [[stu]] = await pool.query(
        `SELECT nombre FROM usuarios WHERE id = ? LIMIT 1`,
        [id_estudiante]
      );
      const estudianteNombre = stu?.nombre ?? 'Estudiante';

      const [docentes] = await pool.query(
        `SELECT id FROM usuarios WHERE rol = 'docente'`
      );
      if (docentes.length === 0) console.warn('⚠️ No hay docentes registrados para notificar');

      const datos = JSON.stringify({
        entrega_id: nuevaId, id_estudiante, tipo: 'nueva_entrega', titulo, estudiante: estudianteNombre
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

    // 4) Obtener estado/comentario actuales
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

    // Notificación para el estudiante
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
    }

    // 6) Registrar en historial
    try {
      await insertHistorialEntrega({
        entregaId: id,
        usuarioId,
        usuarioRol,
        accion: 'CAMBIO_ESTADO',
        campo: 'estado',
        valorAnterior: actual.estado_actual ?? null,
        valorNuevo: dbEstado,
        comentario,
        detalle: null
      });
    } catch (e) {
      console.warn("⚠️ No se pudo registrar historial de cambio:", e?.message);
    }

    // 7) Respuesta
    return res.json({ ok: true, id, estado: dbEstado, comentario });
  } catch (err) {
    console.error("Error PATCH /api/entregas/:id/estado:", err);
    return res.status(500).json({ error: "No se pudo actualizar el estado" });
  }
});

/* ────────────────────── Exportar PDF bonito (layout apilado) ──────────────────────
   GET /api/entregas/:id/reporte.pdf
*/
router.get("/:id/reporte.pdf", async (req, res) => {
  try {
    const entregaId = Number(req.params.id);
    if (!entregaId) return res.status(400).json({ error: "ID inválido" });

    // 1) Encabezado de la entrega
    const [[header]] = await pool.query(
      `SELECT e.id, e.titulo, e.descripcion, e.estado, e.archivo, e.fecha,
              u.nombre AS estudiante_nombre, u.email AS estudiante_email
         FROM entregas e
         LEFT JOIN usuarios u ON u.id = e.id_estudiante
        WHERE e.id = ? LIMIT 1`,
      [entregaId]
    );
    if (!header) return res.status(404).json({ error: "Entrega no encontrada" });

    // 2) Historial
    const [historial] = await pool.query(
      `SELECT h.id, h.entrega_id, h.usuario_id, u.nombre AS usuario_nombre,
              h.usuario_rol, h.accion, h.campo, h.valor_anterior, h.valor_nuevo,
              h.comentario, h.fecha
         FROM historial_entregas h
         LEFT JOIN usuarios u ON u.id = h.usuario_id
        WHERE h.entrega_id = ?
        ORDER BY h.fecha DESC
        LIMIT 3000`,
      [entregaId]
    );

    // 3) Nombre archivo
    const base = sanitizeFilename(header.titulo || `entrega_${entregaId}`);
    const stamp = dayjs().format("YYYY-MM-DD_HH-mm");
    const filename = `${base}__${stamp}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    // 4) PDF (en horizontal)
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 50,
      bufferPages: true,
      info: {
        Title: `Historial de entrega: ${header.titulo || "-"}`,
        Author: "ProgreSync",
        Creator: "ProgreSync",
      }
    });
    doc.pipe(res);

    const COLOR = {
      primary: "#1f2937",
      accent:  "#f59e0b",
      muted:   "#6b7280",
      good:    "#16a34a",
      warn:    "#f59e0b",
      bad:     "#dc2626",
      band:    "#f3f4f6",
    };

    const CONTENT_W = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    const writeKV = (label, value) => {
      doc.fillColor(COLOR.muted).font("Helvetica").fontSize(11).text(label, { continued: true });
      doc.fillColor(COLOR.primary).font("Helvetica-Bold").fontSize(11).text(` ${value ?? "-"}`);
    };

    const drawBadge = (text, type = "good") => {
      const bg = type === "good" ? "#dcfce7" : type === "bad" ? "#fee2e2" : "#fef3c7";
      const fg = type === "good" ? COLOR.good : type === "bad" ? COLOR.bad : COLOR.warn;
      const padX = 6, padY = 3;
      const x = doc.x, y = doc.y;
      const w = doc.widthOfString(String(text)) + padX * 2;
      const h = doc.currentLineHeight() + padY * 2;
      doc.save().rect(x, y, w, h).fill(bg).restore();
      doc.fillColor(fg).font("Helvetica-Bold").text(text, x + padX, y + padY);
      doc.moveDown(0.2);
    };

    doc.font("Helvetica-Bold").fontSize(28).fillColor(COLOR.primary).text("Progre", { continued: true });
    doc.fillColor(COLOR.accent).text("Sync");
    doc.moveDown(0.2);
    doc.font("Helvetica-Bold").fontSize(18).fillColor(COLOR.primary).text("Reporte de historial de entrega");
    doc.moveDown(0.8);

    // Bloque de metadatos (interlineado mayor)
    writeKV("Título:", header.titulo || "-");            doc.moveDown(0.35);
    writeKV("Estudiante:", `${header.estudiante_nombre || "-"} <${header.estudiante_email || "-"}>`); doc.moveDown(0.35);
    writeKV("Archivo:", header.archivo || "-");          doc.moveDown(0.35);
    writeKV("Fecha de creación:", header.fecha ? dayjs(header.fecha).format("DD/MM/YYYY HH:mm") : "-"); doc.moveDown(0.35);
    writeKV("Exportado:", dayjs().format("DD/MM/YYYY HH:mm"));
    doc.moveDown(1.0); // margen inferior del bloque

    doc.font("Helvetica-Bold").fontSize(12).fillColor(COLOR.primary).text("Estado actual:");
    const stateMap = { aprobado: "good", en_revision: "warn", rechazado: "bad" };
    drawBadge(header.estado || "—", stateMap[header.estado] || "warn");
    doc.moveDown(0.6);

    if ((header.descripcion || "").trim()) {
      doc.font("Helvetica-Bold").fontSize(12).fillColor(COLOR.primary).text("Descripción");
      doc.moveDown(0.15);
      doc.font("Helvetica").fontSize(11).fillColor(COLOR.primary)
        .text(String(header.descripcion), { align: "justify", width: CONTENT_W });
      doc.moveDown(0.8);
    }

    doc.font("Helvetica-Bold").fontSize(14).fillColor(COLOR.primary).text("Historial de cambios");
    doc.moveDown(0.35);

    // En horizontal disponemos de ~642pt de ancho. Distribución cómoda:
    const columns = [
      { key: "fecha",    label: "Fecha",    width: 110 },
      { key: "accion",   label: "Acción",   width: 100 },
      { key: "campo",    label: "Campo",    width: 90 },
      { key: "anterior", label: "Anterior", width: 150 },
      { key: "nuevo",    label: "Nuevo",    width: 150 },
      { key: "autor",    label: "Autor",    width: CONTENT_W - (110 + 100 + 90 + 150 + 150) }, // resto para autor
    ];

    const tableX = doc.x;
    const headerHeight = 18;

    const printTableHeader = () => {
      const y = doc.y;
      doc.save()
        .rect(tableX - 2, y - 3, CONTENT_W + 4, headerHeight)
        .fill(COLOR.band)
        .restore();
      columns.forEach((c, i) => {
        doc.font("Helvetica-Bold").fontSize(10).fillColor(COLOR.primary)
          .text(c.label, tableX + columns.slice(0, i).reduce((a, b) => a + b.width, 0), y, { width: c.width });
      });
      doc.moveDown(1.1);
    };

    const ensureSpace = (rowsNeeded = 3) => {
      const bottom = doc.page.height - doc.page.margins.bottom;
      if (doc.y > bottom - rowsNeeded * 14) {
        doc.addPage();
        // Repetimos título de sección en nueva página
        doc.font("Helvetica-Bold").fontSize(14).fillColor(COLOR.primary).text("Historial de cambios");
        doc.moveDown(0.35);
        printTableHeader();
      }
    };

    printTableHeader();

    if (!historial.length) {
      doc.font("Helvetica-Oblique").fontSize(11).fillColor(COLOR.muted).text("Sin movimientos registrados.", {
        width: CONTENT_W,
      });
    } else {
      historial.forEach((h, idx) => {
        ensureSpace(3);

        // Fila principal
        const row = {
          fecha:  h.fecha ? dayjs(h.fecha).format("DD/MM/YYYY HH:mm") : "-",
          accion: h.accion || "",
          campo:  h.campo || "",
          anterior: h.valor_anterior || "",
          nuevo:    h.valor_nuevo || "",
          autor:  h.usuario_nombre
            ? `${h.usuario_nombre} (${h.usuario_rol || ""})`
            : (h.usuario_rol || "-"),
        };

        const baseY = doc.y;
        let rowHeight = 0;

        // Calcular altura necesaria (wrap) sin pintar
        columns.forEach((c, i) => {
          const text = String(row[c.key] ?? "");
          const hgt = doc.heightOfString(text, { width: c.width, align: "left" });
          rowHeight = Math.max(rowHeight, hgt);
        });

        // Banda alterna
        if (idx % 2 === 1) {
          doc.save().rect(tableX - 2, baseY - 2, CONTENT_W + 4, rowHeight + 4).fill("#f8fafc").restore();
        }

        // Pintar celdas
        columns.forEach((c, i) => {
          const text = String(row[c.key] ?? "");
          const x = tableX + columns.slice(0, i).reduce((a, b) => a + b.width, 0);
          doc.font("Helvetica").fontSize(10).fillColor(COLOR.primary)
            .text(text, x, baseY, { width: c.width });
        });

        // Avanzar a la siguiente fila
        doc.y = baseY + rowHeight + 4;

        // Comentario (si existe)
        if ((h.comentario || "").trim()) {
          ensureSpace(2);
          doc.font("Helvetica-Oblique").fontSize(10).fillColor(COLOR.muted)
            .text(`Comentario: ${h.comentario}`, tableX, doc.y, { width: CONTENT_W });
          doc.moveDown(0.4);
        }
      });
    }

    // Numeración de páginas
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      const pageNum = `${i + 1} / ${range.count}`;
      doc.font("Helvetica").fontSize(9).fillColor(COLOR.muted);
      const w = doc.widthOfString(pageNum);
      doc.text(pageNum, doc.page.width - doc.page.margins.right - w, doc.page.height - doc.page.margins.bottom + 10);
    }

    doc.end();
  } catch (err) {
    console.error("Error GET /api/entregas/:id/reporte.pdf:", err);
    res.status(500).json({ error: "No se pudo generar el PDF" });
  }
});

export default router;

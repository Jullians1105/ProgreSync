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
// =========================

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

      // b) archivo subido (opcional)
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
          await pool.query(
            `INSERT INTO notificaciones (id_usuario, tipo, mensaje, datos, leido, fecha)
             VALUES (?,?,?,?,0,NOW())`,
            [d.id, 'nueva_entrega', mensajeBase, datos]
          );
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
    return res.json({ ok: true, id, estado: dbEstado, comentario });
  } catch (err) {
    console.error("Error PATCH /api/entregas/:id/estado:", err);
    return res.status(500).json({ error: "No se pudo actualizar el estado" });
  }
});

/* ────────────────────── Exportar PDF del historial (bonito) ──────────────────────
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
        LIMIT 2000`,
      [entregaId]
    );

    // 3) Nombre del archivo (usa helper saneado)
    const base = sanitizeFilename(header.titulo || `entrega_${entregaId}`);
    const stamp = dayjs().format("YYYY-MM-DD_HH-mm");
    const filename = `${base}__${stamp}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    // 4) Generar PDF con estilo
    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
      bufferPages: true,
      info: {
        Title: `Historial de entrega: ${header.titulo || "-"}`,
        Author: "ProgreSync",
        Creator: "ProgreSync",
      }
    });
    doc.pipe(res);

    /* ========= helpers de estilo ========= */
    const COLOR = {
      primary: "#1f2937",  // gris oscuro
      accent:  "#f59e0b",  // naranja
      muted:   "#6b7280",  // gris medio
      good:    "#16a34a",  // verde
      warn:    "#f59e0b",  // naranja
      bad:     "#dc2626",  // rojo
      line:    "#e5e7eb",  // gris claro
      zebra:   "#f8fafc"
    };

    function hr(yPad=10) {
      doc.moveDown(yPad/14);
      const y = doc.y;
      doc.strokeColor(COLOR.line).lineWidth(1).moveTo(doc.page.margins.left, y)
         .lineTo(doc.page.width - doc.page.margins.right, y).stroke();
      doc.moveDown(yPad/14);
    }
    function kv(label, value) {
      doc.fillColor(COLOR.muted).font("Helvetica").fontSize(10).text(label, {continued:true});
      doc.fillColor(COLOR.primary).font("Helvetica-Bold").fontSize(11).text(` ${value ?? "-"}`);
    }
    function badge(text, type="muted") {
      const bg = type === "good" ? "#dcfce7" : type === "bad" ? "#fee2e2" : type === "warn" ? "#fef3c7" : "#e5e7eb";
      const fg = type === "good" ? COLOR.good : type === "bad" ? COLOR.bad : type === "warn" ? COLOR.warn : COLOR.primary;
      const x = doc.x, y = doc.y;
      const padX = 6, padY = 3;
      const w = doc.widthOfString(String(text)) + padX*2;
      const h = doc.currentLineHeight() + padY*2;
      doc.save().roundRect(x, y, w, h, 4).fill(bg).restore();
      doc.fillColor(fg).text(text, x+padX, y+padY);
      doc.moveDown(0.2);
    }
    function pageFooter() {
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);
        const pageNum = i + 1;
        const text = `ProgreSync · ${dayjs().format("DD/MM/YYYY HH:mm")} · Página ${pageNum} de ${range.count}`;
        doc.font("Helvetica").fontSize(9).fillColor(COLOR.muted);
        const w = doc.widthOfString(text);
        doc.text(text, doc.page.width - doc.page.margins.right - w, doc.page.height - doc.page.margins.bottom + 15);
      }
    }

    /* ========= Encabezado ========= */
    doc.font("Helvetica-Bold").fontSize(22).fillColor(COLOR.primary).text("Progre", {continued:true});
    doc.fillColor(COLOR.accent).text("Sync");
    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").fontSize(16).fillColor(COLOR.primary).text("Reporte de historial de entrega");
    hr(6);

    // Fila izquierda/derecha
    const leftX = doc.x; const colW = 280;
    // Columna izquierda: metadatos
    doc.fontSize(11).fillColor(COLOR.primary);
    kv("Título:", header.titulo || "-");
    kv("Estudiante:", `${header.estudiante_nombre || "-"} <${header.estudiante_email || "-"}>`);
    kv("Archivo:", header.archivo || "-");
    kv("Fecha de creación:", header.fecha ? dayjs(header.fecha).format("DD/MM/YYYY HH:mm") : "-");
    kv("Exportado:", dayjs().format("DD/MM/YYYY HH:mm"));

    // Columna derecha: Estado (badge)
    doc.moveUp(5);
    doc.x = leftX + colW + 20;
    doc.font("Helvetica-Bold").fontSize(11).fillColor(COLOR.primary).text("Estado actual:");
    const stateMap = { aprobado: "good", en_revision: "warn", rechazado: "bad" };
    badge((header.estado || "—"), stateMap[header.estado] || "muted");

    hr(12);

    // Descripción (si hay)
    if ((header.descripcion || "").trim()) {
      doc.font("Helvetica-Bold").fontSize(12).fillColor(COLOR.primary).text("Descripción");
      doc.moveDown(0.2);
      doc.font("Helvetica").fontSize(11).fillColor(COLOR.primary)
        .text(String(header.descripcion), {align:"justify"});
      hr(12);
    }

    /* ========= Tabla historial ========= */
    doc.font("Helvetica-Bold").fontSize(13).fillColor(COLOR.primary).text("Historial de cambios");
    doc.moveDown(0.5);

    const columns = [
      { key:"fecha",    label:"Fecha",    width:110 },
      { key:"accion",   label:"Acción",   width:85  },
      { key:"campo",    label:"Campo",    width:85  },
      { key:"anterior", label:"Anterior", width:140 },
      { key:"nuevo",    label:"Nuevo",    width:140 },
      { key:"autor",    label:"Autor",    width:120 },
    ];

    function tableHeader() {
      const y = doc.y;
      doc.save().rect(doc.x-2, y-4, doc.page.width - doc.page.margins.left - doc.page.margins.right + 4, 22)
        .fill("#f3f4f6").restore();
      columns.forEach(col => {
        doc.font("Helvetica-Bold").fontSize(10).fillColor(COLOR.primary)
          .text(col.label, {continued:true, width:col.width});
      });
      doc.text(""); doc.moveDown(0.3);
      hr(6);
    }

    function tableRow(row, zebra=false) {
      const y = doc.y;
      if (zebra) {
        doc.save().rect(doc.x-2, y-3, doc.page.width - doc.page.margins.left - doc.page.margins.right + 4,
          doc.currentLineHeight()+6).fill(COLOR.zebra).restore();
      }
      columns.forEach((col, i) => {
        const txt = String(row[col.key] ?? "");
        doc.font("Helvetica").fontSize(10).fillColor(COLOR.primary)
          .text(txt, {continued: i !== columns.length-1, width: col.width});
      });
      doc.text("");
    }

    function ensureSpace(lines=1.4) {
      if (doc.y > doc.page.height - doc.page.margins.bottom - lines*14) doc.addPage();
    }

    tableHeader();

    if (!historial.length) {
      tableRow({fecha:"—", accion:"—", campo:"—", anterior:"—", nuevo:"—", autor:"—"});
    } else {
      historial.forEach((h, idx) => {
        ensureSpace(3);
        const row = {
          fecha:  h.fecha ? dayjs(h.fecha).format("DD/MM/YYYY HH:mm") : "-",
          accion: h.accion || "",
          campo:  h.campo || "",
          anterior: h.valor_anterior || "",
          nuevo:    h.valor_nuevo || "",
          autor:  h.usuario_nombre ? `${h.usuario_nombre} (${h.usuario_rol || ""})` : (h.usuario_rol || "-")
        };
        tableRow(row, idx % 2 === 1);

        if ((h.comentario || "").trim()) {
          ensureSpace(2);
          doc.moveDown(0.15);
          doc.font("Helvetica-Oblique").fontSize(10).fillColor(COLOR.muted)
            .text(`Comentario: ${h.comentario}`, {width: doc.page.width - doc.page.margins.left - doc.page.margins.right});
          doc.moveDown(0.2);
        }
      });
    }

    // Pie de página (número de páginas)
    pageFooter();
    doc.end();
  } catch (err) {
    console.error("Error GET /api/entregas/:id/reporte.pdf:", err);
    res.status(500).json({ error: "No se pudo generar el PDF" });
  }
});

export default router;

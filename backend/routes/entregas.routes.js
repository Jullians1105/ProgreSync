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

console.log("✅ entregas.routes.js cargado");

/* ────────────────────── Multer ────────────────────── */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, "uploads"),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext)
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/gi, "-")
      .slice(0, 50);
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${base}-${unique}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

/* ────────────────────── Diagnóstico ────────────────────── */
router.get("/__ping", (_req, res) =>
  res.json({ ok: true, from: "entregas.routes.js" })
);

/* ────────────────────── Crear entrega ────────────────────── */
router.post("/", upload.single("archivo"), async (req, res) => {
  try {
    const { titulo, descripcion, id_estudiante } = req.body;
    if (!titulo || !id_estudiante || !req.file) {
      return res.status(400).json({ error: "Faltan campos o archivo" });
    }

    const archivoUrl = `/uploads/${req.file.filename}`;
    const estado = "en_revision";

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
      detalle: { titulo, archivo: archivoUrl },
    });

    // Historial inicial
    try {
      const usuarioId2 = req.session?.user?.id ?? Number(id_estudiante);
      await pool.query(
        `INSERT INTO historial_entregas
         (entrega_id, usuario_id, usuario_rol, accion, campo, valor_anterior, valor_nuevo, comentario, fecha)
         VALUES (?,?,?,?,?,?,?,?, NOW())`,
        [nuevaId, usuarioId2, "estudiante", "CREACION", "estado", null, "en_revision",
          JSON.stringify({ titulo, archivo: archivoUrl })]
      );
      await pool.query(
        `INSERT INTO historial_entregas
         (entrega_id, usuario_id, usuario_rol, accion, campo, valor_anterior, valor_nuevo, comentario, fecha)
         VALUES (?,?,?,?,?,?,?,?, NOW())`,
        [nuevaId, usuarioId2, "estudiante", "CAMBIO_ARCHIVO", "archivo", null, archivoUrl,
          "Archivo subido por el estudiante"]
      );
    } catch (e) {
      console.warn("⚠️ No se pudo registrar historial de creación:", e?.message);
    }

    // Notificar docentes
    try {
      const [[stu]] = await pool.query(
        `SELECT nombre FROM usuarios WHERE id = ? LIMIT 1`,
        [id_estudiante]
      );
      const estudianteNombre = stu?.nombre ?? "Estudiante";
      const [docentes] = await pool.query(
        `SELECT id FROM usuarios WHERE rol = 'docente'`
      );

      const datos = JSON.stringify({
        entrega_id: nuevaId,
        id_estudiante,
        tipo: "nueva_entrega",
        titulo,
        estudiante: estudianteNombre,
      });
      const mensajeBase =
        `Nueva entrega pendiente de revisión: "${titulo}" del estudiante ${estudianteNombre}`;

      for (const d of docentes) {
        try {
          await pool.query(
            `INSERT INTO notificaciones (id_usuario, tipo, mensaje, datos, leido, fecha)
             VALUES (?,?,?,?,0,NOW())`,
            [d.id, "nueva_entrega", mensajeBase, datos]
          );
        } catch (e) {
          console.error("⚠️ Error al notificar al docente", d.id, ":", e?.message);
        }
      }
    } catch (e) {
      console.error("⚠️ Error al crear notificaciones para docentes:", e?.message);
    }

    return res.status(201).json({ ok: true, archivo: archivoUrl });
  } catch (err) {
    console.error("Error POST /api/entregas:", err);
    return res.status(500).json({ error: "No se pudo registrar la entrega" });
  }
});

/* ────────────────────── Listar mis entregas ────────────────────── */
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

/* ────────────────────── Listas por estado ────────────────────── */
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

/* ────────────────────── Historial por entrega ────────────────────── */
router.get("/:id/historial", async (req, res) => {
  try {
    const entregaId = Number(req.params.id);
    if (!entregaId) return res.status(400).json({ error: "ID inválido" });

    const limit = Math.min(Math.max(parseInt(req.query.limit || "100", 10), 1), 500);
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const offset = (page - 1) * limit;

    const [rows] = await pool.query(
      `
      SELECT h.id, h.entrega_id, h.usuario_id, u.nombre AS usuario_nombre,
             h.usuario_rol, h.accion, h.campo, h.valor_anterior, h.valor_nuevo,
             h.comentario, h.fecha,
             CASE WHEN h.campo = 'estado' THEN h.valor_anterior ELSE NULL END AS estado_anterior,
             CASE WHEN h.campo = 'estado' THEN h.valor_nuevo    ELSE NULL END AS estado_nuevo
      FROM historial_entregas h
      LEFT JOIN usuarios u ON u.id = h.usuario_id
      WHERE h.entrega_id = ?
      ORDER BY h.fecha DESC
      LIMIT ? OFFSET ?`,
      [entregaId, limit, offset]
    );

    res.json(rows);
  } catch (err) {
    console.error("Error GET /api/entregas/:id/historial:", err);
    res.status(500).json({ error: "No se pudo obtener el historial" });
  }
});

/* ────────────────────── Cambiar estado ────────────────────── */
router.patch("/:id/estado", async (req, res) => {
  try {
    const usuarioId = req.session?.user?.id || req.body?.usuario_id || req.headers["x-user-id"];
    const usuarioRol = req.session?.user?.rol || req.headers["x-user-role"];
    if (!usuarioId) return res.status(401).json({ error: "No autenticado. Por favor, inicia sesión nuevamente." });
    if (usuarioRol !== "docente" && usuarioRol !== "admin") {
      return res.status(403).json({ error: "Solo los docentes pueden calificar entregas." });
    }

    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID inválido" });

    const estadoIn = String(req.body?.estado || "").toLowerCase();
    let dbEstado = "en_revision";
    if (estadoIn.includes("aprob")) dbEstado = "aprobado";
    else if (estadoIn.includes("rechaz")) dbEstado = "rechazado";

    const comentario = String(req.body?.comentario || "").trim() || null;

    const [[actual]] = await pool.query(
      `SELECT estado AS estado_actual, comentario_docente AS comentario_actual
       FROM entregas WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!actual) return res.status(404).json({ error: "Entrega no encontrada" });

    const [result] = await pool.query(
      `UPDATE entregas SET estado = ?, comentario_docente = ? WHERE id = ?`,
      [dbEstado, comentario, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "Entrega no encontrada" });

    try {
      const [entRows] = await pool.query(
        `SELECT id_estudiante, titulo FROM entregas WHERE id = ? LIMIT 1`,
        [id]
      );
      const entrega = entRows[0];
      if (entrega) {
        const mensaje = `Tu entrega "${entrega.titulo}" cambió a ${dbEstado}.` + (comentario ? ` Comentario: ${comentario}` : "");
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

    try {
      await pool.query(
        `INSERT INTO historial_entregas
         (entrega_id, usuario_id, usuario_rol, accion, campo, valor_anterior, valor_nuevo, comentario, fecha)
         VALUES (?,?,?,?,?,?,?,?, NOW())`,
        [id, usuarioId, usuarioRol, "CAMBIO_ESTADO", "estado", actual.estado_actual ?? null, dbEstado, comentario]
      );
    } catch (e) {
      console.warn("⚠️ No se pudo registrar historial de cambio:", e?.message);
    }

    return res.json({ ok: true, id, estado: dbEstado, comentario });
  } catch (err) {
    console.error("Error PATCH /api/entregas/:id/estado:", err);
    return res.status(500).json({ error: "No se pudo actualizar el estado" });
  }
});

/* ────────────────────── Exportar PDF ────────────────────── */
router.get("/:id/reporte.pdf", async (req, res) => {
  try {
    const entregaId = Number(req.params.id);
    if (!entregaId) return res.status(400).json({ error: "ID inválido" });

    const [[header]] = await pool.query(
      `SELECT e.id, e.titulo, e.descripcion, e.estado, e.archivo, e.fecha,
              u.nombre AS estudiante_nombre, u.email AS estudiante_email
       FROM entregas e
       LEFT JOIN usuarios u ON u.id = e.id_estudiante
       WHERE e.id = ? LIMIT 1`,
      [entregaId]
    );
    if (!header) return res.status(404).json({ error: "Entrega no encontrada" });

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

    const base = sanitizeFilename(header.titulo || `entrega_${entregaId}`);
    const stamp = dayjs().format("YYYY-MM-DD_HH-mm");
    const filename = `${base}__${stamp}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const doc = new PDFDocument({
      size: "A4",
      margin: 56,
      bufferPages: true,
      info: {
        Title: `Historial de entrega: ${header.titulo || "-"}`,
        Author: "ProgreSync",
        Creator: "ProgreSync",
      },
    });
    doc.pipe(res);

    /* ====== helpers ====== */
    const COLOR = {
      primary: "#1f2937",
      accent:  "#f59e0b",
      muted:   "#6b7280",
      good:    "#16a34a",
      warn:    "#f59e0b",
      bad:     "#dc2626",
      line:    "#e5e7eb",
      zebra:   "#f8fafc",
    };
    const PAGE_X = doc.page.margins.left;
    const PAGE_W = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    function hr() {
      const y = doc.y;
      doc.strokeColor(COLOR.line).lineWidth(1)
        .moveTo(PAGE_X, y).lineTo(PAGE_X + PAGE_W, y).stroke();
      doc.moveDown(0.6);
    }
    function badge(text, type = "muted") {
      const bg = type === "good" ? "#dcfce7" : type === "bad" ? "#fee2e2" : type === "warn" ? "#fef3c7" : "#e5e7eb";
      const fg = type === "good" ? COLOR.good : type === "bad" ? COLOR.bad : type === "warn" ? COLOR.warn : COLOR.primary;
      const x = doc.x, y = doc.y;
      const padX = 6, padY = 2;
      const w = doc.widthOfString(String(text)) + padX * 2;
      const h = doc.currentLineHeight() + padY * 2;
      doc.save().rect(x, y, w, h).fill(bg).restore();
      doc.fillColor(fg).text(text, x + padX, y + padY);
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
        doc.text(text, PAGE_X + PAGE_W - w, doc.page.height - doc.page.margins.bottom + 12);
      }
    }

    /* ====== Encabezado ====== */
    doc.font("Helvetica-Bold").fontSize(22).fillColor(COLOR.primary).text("Progre", { continued: true });
    doc.fillColor(COLOR.accent).text("Sync");
    doc.moveDown(0.3);
    doc.font("Helvetica-Bold").fontSize(16).fillColor(COLOR.primary).text("Reporte de historial de entrega");
    doc.moveDown(0.6);

    // Dos columnas; igualamos alturas
    const COL_A_W = Math.min(320, PAGE_W * 0.55);
    const GAP = 24;
    const COL_B_X = PAGE_X + COL_A_W + GAP;
    const startY = doc.y;

    // Columna izquierda
    doc.x = PAGE_X; doc.y = startY;
    const yA = (() => {
      const x0 = doc.x, y0 = doc.y;
      doc.font("Helvetica").fontSize(10).fillColor(COLOR.muted).text("Título:", { continued: true });
      doc.font("Helvetica-Bold").fillColor(COLOR.primary).text(` ${header.titulo || "-"}`, { width: COL_A_W });
      doc.font("Helvetica").fillColor(COLOR.muted).text("Estudiante:", { continued: true });
      doc.font("Helvetica-Bold").fillColor(COLOR.primary)
        .text(` ${header.estudiante_nombre || "-"} <${header.estudiante_email || "-"}>`, { width: COL_A_W });
      doc.font("Helvetica").fillColor(COLOR.muted).text("Archivo:", { continued: true });
      doc.font("Helvetica").fillColor(COLOR.primary).text(` ${header.archivo || "-"}`, { width: COL_A_W });
      doc.font("Helvetica").fillColor(COLOR.muted).text("Fecha de creación:", { continued: true });
      doc.font("Helvetica-Bold").fillColor(COLOR.primary)
        .text(` ${header.fecha ? dayjs(header.fecha).format("DD/MM/YYYY HH:mm") : "-"}`, { width: COL_A_W });
      doc.font("Helvetica").fillColor(COLOR.muted).text("Exportado:", { continued: true });
      doc.font("Helvetica-Bold").fillColor(COLOR.primary).text(` ${dayjs().format("DD/MM/YYYY HH:mm")}`, { width: COL_A_W });
      return doc.y;
    })();

    // Columna derecha
    doc.x = COL_B_X; doc.y = startY;
    const yB = (() => {
      doc.font("Helvetica-Bold").fontSize(11).fillColor(COLOR.primary).text("Estado actual:");
      const stateMap = { aprobado: "good", en_revision: "warn", rechazado: "bad" };
      badge((header.estado || "—"), stateMap[header.estado] || "muted");
      doc.moveDown(0.6);
      doc.font("Helvetica-Bold").fontSize(11).fillColor(COLOR.primary).text("Descripción");
      doc.moveDown(0.2);
      doc.font("Helvetica").fontSize(10.5).fillColor(COLOR.primary)
        .text(String(header.descripcion || "—"), { width: PAGE_W - COL_A_W - GAP });
      return doc.y;
    })();

    // Igualar altura y separar
    doc.y = Math.max(yA, yB);
    doc.moveDown(0.6);
    hr();

    /* ====== Tabla historial ====== */
    doc.font("Helvetica-Bold").fontSize(13).fillColor(COLOR.primary).text("Historial de cambios");
    doc.moveDown(0.3);

    // Anchos que caben en la página (≈ PAGE_W)
    const columns = [
      { key: "fecha",    label: "Fecha",    width: 90 },
      { key: "accion",   label: "Acción",   width: 85 },
      { key: "campo",    label: "Campo",    width: 70 },
      { key: "anterior", label: "Anterior", width: 105 },
      { key: "nuevo",    label: "Nuevo",    width: 105 },
      { key: "autor",    label: "Autor",    width: PAGE_W - (90 + 85 + 70 + 105 + 105) },
    ];

    // Altura unificada por fila (evita solapes)
    const CELL_PAD_X = 3, CELL_PAD_Y = 3;

    function computeRowHeight(row, isHeader = false) {
      const texts = isHeader
        ? columns.map(c => c.label)
        : columns.map(c => String(row[c.key] ?? ""));
      const heights = texts.map((t, i) =>
        doc.heightOfString(t, { width: columns[i].width - CELL_PAD_X * 2 })
      );
      return Math.max(...heights) + CELL_PAD_Y * 2;
    }

    function ensureSpace(minHeight) {
      const available = doc.page.height - doc.page.margins.bottom - doc.y;
      if (available < minHeight) doc.addPage();
    }

    function drawRow(row, { header = false, zebra = false } = {}) {
      const rowH = computeRowHeight(row, header);
      ensureSpace(rowH + 6);

      const y = doc.y;
      if (header) {
        doc.save().rect(PAGE_X, y, PAGE_W, rowH).fill("#f3f4f6").restore();
      } else if (zebra) {
        doc.save().rect(PAGE_X, y, PAGE_W, rowH).fill(COLOR.zebra).restore();
      }

      let x = PAGE_X;
      columns.forEach((col, idx) => {
        const txt = header ? col.label : String(row[col.key] ?? "");
        doc.font(header ? "Helvetica-Bold" : "Helvetica")
          .fontSize(10).fillColor(COLOR.primary)
          .text(txt, x + CELL_PAD_X, y + CELL_PAD_Y, {
            width: col.width - CELL_PAD_X * 2,
            align: "left",
          });
        x += col.width;
      });

      doc.y = y + rowH;
    }

    // Header + filas
    drawRow({}, { header: true });
    if (!historial.length) {
      drawRow({ fecha: "—", accion: "—", campo: "—", anterior: "—", nuevo: "—", autor: "—" });
    } else {
      historial.forEach((h, idx) => {
        const row = {
          fecha:  h.fecha ? dayjs(h.fecha).format("DD/MM/YYYY HH:mm") : "-",
          accion: h.accion || "",
          campo:  h.campo || "",
          anterior: h.valor_anterior || "",
          nuevo:    h.valor_nuevo || "",
          autor:  h.usuario_nombre ? `${h.usuario_nombre} (${h.usuario_rol || ""})` : (h.usuario_rol || "-"),
        };
        drawRow(row, { zebra: idx % 2 === 1 });

        // Comentario debajo (bloque completo)
        if ((h.comentario || "").trim()) {
          const commentText = `Comentario: ${h.comentario}`;
          const commentH = doc.heightOfString(commentText, { width: PAGE_W }) + 4;
          ensureSpace(commentH);
          doc.moveDown(0.05);
          doc.font("Helvetica-Oblique").fontSize(10).fillColor(COLOR.muted)
            .text(commentText, PAGE_X, doc.y, { width: PAGE_W });
          doc.moveDown(0.15);
        }
      });
    }

    pageFooter();
    doc.end();
  } catch (err) {
    console.error("Error GET /api/entregas/:id/reporte.pdf:", err);
    res.status(500).json({ error: "No se pudo generar el PDF" });
  }
});

export default router;

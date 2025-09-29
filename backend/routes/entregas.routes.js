// backend/routes/entregas.routes.js
import { Router } from "express";
import multer from "multer";
import path from "path";
import { pool } from "../services/db.js";

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
    const { titulo, descripcion, id_estudiante } = req.body;
    if (!titulo || !id_estudiante || !req.file) {
      return res.status(400).json({ error: "Faltan campos o archivo" });
    }

    const archivoUrl = `/uploads/${req.file.filename}`;
    const estado = "en_revision";

    await pool.query(
      `INSERT INTO entregas (id_estudiante, titulo, descripcion, archivo, estado, fecha)
       VALUES (?,?,?,?,?, NOW())`,
      [id_estudiante, titulo, descripcion ?? null, archivoUrl, estado]
    );

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
    res
      .status(500)
      .json({ error: "No se pudieron obtener las entregas" });
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
    res
      .status(500)
      .json({ error: "No se pudieron obtener las pendientes" });
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
    res
      .status(500)
      .json({ error: "No se pudieron obtener las aprobadas" });
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
    res
      .status(500)
      .json({ error: "No se pudieron obtener las rechazadas" });
  }
});

/* ────────────────────── Cambiar estado (Docente) ──────────────────────
   PATCH /api/entregas/:id/estado
*/
router.patch("/:id/estado", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID inválido" });

    // Mapeo del estado del front → valores en BD
    const estadoIn = String(req.body?.estado || "").toLowerCase();
    let dbEstado = "en_revision";
    if (estadoIn.includes("aprob")) dbEstado = "aprobado";
    else if (estadoIn.includes("rechaz")) dbEstado = "rechazado";

    // Comentario opcional
    const comentario = String(req.body?.comentario || "").trim();
    if (comentario) {
      console.log(
        `[DOCENTE] Comentario en revisión entrega ${id}:`,
        comentario
      );
    }

    // Update con comentario_docente
    const [result] = await pool.query(
      `UPDATE entregas
         SET estado = ?, comentario_docente = ?
       WHERE id = ?`,
      [dbEstado, comentario || null, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Entrega no encontrada" });
    }

    // Respuesta
    return res.json({
      ok: true,
      id,
      estado: dbEstado,
      comentario: comentario || null,
    });
  } catch (err) {
    console.error("Error PATCH /api/entregas/:id/estado:", err);
    return res
      .status(500)
      .json({ error: "No se pudo actualizar el estado" });
  }
});

export default router;

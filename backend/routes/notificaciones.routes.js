import { Router } from "express";
import { pool } from "../services/db.js";

const router = Router();

console.log("✅ notificaciones.routes.js cargado");

// Middleware de autenticación
const requireAuth = (req, res, next) => {
  if (!req.session?.user?.id) {
    return res.status(401).json({ error: "No autenticado. Por favor, inicia sesión nuevamente." });
  }
  next();
};

// Helper para obtener id de usuario: preferir sesión, si no usar parámetro
function getUserId(req) {
  const sid = req.session?.user?.id;
  if (sid) return sid;
  const p = req.params?.id_usuario ? Number(req.params.id_usuario) : null;
  return p;
}

/* Listar notificaciones del usuario autenticado
   GET /api/notificaciones/mis
   (si quieres, también puedes usar /mis/:id_usuario para debug)
*/
router.get("/mis", requireAuth, async (req, res) => {
  try {
    const id_usuario = req.session.user.id; // Ya sabemos que existe por el middleware

    const [rows] = await pool.query(
      `SELECT id, tipo, mensaje, datos, leido, fecha
       FROM notificaciones
       WHERE id_usuario = ?
       ORDER BY fecha DESC`,
      [id_usuario]
    );
    res.json(rows);
  } catch (err) {
    console.error("Error GET /api/notificaciones/mis:", err);
    res.status(500).json({ error: "No se pudieron obtener las notificaciones" });
  }
});

// Ruta de compatibilidad/depuración: permite pasar id por URL
router.get("/mis/:id_usuario", async (req, res) => {
  try {
    const id_usuario = Number(req.params.id_usuario);
    if (!id_usuario) return res.status(400).json({ error: "ID inválido" });

    const [rows] = await pool.query(
      `SELECT id, tipo, mensaje, datos, leido, fecha
       FROM notificaciones
       WHERE id_usuario = ?
       ORDER BY fecha DESC`,
      [id_usuario]
    );
    res.json(rows);
  } catch (err) {
    console.error("Error GET /api/notificaciones/mis/:id_usuario:", err);
    res.status(500).json({ error: "No se pudieron obtener las notificaciones" });
  }
});

/* Contador de no leídas
   GET /api/notificaciones/mis/unread_count
*/
router.get("/mis/unread_count", async (req, res) => {
  try {
    const id_usuario = req.session?.user?.id;
    if (!id_usuario) return res.status(401).json({ error: "No autenticado" });

    const [rows] = await pool.query(
      `SELECT COUNT(*) AS count FROM notificaciones WHERE id_usuario = ? AND leido = 0`,
      [id_usuario]
    );
    res.json({ unread: rows[0].count });
  } catch (err) {
    console.error("Error GET /api/notificaciones/mis/unread_count:", err);
    res.status(500).json({ error: "No se pudo obtener el contador" });
  }
});

// Compatibilidad: mantener /mis/unread_count/:id_usuario
router.get("/mis/unread_count/:id_usuario", async (req, res) => {
  try {
    const id_usuario = Number(req.params.id_usuario);
    if (!id_usuario) return res.status(400).json({ error: "ID inválido" });

    const [rows] = await pool.query(
      `SELECT COUNT(*) AS count FROM notificaciones WHERE id_usuario = ? AND leido = 0`,
      [id_usuario]
    );
    res.json({ unread: rows[0].count });
  } catch (err) {
    console.error("Error GET /api/notificaciones/mis/unread_count/:id_usuario:", err);
    res.status(500).json({ error: "No se pudo obtener el contador" });
  }
});

/* Marcar notificación como leída
   PATCH /api/notificaciones/:id/read
   Verifica que la notificación pertenezca al usuario autenticado (si hay sesión)
*/
router.patch("/:id/read", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID inválido" });

    // Si hay sesión, verificar que la notificación pertenezca a ese usuario
    const uid = req.session?.user?.id;
    if (uid) {
      const [rows] = await pool.query(`SELECT id_usuario FROM notificaciones WHERE id = ? LIMIT 1`, [id]);
      const n = rows[0];
      if (!n) return res.status(404).json({ error: "Notificación no encontrada" });
      if (n.id_usuario !== uid) return res.status(403).json({ error: "No autorizado" });
    }

    const [result] = await pool.query(
      `UPDATE notificaciones SET leido = 1 WHERE id = ?`,
      [id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "Notificación no encontrada" });
    res.json({ ok: true });
  } catch (err) {
    console.error("Error PATCH /api/notificaciones/:id/read:", err);
    res.status(500).json({ error: "No se pudo marcar como leída" });
  }
});

export default router;

// backend/routes/usuarios.routes.js
import { Router } from "express";
import { pool } from "../bd.js";
import bcrypt from "bcryptjs";

const router = Router();

/* ========== LISTAR ========== */
router.get("/", async (req, res, next) => {
  try {
    const { q = "", estado = "" } = req.query;

    // Filtros: búsqueda por nombre/email y estado si viene
    const where = [];
    const params = [];

    if (q) {
      where.push("(nombre LIKE ? OR email LIKE ?)");
      params.push(`%${q}%`, `%${q}%`);
    }
    if (estado) {
      where.push("estado = ?");
      params.push(estado);
    }

    const sql = `
      SELECT id, nombre, email, rol, estado
      FROM usuarios
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY id ASC
    `;

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("❌ Error listando usuarios:", err);
    next(err);
  }
});

/* ========== CREAR ========== */
router.post("/", async (req, res, next) => {
  try {
    const { nombre, email, rol, password } = req.body || {};
    if (!nombre || !email || !rol || !password) {
      return res.status(400).json({ detail: "Faltan campos obligatorios" });
    }
    if (password.length < 8) {
      return res.status(400).json({ detail: "La contraseña debe tener al menos 8 caracteres" });
    }

    // ¿ya existe email?
    const [exists] = await pool.query("SELECT id FROM usuarios WHERE email = ?", [email]);
    if (exists.length) return res.status(409).json({ detail: "El email ya está registrado" });

    const hash = await bcrypt.hash(password, 10);

    const [r] = await pool.query(
      "INSERT INTO usuarios (nombre, email, password_hash, rol, estado) VALUES (?, ?, ?, ?, 'activo')",
      [nombre, email, hash, rol]
    );

    const nuevo = { id: r.insertId, nombre, email, rol, estado: "activo" };
    res.status(201).json(nuevo);
  } catch (err) {
    console.error("❌ Error creando usuario:", err);
    next(err);
  }
});

/* ========== ACTUALIZAR ========== */
router.put("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { nombre, email, rol } = req.body || {};
    if (!nombre || !email || !rol) {
      return res.status(400).json({ detail: "Faltan campos obligatorios" });
    }

    // evitar choque de email con otros usuarios
    const [dup] = await pool.query("SELECT id FROM usuarios WHERE email = ? AND id <> ?", [email, id]);
    if (dup.length) return res.status(409).json({ detail: "Ese email ya está usado por otro usuario" });

    const [r] = await pool.query(
      "UPDATE usuarios SET nombre = ?, email = ?, rol = ? WHERE id = ?",
      [nombre, email, rol, id]
    );

    if (!r.affectedRows) return res.status(404).json({ detail: "Usuario no encontrado" });
    res.json({ id: Number(id), nombre, email, rol });
  } catch (err) {
    console.error("❌ Error actualizando usuario:", err);
    next(err);
  }
});

/* ========== ACTIVAR/DESACTIVAR ========== */
router.patch("/:id/activar", async (req, res, next) => {
  try {
    const { id } = req.params;
    const [r] = await pool.query("UPDATE usuarios SET estado = 'activo' WHERE id = ?", [id]);
    if (!r.affectedRows) return res.status(404).json({ detail: "Usuario no encontrado" });
    res.json({ id: Number(id), estado: "activo" });
  } catch (err) { next(err); }
});

router.patch("/:id/desactivar", async (req, res, next) => {
  try {
    const { id } = req.params;
    const [r] = await pool.query("UPDATE usuarios SET estado = 'inactivo' WHERE id = ?", [id]);
    if (!r.affectedRows) return res.status(404).json({ detail: "Usuario no encontrado" });
    res.json({ id: Number(id), estado: "inactivo" });
  } catch (err) { next(err); }
});

export default router;

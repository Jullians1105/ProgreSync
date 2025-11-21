// backend/routes/usuarios.routes.js
import { Router } from "express";
import { pool } from "../services/db.js";
import bcrypt from "bcryptjs";

const router = Router();

/* ─ LISTAR: GET /usuarios?q=&estado= ─ */
router.get("/", async (req, res, next) => {
  try {
    const { q = "", estado = "" } = req.query;
    const where = [];
    const params = [];
    if (q) {
      where.push("(nombre LIKE ? OR email LIKE ? OR telefono LIKE ?)");
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (estado) {
      where.push("estado = ?");
      params.push(estado);
    }

    const sql = `
      SELECT id, nombre, email, telefono, rol, estado
      FROM usuarios
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY id ASC
    `;
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("Error listando usuarios:", err);
    next(err);
  }
});

/* ─ OBTENER POR ID: GET /usuarios/:id ─ */
router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      "SELECT id, nombre, email, telefono, rol, estado FROM usuarios WHERE id = ?",
      [id]
    );
    if (!rows.length) return res.status(404).json({ detail: "Usuario no encontrado" });
    res.json(rows[0]);
  } catch (err) {
    console.error("Error obteniendo usuario:", err);
    next(err);
  }
});

/* ─ CREAR: POST /usuarios ─ */
router.post("/", async (req, res, next) => {
  try {
    const { nombre, email, telefono, rol, password, estado = "activo" } = req.body || {};
    // Validación de teléfono
    if (telefono && !/^[0-9]{10}$/.test(telefono)) {
    return res.status(400).json({ detail: "El teléfono debe tener exactamente 10 dígitos numéricos" });
  }

    if (!nombre || !email || !rol || !password) {
      return res.status(400).json({ detail: "Faltan campos obligatorios" });
    }
    if (password.length < 8) {
      return res.status(400).json({ detail: "La contraseña debe tener al menos 8 caracteres" });
    }
    const [exists] = await pool.query("SELECT id FROM usuarios WHERE email = ?", [email]);
    if (exists.length) return res.status(409).json({ detail: "El email ya está registrado" });

    const hash = await bcrypt.hash(password, 10);

    const sql = `
      INSERT INTO usuarios (nombre, email, telefono, password_hash, rol, estado)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const params = [nombre, email, telefono || null, hash, rol, estado];

    const [r] = await pool.query(sql, params);

    // agregar el telefono
    res.status(201).json({
      id: r.insertId,
      nombre,
      email,
      telefono: telefono || null,
      rol,
      estado,
    });
  } catch (err) {
    console.error("Error creando usuario:", err);
    next(err);
  }
});

/* ─ ACTUALIZAR: PUT /usuarios/:id ─ */
router.put("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { nombre, email, telefono, rol, estado, password } = req.body || {};

    if (!nombre || !email || !rol || !estado) {
      return res.status(400).json({ detail: "Faltan campos obligatorios" });
    }

    // duplicado de email en otro usuario
    const [dup] = await pool.query(
      "SELECT id FROM usuarios WHERE email = ? AND id <> ?",
      [email, id]
    );
    if (dup.length) return res.status(409).json({ detail: "Ese email ya está usado por otro usuario" });

    // existe?
    const [ex] = await pool.query("SELECT id FROM usuarios WHERE id = ?", [id]);
    if (!ex.length) return res.status(404).json({ detail: "Usuario no encontrado" });

    if (password && String(password).trim() !== "") {
      if (String(password).length < 8) {
        return res.status(400).json({ detail: "La contraseña debe tener al menos 8 caracteres" });
      }
      const hash = await bcrypt.hash(password, 10);

      await pool.query(
        `
        UPDATE usuarios
        SET nombre = ?, email = ?, telefono = ?, rol = ?, estado = ?, password_hash = ?
        WHERE id = ?
        `,
        [nombre, email, telefono || null, rol, estado, hash, id]
      );
    } else {
      await pool.query(
        `
        UPDATE usuarios
        SET nombre = ?, email = ?, telefono = ?, rol = ?, estado = ?
        WHERE id = ?
        `,
        [nombre, email, telefono || null, rol, estado, id]
      );
    }

    const [rows] = await pool.query(
      "SELECT id, nombre, email, telefono, rol, estado FROM usuarios WHERE id = ?",
      [id]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error("Error actualizando usuario:", err);
    next(err);
  }
});

/* ─ CAMBIAR ESTADO: PATCH /usuarios/:id/estado ─ */
router.patch("/:id/estado", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { estado } = req.body || {};

    if (!["activo", "inactivo"].includes(estado || "")) {
      return res.status(400).json({ detail: "estado inválido" });
    }

    const [r] = await pool.query(
      "UPDATE usuarios SET estado = ? WHERE id = ?",
      [estado, id]
    );
    if (!r.affectedRows) return res.status(404).json({ detail: "Usuario no encontrado" });

    const [rows] = await pool.query(
      "SELECT id, nombre, email, telefono, rol, estado FROM usuarios WHERE id = ?",
      [id]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error("Error cambiando estado:", err);
    next(err);
  }
});

/* ─ Compatibilidad: /activar y /desactivar ─ */
router.patch("/:id/activar", async (req, res, next) => {
  try {
    const { id } = req.params;
    const [r] = await pool.query("UPDATE usuarios SET estado = 'activo' WHERE id = ?", [id]);
    if (!r.affectedRows) return res.status(404).json({ detail: "Usuario no encontrado" });

    res.json({ id: Number(id), estado: "activo" });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/desactivar", async (req, res, next) => {
  try {
    const { id } = req.params;
    const [r] = await pool.query("UPDATE usuarios SET estado = 'inactivo' WHERE id = ?", [id]);
    if (!r.affectedRows) return res.status(404).json({ detail: "Usuario no encontrado" });

    res.json({ id: Number(id), estado: "inactivo" });
  } catch (err) {
    next(err);
  }
});

export default router;

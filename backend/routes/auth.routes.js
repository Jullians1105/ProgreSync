// backend/routes/auth.routes.js
import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../services/db.js";

const router = Router();

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ ok: false, message: "Email y contraseña requeridos" });
    }

    const [rows] = await pool.query(
      "SELECT id, nombre, email, rol, password_hash FROM usuarios WHERE email = ? LIMIT 1",
      [email]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ ok: false, message: "Credenciales inválidas" });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ ok: false, message: "Credenciales inválidas" });

    req.session.user = {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
    };

    res.json({ ok: true, user: req.session.user });
  } catch (err) {
    console.error("LOGIN_ERROR:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
});

// GET /api/auth/me
router.get("/me", (req, res) => {
  res.json({ ok: true, user: req.session?.user ?? null });
});

// POST /api/auth/logout
router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("sid");
    res.json({ ok: true });
  });
});

export default router;

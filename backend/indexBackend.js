import express from "express";
import cors from "cors";
import session from "express-session";
import usuariosRouter from "./routes/usuarios.routes.js"; // ⬅️ nuevo
import { pool } from "./services/db.js"; // ya lo usas para ping-db

const app = express();

app.use(cors({
  origin: ["http://127.0.0.1:5500","http://localhost:5500"],
  credentials: true
}));
app.use(express.json());

// si usas sesión:
app.use(session({
  secret: "progresync-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true }
}));

// 🔗 monta la ruta
app.use("/usuarios", usuariosRouter);

// (opcional) health checks
app.get("/ping", (_req, res) => res.json({ ok: true }));
app.get("/ping-db", async (_req, res, next) => {
  try { const [r] = await pool.query("SELECT 1 AS ok"); res.json(r[0]); }
  catch (e) { next(e); }
});

// middleware de errores
// al final de tus rutas:
app.use((err, req, res, _next) => {
  console.error("💥 Error no controlado:", err);           // log completo en consola
  res.status(500).json({
    detail: err.message || "internal-error",
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack
  });
});

const PORT = 8000;
app.listen(PORT, () => console.log(`API en http://127.0.0.1:${PORT}`));

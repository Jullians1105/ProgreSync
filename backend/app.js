// backend/app.js

import express from "express";
import cors from "cors";
import session from "express-session";
import bcrypt from "bcryptjs";
import path from "path";
import { fileURLToPath } from "url";

// Conexión y rutas
import { pool } from "./services/db.js";
import entregasRoutes from "./routes/entregas.routes.js";
import notificacionesRoutes from "./routes/notificaciones.routes.js";
import historialRoutes from "./routes/historial.routes.js";
import auditoriaRoutes from "./routes/auditoria.routes.js";
import empresaRoutes from "./routes/empresa.routes.js";
import usuariosRoutes from "./routes/usuarios.routes.js";
import { auditMutatingRequests } from "./middlewares/audit.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* =========================
   Configuración de CORS
========================= */
const ALLOWED_ORIGINS = [
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://127.0.0.7:5500",
  "http://localhost:5173",
];

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // requests del mismo origen (extensiones, curl, etc.)
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS: " + origin));
    },
    credentials: true,
  })
);

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
   Sesiones
========================= */
app.set("trust proxy", 1);
app.use(
  session({
    name: "sid",
    secret: "clave_de_sesion_proyecto",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,           // true si usas HTTPS
      maxAge: 1000 * 60 * 60,  // 1 hora
    },
  })
);

/* =========================
   Helpers de request
========================= */
// Expone pool por si alguna ruta lo necesita
app.locals.pool = pool;

// Pasa la sesión a req.user para que la auditoría conozca al usuario
app.use((req, _res, next) => {
  if (req.session?.user) req.user = req.session.user;
  next();
});

/* =========================
   Auditoría (mutaciones)
========================= */
app.use(auditMutatingRequests);

/* =========================
   Rutas base / salud
========================= */
app.get("/", (_req, res) => {
  res.send("Servidor backend funcionando");
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/db-test", async (_req, res) => {
  try {
    const [rows] = await pool.query("SELECT NOW() AS hora_actual");
    res.json(rows);
  } catch (err) {
    console.error("Error en /db-test:", err);
    res.status(500).json({ error: "No se pudo conectar a la base de datos" });
  }
});

/* =========================
   Autenticación
========================= */

// Login
app.post("/login", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({ error: "Faltan credenciales" });
    }

    const [rows] = await pool.query(
      "SELECT id, nombre, email, password_hash, rol, estado FROM usuarios WHERE email = ? LIMIT 1",
      [email]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: "Credenciales inválidas" });

    // Bloquear si está inactivo
    if (user.estado === "inactivo") {
      return res.status(403).json({ error: "Usuario desactivado" });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Credenciales inválidas" });

    req.session.user = {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
      role: user.rol, // compat
      estado: user.estado,
    };

    return res.json({ ok: true, user: req.session.user });
  } catch (err) {
    console.error("Error en login:", err);
    return res.status(500).json({ error: "Error en el inicio de sesión" });
  }
});

// Usuario actual
app.get("/me", (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "No autenticado" });
  const u = req.session.user;
  return res.json({ user: { ...u, rol: u.role, estado: u.estado } });
});

// Logout
app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("sid");
    res.status(204).end();
  });
});

/* =========================
   Roles helper
========================= */
function requireRole(...rolesPermitidos) {
  return async (req, res, next) => {
    const user = req.session?.user;
    if (!user) return res.status(401).json({ error: "No autenticado" });

    try {
      // Verificar estado actual en BD
      const [rows] = await pool.query(
        "SELECT estado, rol FROM usuarios WHERE id = ? LIMIT 1",
        [user.id]
      );
      const dbUser = rows[0];
      if (!dbUser) {
        req.session.destroy(() => {});
        return res.status(401).json({ error: "No autenticado" });
      }

      if (dbUser.estado === "inactivo") {
        req.session.destroy(() => {});
        return res.status(403).json({ error: "Usuario desactivado" });
      }

      const rol = dbUser.rol || user.rol || user.role;
      if (!rolesPermitidos.includes(rol)) {
        return res.status(403).json({ error: "Sin permisos" });
      }

      req.session.user.rol = rol;
      req.session.user.estado = dbUser.estado;
      next();
    } catch (err) {
      console.error("requireRole error:", err);
      return res.status(500).json({ error: "Error de autorización" });
    }
  };
}

/* =========================
   Gestión de usuarios (router)
========================= */
app.use("/usuarios", requireRole("admin"), usuariosRoutes);

/* =========================
   Archivos estáticos (uploads)
========================= */
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* =========================
   Rutas de módulos
========================= */
app.use("/api/entregas", entregasRoutes);
app.use("/api/historial", historialRoutes);
app.use("/auditoria", auditoriaRoutes);
app.use("/api/notificaciones", notificacionesRoutes);
app.use("/api/empresa", empresaRoutes);

/* =========================
  Rutas de notificaciones
  ========================= */
app.use("/api/notificaciones", notificacionesRoutes);

/* =========================
  Rutas de empresa
  ========================= */
app.use("/api/empresa", empresaRoutes);

/* =========================
   Debug de rutas registradas
========================= */
app.get("/debug/routes", (_req, res) => {
  const routes = [];
  const stack = app._router?.stack || [];
  for (const layer of stack) {
    if (layer.route && layer.route.path) {
      const methods = Object.keys(layer.route.methods)
        .filter((m) => layer.route.methods[m])
        .map((m) => m.toUpperCase());
      routes.push({ path: layer.route.path, methods });
    } else if (layer.name === "router" && layer.handle?.stack) {
      const mountPath = layer.regexp?.toString() || "";
      const prefix = mountPath
        .replace("/^\\", "/")
        .replace("\\/?(?=\\/|$)/i", "")
        .replace(/\\\//g, "/")
        .replace(/\$$/i, "");
      for (const r of layer.handle.stack) {
        if (r.route) {
          const methods = Object.keys(r.route.methods)
            .filter((m) => r.route.methods[m])
            .map((m) => m.toUpperCase());
          routes.push({
            path: `${prefix}${r.route.path}`.replace(/\/\//g, "/"),
            methods,
          });
        }
      }
    }
  }
  res.json(routes);
});

/* =========================
   Servidor
========================= */
const PORT = 8000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});

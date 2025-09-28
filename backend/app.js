// backend/app.js

// Express: servidor HTTP y enrutamiento
import express from "express";

// CORS: define qué frontend puede llamar a este backend
import cors from "cors";

// Sesiones: crea cookies de sesión en el navegador
import session from "express-session";

// Bcrypt: manejo de contraseñas con hash
import bcrypt from "bcryptjs";

// Rutas del módulo de entregas
import entregasRoutes from "./routes/entregas.routes.js";

// Conexión a MySQL
import { pool } from "./services/db.js";

// Static uploads (para servir archivos subidos)
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* =========================
   Configuración de CORS
   ========================= */
const ALLOWED_ORIGINS = [
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://127.0.0.7:5500", // Live Server
  "http://localhost:5173", // Vite
];

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // permite Postman/Thunder
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
      secure: false, // true solo si usas HTTPS
      maxAge: 1000 * 60 * 60, // 1 hora
    },
  })
);

/* =========================
   Middleware para roles
   ========================= */
function requireRole(...rolesPermitidos) {
  return (req, res, next) => {
    const user = req.session?.user;
    if (!user) return res.status(401).json({ error: "No autenticado" });
    const rol = user.rol || user.role; // tolerante
    if (!rolesPermitidos.includes(rol)) {
      return res.status(403).json({ error: "Sin permisos" });
    }
    next();
  };
}

/* =========================
   Rutas de salud y prueba
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
      "SELECT id, nombre, email, password_hash, rol FROM usuarios WHERE email = ? LIMIT 1",
      [email]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: "Credenciales inválidas" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Credenciales inválidas" });

    // Guarda ambas claves para compatibilidad (rol y role)
    req.session.user = {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
      role: user.rol,
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
  const u = req.session.user; // { id, email, role: 'docente' | 'estudiante' | ... }
  return res.json({ user: { ...u, rol: u.role } }); // exponemos ambas llaves: role y rol
});

// Logout
app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("sid");
    res.status(204).end();
  });
});

/* =========================
   Gestión de usuarios
   ========================= */

// Crear usuario (solo admin)
app.post("/usuarios", requireRole("admin"), async (req, res) => {
  try {
    const nombre = req.body?.nombre ?? null;
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const rol = String(req.body?.rol || "");

    if (!email || !password || !rol) {
      return res.status(400).json({ error: "email, password y rol son obligatorios" });
    }

    const rolesValidos = ["estudiante", "docente", "admin", "empresa"];
    if (!rolesValidos.includes(rol)) {
      return res.status(400).json({ error: "rol inválido" });
    }

    const [existe] = await pool.query("SELECT id FROM usuarios WHERE email = ? LIMIT 1", [email]);
    if (existe.length) return res.status(409).json({ error: "El email ya está registrado" });

    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      "INSERT INTO usuarios (nombre, email, rol, password_hash) VALUES (?,?,?,?)",
      [nombre, email, rol, hash]
    );

    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error("Error creando usuario:", err);
    return res.status(500).json({ error: "No se pudo crear el usuario" });
  }
});

// Listar usuarios (solo admin)
app.get("/usuarios", requireRole("admin"), async (_req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, nombre, email, rol, created_at FROM usuarios ORDER BY id"
    );
    return res.json({ ok: true, usuarios: rows });
  } catch (err) {
    console.error("Error listando usuarios:", err);
    return res.status(500).json({ error: "No se pudo obtener la lista de usuarios" });
  }
});

/* =========================
   Archivos subidos estáticos
   ========================= */
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* =========================
   Rutas de entregas
   ========================= */
// Montamos en /api/entregas para que el front use `${API_BASE}/api/entregas`
app.use("/api/entregas", entregasRoutes);

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
  console.log(`Servidor escuchando en http://${"localhost"}:${PORT}`);
});

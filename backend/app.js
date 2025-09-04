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

const app = express();

// Configuración de CORS (ajusta al puerto de tu frontend)
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);

// Middleware para leer JSON en peticiones
app.use(express.json());

// Configuración de sesiones
app.use(
  session({
    secret: "clave_de_sesion_proyecto",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60, // 1 hora
      sameSite: "lax",
      secure: false,
    },
  })
);

// Middleware para proteger rutas por rol
function requireRole(...rolesPermitidos) {
  return (req, res, next) => {
    const user = req.session?.user;
    if (!user) return res.status(401).json({ error: "No autenticado" });
    if (!rolesPermitidos.includes(user.role)) {
      return res.status(403).json({ error: "Sin permisos" });
    }
    next();
  };
}

// -------------------------------
// Rutas principales
// -------------------------------

// Salud del backend
app.get("/", (req, res) => {
  res.send("Servidor backend funcionando");
});

// Prueba de conexión a la BD
app.get("/db-test", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT NOW() AS hora_actual");
    res.json(rows);
  } catch (err) {
    console.error("Error en /db-test:", err);
    res.status(500).json({ error: "No se pudo conectar a la base de datos" });
  }
});

// Login
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Faltan credenciales" });
    }

    const [[user]] = await pool.query(
      "SELECT id, email, password_hash, rol FROM usuarios WHERE email = ? LIMIT 1",
      [email]
    );
    if (!user) return res.status(401).json({ error: "Credenciales inválidas" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Credenciales inválidas" });

    req.session.user = { id: user.id, email: user.email, role: user.rol };
    return res.json({ ok: true });
  } catch (err) {
    console.error("Error en login:", err);
    return res.status(500).json({ error: "Error en el inicio de sesión" });
  }
});

// Usuario actual
app.get("/me", (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "No autenticado" });
  res.json({ user: req.session.user });
});

// Logout
app.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// Creación de usuarios (solo admin)
app.post("/usuarios", requireRole("admin"), async (req, res) => {
  try {
    const { nombre, email, password, rol } = req.body || {};
    if (!email || !password || !rol) {
      return res.status(400).json({ error: "email, password y rol son obligatorios" });
    }

    const rolesValidos = ["estudiante", "docente", "admin", "empresa"];
    if (!rolesValidos.includes(rol)) {
      return res.status(400).json({ error: "rol inválido" });
    }

    const [existe] = await pool.query(
      "SELECT id FROM usuarios WHERE email = ? LIMIT 1",
      [email]
    );
    if (existe.length) return res.status(409).json({ error: "El email ya está registrado" });

    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      "INSERT INTO usuarios (nombre, email, rol, password_hash) VALUES (?,?,?,?)",
      [nombre || null, email, rol, hash]
    );

    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error("Error creando usuario:", err);
    return res.status(500).json({ error: "No se pudo crear el usuario" });
  }
});

// Rutas de entregas
app.use("/entregas", entregasRoutes);

// Debug de rutas registradas
app.get("/debug/routes", (req, res) => {
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

// Servidor escuchando
const PORT = 8000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});

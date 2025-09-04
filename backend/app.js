// backend/app.js

// Express: servidor HTTP y enrutamiento.
import express from "express";

// CORS: define qué origen (frontend) puede llamar a este backend desde el navegador.
import cors from "cors";

// Sesiones: gestiona una cookie de sesión por usuario.
import session from "express-session";

// Bcrypt: compara contraseñas con el hash guardado en la base de datos.
import bcrypt from "bcryptjs";

// Rutas del módulo de entregas.
import entregasRoutes from "./routes/entregas.routes.js";

// Pool de conexiones a MySQL.
import { pool } from "./services/db.js";

// Crear aplicación Express.
const app = express();

// CORS: pon aquí la URL de tu frontend.
// - Si usas Vite:  http://localhost:5173
// - Si usas Live Server: http://127.0.0.1:5500
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true, // permite que la cookie de sesión viaje en las solicitudes
  })
);

// Parseo de JSON en peticiones.
app.use(express.json());

// Sesiones en el servidor.
app.use(
  session({
    secret: "clave_de_sesion_proyecto",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60, // 1 hora
      sameSite: "lax",
      secure: false, // en producción con HTTPS debe ser true
    },
  })
);

// Middleware para exigir rol en rutas protegidas.
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

// Salud del backend.
app.get("/", (req, res) => {
  res.send("Servidor backend funcionando");
});

// Prueba de conexión a la base de datos.
app.get("/db-test", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT NOW() AS hora_actual");
    res.json(rows);
  } catch (err) {
    console.error("Error en /db-test:", err);
    res.status(500).json({ error: "No se pudo conectar a la base de datos" });
  }
});

// Autenticación: login.
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

// Autenticación: usuario actual.
app.get("/me", (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "No autenticado" });
  res.json({ user: req.session.user });
});

// Autenticación: logout.
app.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// Gestión de usuarios por admin.
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

// Rutas de entregas.
app.use("/entregas", entregasRoutes);

// Inspector de rutas para depuración.
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

// Arranque del servidor.
const PORT = 8000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});


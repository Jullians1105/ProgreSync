// backend/app.js

// Express: librería que utilizo para crear el servidor en Node.js y definir las rutas HTTP.
import express from "express";

// cors: me permite autorizar qué frontend puede comunicarse con mi servidor.
// Con esto evito que navegadores bloqueen las peticiones por políticas de seguridad.
import cors from "cors";

// express-session: lo uso para manejar sesiones en el servidor.
// Crea una cookie en el navegador del usuario donde se guarda un identificador de sesión.
import session from "express-session";

// bcryptjs: sirve para comparar contraseñas ingresadas por el usuario con las que tengo guardadas como hash en la base de datos.
// Así nunca guardo ni manejo contraseñas en texto plano.
import bcrypt from "bcryptjs";

// Importo mis rutas ya implementadas para el manejo de entregas de prácticas.
import entregasRoutes from "./routes/entregas.routes.js";

// Importo la conexión a MySQL (pool de conexiones).
// Este pool lo utilizo en las consultas a la base de datos.
import { pool } from "./services/db.js";

// Inicializo la aplicación de Express.
const app = express();

// Configuración de CORS.
// Aquí debo poner la URL del FRONTEND (no la del backend).
// Ejemplos:
// - Vite/React: "http://localhost:5173"
// - Live Server: "http://127.0.0.1:5500"
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true, // permite que la cookie de sesión viaje en las solicitudes
  })
);

// Permito que el servidor pueda leer cuerpos de peticiones en formato JSON.
app.use(express.json());

// Configuración de sesiones en el servidor.
// La sesión se guarda en memoria del servidor y se identifica con una cookie en el cliente.
// El "secret" firma esa cookie para que no pueda ser manipulada por terceros.
// La cookie expira en 1 hora.
app.use(
  session({
    secret: "clave_de_sesion_proyecto",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true, // la cookie no puede ser leída por JavaScript en el navegador
      maxAge: 1000 * 60 * 60, // 1 hora
      sameSite: "lax",        // controla cómo viaja la cookie entre dominios
      secure: false,          // en producción debería ser true con HTTPS
    },
  })
);

// Pequeño middleware para exigir rol en rutas protegidas.
// Verifica que exista sesión y que el rol del usuario esté en la lista permitida.
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

// Ruta raíz para comprobar rápidamente que el servidor está activo.
app.get("/", (req, res) => {
  res.send("Servidor backend funcionando");
});

// ------------------------------------
// Rutas para autenticación y sesión
// ------------------------------------

// POST /login: valida las credenciales de un usuario y crea una sesión si son correctas.
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Faltan credenciales" });
    }

    // Consulto en la base de datos si existe el usuario con ese correo.
    const [[user]] = await pool.query(
      "SELECT id, email, password_hash, rol FROM usuarios WHERE email = ? LIMIT 1",
      [email]
    );
    if (!user) return res.status(401).json({ error: "Credenciales inválidas" });

    // Comparo la contraseña que ingresó el usuario con el hash almacenado en la base de datos.
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Credenciales inválidas" });

    // Si todo está bien, guardo los datos mínimos en la sesión.
    req.session.user = { id: user.id, email: user.email, role: user.rol };
    return res.json({ ok: true });
  } catch (err) {
    console.error("Error en login:", err);
    return res.status(500).json({ error: "Error en el inicio de sesión" });
  }
});

// GET /me: devuelve los datos del usuario que tiene la sesión activa.
app.get("/me", (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "No autenticado" });
  res.json({ user: req.session.user });
});

// POST /logout: elimina la sesión y borra la cookie del navegador.
app.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ------------------------------------
// Creación de usuarios por parte de un admin
// ------------------------------------
// POST /usuarios: crea cuentas nuevas (docente, estudiante, admin, empresa) con correo y contraseña.
// Solo permite el acceso a usuarios con rol 'admin'.
app.post("/usuarios", requireRole("admin"), async (req, res) => {
  try {
    const { nombre, email, password, rol } = req.body || {};

    // Validaciones mínimas de entrada
    if (!email || !password || !rol) {
      return res.status(400).json({ error: "email, password y rol son obligatorios" });
    }

    // Ajusta esta lista a los valores permitidos en tu ENUM de MySQL.
    const rolesValidos = ["estudiante", "docente", "admin", "empresa"];
    if (!rolesValidos.includes(rol)) {
      return res.status(400).json({ error: "rol inválido" });
    }

    // Rechazar correos duplicados
    const [existe] = await pool.query(
      "SELECT id FROM usuarios WHERE email = ? LIMIT 1",
      [email]
    );
    if (existe.length) return res.status(409).json({ error: "El email ya está registrado" });

    // Generar hash de la contraseña y guardar
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

// Monta las rutas relacionadas con entregas bajo la ruta /entregas.
app.use("/entregas", entregasRoutes);

// Inspector de rutas: muestra todas las rutas registradas en este servidor.
// Es útil para depuración y verificar qué endpoints están disponibles.
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

// Inicio del servidor en el puerto 8000.
// Aquí defino en qué dirección escuchar las peticiones de los clientes.
const PORT = 8000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});

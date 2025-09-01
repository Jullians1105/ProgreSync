// backend/app.js
import express from "express";
import cors from "cors";
import entregasRoutes from "./routes/entregas.routes.js";

const app = express();
app.use(cors());
app.use(express.json());

// Raíz para verificar que el server vive
app.get("/", (req, res) => {
  res.send("Servidor backend funcionando 🚀");
});

// 🔗 Montamos el router bajo /api/entregas
app.use("/api/entregas", entregasRoutes);

/**
 * 🔍 INSPECTOR DE RUTAS (temporal)
 * Abre http://localhost:8000/debug/routes para ver todo lo registrado en Express.
 * Si no aparecen /api/entregas/__ping o /api/entregas/pendientes aquí,
 * significa que el router NO se está montando.
 */
app.get("/debug/routes", (req, res) => {
  const routes = [];
  const stack = app._router?.stack || [];
  for (const layer of stack) {
    if (layer.route && layer.route.path) {
      // Rutas directas del app
      const methods = Object.keys(layer.route.methods)
        .filter((m) => layer.route.methods[m])
        .map((m) => m.toUpperCase());
      routes.push({ path: layer.route.path, methods });
    } else if (layer.name === "router" && layer.handle?.stack) {
      // Rutas dentro de routers montados (como /api/entregas)
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

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});

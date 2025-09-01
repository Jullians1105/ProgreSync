// backend/app.js

// 1. Importo express, que es el framework para crear el servidor web.
import express from "express";

// 2. Importo cors, que permite que el frontend (en otro puerto) haga peticiones a este backend.
import cors from "cors";

// 3. Importo el archivo de rutas para el módulo de entregas.
//    Esto carga todas las rutas que definimos en backend/routes/entregas.routes.js
import entregasRoutes from "./routes/entregas.routes.js";

// 4. Inicializo la aplicación con express.
const app = express();

// 5. Configuro CORS para aceptar peticiones desde cualquier origen.
app.use(cors());

// 6. Hago que express entienda peticiones con JSON en el body.
app.use(express.json());

// 7. Ruta de prueba en la raíz, para comprobar que el servidor corre.
app.get("/", (req, res) => {
  res.send("Servidor backend funcionando 🚀");
});

// 8. Aquí monto el router de entregas bajo el prefijo /api/entregas.
//    Esto significa que si en entregas.routes.js tienes un router.get("/pendientes", ...),
//    en el navegador debes ir a http://localhost:8000/api/entregas/pendientes
app.use("/api/entregas", entregasRoutes);

// 9. Defino el puerto del servidor (toma variable de entorno PORT o 8000 por defecto).
const PORT = process.env.PORT || 8000;

// 10. Pongo el servidor a escuchar en el puerto definido.
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});

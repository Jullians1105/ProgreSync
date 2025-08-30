// backend/routes/entregas.routes.js

// Primero importo Router desde express.
// Esto me permite crear un conjunto de rutas aparte del archivo principal (app.js).
import { Router } from "express";

const router = Router();

// Aquí defino una ruta de prueba GET en "/". 
// Con esta ruta quiero comprobar que la parte de entregas está funcionando.
// Más adelante aquí irán las rutas reales para subir, listar y revisar entregas.
router.get("/", (req, res) => {
  res.json({ message: "Ruta de entregas funcionando ✅" });
});

// Exporto este router para poder usarlo en app.js.
// De esta forma, app.js no se llena de código y mantengo todo organizado por módulos.
export default router;

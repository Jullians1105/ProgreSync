// backend/routes/entregas.routes.js
import { Router } from "express";

const router = Router();

// Ruta de prueba para entregas
router.get("/", (req, res) => {
  res.json({ message: "Listado de entregas (pendiente de conectar a BD)" });
});

export default router;

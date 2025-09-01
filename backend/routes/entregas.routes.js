// backend/routes/entregas.routes.js

// 1. Importo express para definir un enrutador.
import { Router } from "express";

const router = Router();

// 2. Ruta de prueba: lista de entregas pendientes (MOCK).
//    Así el frontend del docente puede mostrar datos de ejemplo.
router.get("/pendientes", (req, res) => {
  res.json([
    {
      id: 1,
      titulo: "Informe Final",
      descripcion: "Entrega pendiente de revisión",
      archivo: "#",
      estado: "en_revision",
      fecha: new Date().toISOString()
    },
    {
      id: 2,
      titulo: "Reporte Semanal",
      descripcion: "Documento con actividades de la semana",
      archivo: "#",
      estado: "en_revision",
      fecha: new Date().toISOString()
    }
  ]);
});

// 3. Exporto el router para que app.js lo pueda usar.
export default router;


// backend/routes/entregas.routes.js
import { Router } from "express";
const router = Router();

// Log para confirmar que este archivo sí se llegó a cargar
console.log("✅ entregas.routes.js cargado");

// Ruta de diagnóstico para verificar montaje del router
router.get("/__ping", (req, res) => {
  res.json({ ok: true, from: "entregas.routes.js" });
});

// Ruta MOCK para el Docente: pendientes
router.get("/pendientes", (req, res) => {
  res.json([
    {
      id: 1,
      titulo: "Informe Final",
      descripcion: "Entrega pendiente de revisión",
      archivo: "#",
      estado: "en_revision",
      fecha: new Date().toISOString(),
    },
    {
      id: 2,
      titulo: "Reporte Semanal",
      descripcion: "Documento con actividades de la semana",
      archivo: "#",
      estado: "en_revision",
      fecha: new Date().toISOString(),
    },
  ]);
});

export default router;

// backend/routes/entregas.routes.js

// Uso Router para agrupar rutas del módulo "entregas".
import { Router } from "express";
const router = Router();

/**
 * MOCK: GET /api/entregas/pendientes
 * Yo devuelvo una lista fija (de demo) para probar el frontend del Docente
 * sin depender aún de la base de datos. Si esto funciona, luego lo cambiamos
 * por la consulta real a MySQL.
 */
router.get("/pendientes", async (req, res) => {
  // Simulo datos de entregas pendientes
  const demo = [
    {
      id: 1,
      titulo: "Informe 1 (demo)",
      descripcion: "Entrega de prueba para revisar",
      archivo: "#", // luego será una URL válida
      estado: "en_revision",
      fecha: new Date().toISOString(),
    },
    {
      id: 2,
      titulo: "Informe 2 (demo)",
      descripcion: "Otra entrega pendiente",
      archivo: "#",
      estado: "en_revision",
      fecha: new Date().toISOString(),
    },
  ];

  res.json(demo);
});

/**
 * MOCK: POST /api/entregas/:id/revision
 * Yo simulo aprobar o rechazar una entrega y respondo OK.
 * El body esperado: { id_docente, nuevo_estado, comentario }
 */
router.post("/:id/revision", async (req, res) => {
  const { id } = req.params;
  const { id_docente, nuevo_estado, comentario } = req.body || {};
  console.log("Revisión (mock) recibida:", { id, id_docente, nuevo_estado, comentario });

  // Respondo éxito sin tocar base de datos (mock)
  res.json({ ok: true, mocked: true });
});

// SIEMPRE exporto el router como default, porque app.js lo importa así.
export default router;

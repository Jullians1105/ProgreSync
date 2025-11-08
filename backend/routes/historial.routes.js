// backend/routes/historial.routes.js
import { Router } from "express";
import { obtenerHistorialPorEntrega } from "../services/audit.js";

const router = Router();

/**
 * GET /api/historial/entrega/:id
 * Reglas:
 *  - Docente: puede ver el historial de cualquier entrega.
 *  - Estudiante: sólo si es dueño de la entrega.
 */
router.get("/entrega/:id", async (req, res) => {
  try {
    const entregaId = Number(req.params.id);
    if (!entregaId) return res.status(400).json({ error: "ID inválido" });

    const user = req.session?.user;
    if (!user) return res.status(401).json({ error: "No autenticado" });

    // Si es estudiante, valida que la entrega le pertenezca
    if (user.rol === "estudiante") {
      const [[own]] = await req.app.locals.pool.query(
        "SELECT 1 FROM entregas WHERE id = ? AND id_estudiante = ? LIMIT 1",
        [entregaId, user.id]
      );
      if (!own) return res.status(403).json({ error: "Sin permiso" });
    }
    // Docente pasa directo

    const data = await obtenerHistorialPorEntrega(entregaId);
    res.json({ ok: true, data });
  } catch (err) {
    console.error("GET /api/historial/entrega/:id", err);
    res.status(500).json({ error: "Error interno" });
  }
});

export default router;

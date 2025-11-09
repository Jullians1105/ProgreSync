import { Router } from "express";
import { pool } from "../services/db.js";

const router = Router();

console.log("✅ empresa.routes.js cargado");

/* Middleware para verificar rol empresa */
function requireEmpresa(req, res, next) {
  const user = req.session?.user;
  if (!user) return res.status(401).json({ error: "No autenticado" });
  if (user.rol !== 'empresa') return res.status(403).json({ error: "Acceso denegado" });
  next();
}

/* Listar estudiantes asignados a la empresa
   GET /api/empresa/mis-estudiantes */
router.get("/mis-estudiantes", requireEmpresa, async (req, res) => {
  try {
    const id_empresa = req.session.user.id;
    
    const [rows] = await pool.query(`
      SELECT u.id, u.nombre, u.email
      FROM usuarios u
      INNER JOIN empresa_estudiantes ee ON u.id = ee.id_estudiante
      WHERE ee.id_empresa = ? AND u.rol = 'estudiante'
      ORDER BY u.nombre
    `, [id_empresa]);

    res.json(rows);
  } catch (err) {
    console.error("Error GET /api/empresa/mis-estudiantes:", err);
    res.status(500).json({ error: "Error obteniendo estudiantes" });
  }
});

/* Ver entregas de un estudiante específico
   GET /api/empresa/entregas/:id_estudiante */
router.get("/entregas/:id_estudiante", requireEmpresa, async (req, res) => {
  try {
    const id_empresa = req.session.user.id;
    const id_estudiante = Number(req.params.id_estudiante);

    // Primero verificar que el estudiante pertenezca a esta empresa
    const [[asignacion]] = await pool.query(
      `SELECT 1 FROM empresa_estudiantes 
       WHERE id_empresa = ? AND id_estudiante = ? LIMIT 1`,
      [id_empresa, id_estudiante]
    );

    if (!asignacion) {
      return res.status(403).json({ error: "Estudiante no asignado a esta empresa" });
    }

    // Obtener las entregas
    const [rows] = await pool.query(
      `SELECT e.id, e.titulo, e.descripcion, e.archivo, e.estado, 
              e.comentario_docente, e.fecha,
              u.nombre as estudiante
       FROM entregas e
       INNER JOIN usuarios u ON e.id_estudiante = u.id
       WHERE e.id_estudiante = ?
       ORDER BY e.fecha DESC`,
      [id_estudiante]
    );

    res.json(rows);
  } catch (err) {
    console.error("Error GET /api/empresa/entregas/:id_estudiante:", err);
    res.status(500).json({ error: "Error obteniendo entregas" });
  }
});

export default router;
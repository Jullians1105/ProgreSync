// backend/services/audit.js
import { pool } from "../services/db.js";

/**
 * Registra una revisión en la tabla historial_revisiones
 * @param {Object} p
 * @param {number} p.entregaId
 * @param {number} p.usuarioId
 * @param {string} p.accion           // 'CREACION' | 'CAMBIO_ESTADO' | 'COMENTARIO'
 * @param {string|null} p.estadoAnterior
 * @param {string|null} p.estadoNuevo
 * @param {string|null} p.comentario
 */
export async function registrarRevision({
  entregaId,
  usuarioId,
  accion,
  estadoAnterior = null,
  estadoNuevo = null,
  comentario = null,
}) {
  await pool.query(
    `INSERT INTO historial_revisiones
     (entrega_id, usuario_id, accion, estado_anterior, estado_nuevo, comentario, creado_en)
     VALUES (?,?,?,?,?,?, NOW())`,
    [entregaId, usuarioId, accion, estadoAnterior, estadoNuevo, comentario]
  );
}

/** Devuelve el historial de una entrega (con nombres y roles) */
export async function obtenerHistorialPorEntrega(entregaId) {
  const [rows] = await pool.query(
    `SELECT h.id, h.entrega_id, h.accion, h.estado_anterior, h.estado_nuevo,
            h.comentario, h.creado_en,
            u.nombre AS usuario_nombre, u.rol AS usuario_rol
     FROM historial_revisiones h
     JOIN usuarios u ON u.id = h.usuario_id
     WHERE h.entrega_id = ?
     ORDER BY h.creado_en DESC, h.id DESC`,
    [entregaId]
  );
  return rows;
}

// backend/services/historial.js
import { pool } from "./db.js";

/**
 * Registra un cambio en el historial.
 * @param {Object} p
 * @param {number} p.entregaId - ID de la entrega afectada
 * @param {number|null} [p.usuarioId] - ID del usuario (desde la sesión). Puede ser null.
 * @param {string} p.accion - "CREAR_ENTREGA" | "CAMBIAR_ESTADO" | "COMENTARIO" | etc.
 * @param {Object} [p.detalle] - Datos extra (se guardan como JSON)
 */
export async function logCambio({ entregaId, usuarioId = null, accion, detalle = {} }) {
  if (!entregaId) throw new Error("entregaId es requerido");
  if (!accion) throw new Error("accion es requerida");

  // Stringify seguro (evita referencias circulares y limita tamaño)
  const jsonSeguro = JSON.stringify(detalle, (_k, v) => v, 2);
  const jsonCorto = jsonSeguro.length > 65535 ? jsonSeguro.slice(0, 65535) : jsonSeguro;

  await pool.query(
    `INSERT INTO historial_entregas (entrega_id, usuario_id, accion, detalle_json, fecha)
     VALUES (?, ?, ?, ?, NOW())`,
    [entregaId, usuarioId, String(accion).toUpperCase(), jsonCorto]
  );
}

/**
 * Devuelve el historial de una entrega (más cómodo para el front).
 * @param {number} entregaId
 * @returns {Promise<Array>}
 */
export async function listarHistorial(entregaId) {
  const [rows] = await pool.query(
    `SELECT id, entrega_id, usuario_id, accion, detalle_json, fecha
       FROM historial_entregas
      WHERE entrega_id = ?
      ORDER BY fecha DESC, id DESC`,
    [entregaId]
  );

  // Parsear JSON en memoria para que el front no tenga que hacerlo
  return rows.map(r => ({
    id: r.id,
    entrega_id: r.entrega_id,
    usuario_id: r.usuario_id,
    accion: r.accion,
    detalle: safeParseJSON(r.detalle_json),
    fecha: r.fecha,
  }));
}

/** Helper para parsear JSON sin romper si viene null o malformado */
function safeParseJSON(txt) {
  if (!txt) return null;
  try {
    return JSON.parse(txt);
  } catch {
    return txt; // deja el string original si no es JSON válido
  }
}

// backend/services/db.js
import mysql from "mysql2/promise"; // Librería para conectarme a MySQL desde Node.js

// Pool de conexiones (mejor rendimiento que abrir/cerrar por petición)
export const pool = await mysql.createPool({
  host: "127.0.0.1",       // Host del servidor MySQL
  port: 3307,              // Puerto (asegúrate que tu MySQL corre aquí)
  user: "root",            // Usuario
  password: "",            // Contraseña
  database: "progresync",  // Base de datos

  // Performance y estabilidad
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,

  // Tipos y serialización
  dateStrings: true,   // fechas como string (evita zonas horarias raras)
  decimalNumbers: true,

  // Conversión segura de tipos grandes a valores serializables
  typeCast(field, next) {
    // DECIMAL/NEWDECIMAL -> Number (si no es null)
    if (field.type === "NEWDECIMAL" || field.type === "DECIMAL") {
      const val = field.string();
      return val === null ? null : Number(val);
    }
    // LONGLONG (BIGINT) -> Number si es seguro; si no, deja string
    if (field.type === "LONGLONG") {
      const val = field.string();
      const asNum = Number(val);
      return Number.isSafeInteger(asNum) ? asNum : val;
    }
    return next();
  },
});

/** SELECT: devuelve filas */
export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/** INSERT/UPDATE/DELETE: devuelve metadata */
export async function exec(sql, params = []) {
  const [res] = await pool.execute(sql, params);
  return res;
}

// Ping de arranque (ayuda a detectar credenciales/puerto mal configurados)
try {
  const conn = await pool.getConnection();
  await conn.ping();
  conn.release();
  console.log("[DB] MySQL OK → progresync@127.0.0.1:3307");
} catch (err) {
  console.error("[DB] Error conectando a MySQL:", err?.message);
}

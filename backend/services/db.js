// backend/services/db.js
// Conexión a MySQL usando mysql2/promise.
// Nota: en XAMPP tu MySQL está en el puerto 3307 (no 3306).

import mysql from "mysql2/promise";

export const pool = await mysql.createPool({
  host: "127.0.0.1",
  port: 3307,            // ← importante: tu XAMPP muestra 3307
  user: "tu_usuario_mysql",
  password: "tu_password_mysql",
  database: "progresync",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

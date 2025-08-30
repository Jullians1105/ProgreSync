// backend/services/db.js

// Importo mysql2/promise para conectarme a MySQL usando promesas.
// Esto me va a permitir hacer consultas a la base de datos de forma asíncrona.
import mysql from "mysql2/promise";

// Aquí creo un pool de conexiones hacia la base de datos.
// El pool me permite manejar varias conexiones de manera eficiente.
// Uso variables de entorno (si existen) o valores por defecto para localhost.
export const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost", // servidor de la BD
  user: process.env.DB_USER || "root",      // usuario
  password: process.env.DB_PASS || "",      // contraseña
  database: process.env.DB_NAME || "progresync", // nombre de la BD
  waitForConnections: true,
  connectionLimit: 10, // número máximo de conexiones
  queueLimit: 0,
});

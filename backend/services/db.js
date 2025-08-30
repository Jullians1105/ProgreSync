// backend/services/db.js
import mysql from "mysql2/promise";

export const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "",
  database: process.env.DB_NAME || "progresync",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

import mysql from "mysql2/promise"; // Importo la librería mysql2/promise. Librería para conectarme y trabajar con MySQL desde Node.js

// Aquí creo un "pool de conexiones" y lo exporto como "pool".
// Un pool es un conjunto de conexiones que se mantienen abiertas y se reutilizan,
// así el servidor no necesita abrir/cerrar una conexión nueva a la base de datos en cada consulta.
// Esto hace que el rendimiento sea mucho mejor cuando hay varios usuarios al mismo tiempo.
export const pool = await mysql.createPool({
  
   host: "127.0.0.1", // Host donde está el servidor de MySQL.
  port: 3307, // Puerto en el que corre MySQL.
  user: "root",  // Usuario con el que nos conectamos a la base de datos.
  password: "",  // Contraseña de ese usuario. En tu caso está vacía.
  database: "progresync",// Nombre de la base de datos con la que queremos trabajar.

  // Si está en true, espera a que haya una conexión disponible cuando todas estén ocupadas.
  waitForConnections: true,

  // Número máximo de conexiones que puede abrir el pool.
  // Si 10 usuarios piden algo a la vez, se crean hasta 10 conexiones simultáneas.
  connectionLimit: 10,

  // Número máximo de consultas que pueden quedarse en espera.
  // 0 significa que no hay límite (prácticamente nunca se bloquea).
  queueLimit: 0,

    // ⬇️ Hace que las fechas salgan como string y los decimales como Number
  dateStrings: true,


  decimalNumbers: true,

  // ⬇️ Conversión segura de BIGINT/DECIMAL a algo serializable por JSON
  typeCast(field, next) {
    // DECIMAL/NEWDECIMAL → Number (si no es null)
    if (field.type === "NEWDECIMAL" || field.type === "DECIMAL") {
      const val = field.string();
      return val === null ? null : Number(val);
    }
    // LONGLONG = BIGINT → Number si es “safe”, si no, deja string
    if (field.type === "LONGLONG") {
      const val = field.string();                // string siempre serializable
      const asNum = Number(val);
      return Number.isSafeInteger(asNum) ? asNum : val;
    }
    return next();
  }
});

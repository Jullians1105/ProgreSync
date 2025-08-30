// backend/app.js

// Primero importo express, que es el framework que estoy usando para crear el servidor.
import express from "express";

// También importo cors para permitir peticiones desde el frontend (evitar problemas de CORS).
import cors from "cors";

// Aquí importo las rutas que definí para el módulo de entregas.
// De esta manera separo la lógica de las rutas en otro archivo.
import entregasRoutes from "./routes/entregas.routes.js";

// Inicializo mi aplicación con express.
const app = express();

// Configuro CORS para que el servidor acepte peticiones desde cualquier origen.
// Esto es útil porque el frontend puede estar corriendo en otro puerto.
app.use(cors());

// Con esta línea hago que express pueda entender datos en formato JSON en el cuerpo de las peticiones.
app.use(express.json());

// Defino una ruta de prueba en la raíz ("/").
// La utilizo para comprobar rápidamente que el servidor está funcionando.
app.get("/", (req, res) => {
  res.send("Servidor backend funcionando 🚀");
});

// Aquí monto las rutas relacionadas con "entregas" bajo el prefijo /api/entregas.
// Así puedo organizar mejor las URL y tener mi API más clara.
app.use("/api/entregas", entregasRoutes);

// Finalmente, defino el puerto en el que se va a ejecutar el servidor.
// Si existe una variable de entorno PORT la uso, si no, por defecto será 8000.
const PORT = process.env.PORT || 8000;

// Pongo el servidor a escuchar en el puerto definido.
// Cuando arranque, muestro un mensaje en consola para confirmar que está corriendo.
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});

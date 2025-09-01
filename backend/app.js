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



// ─────────── 🔧 ENDPOINTS MOCK PARA PROBAR FRONTEND ───────────

// Yo agrego un endpoint que devuelve una lista fija de entregas pendientes.
// Esto me permite probar el frontend del docente aunque aún no tenga conexión a la base de datos.
app.get("/api/entregas/pendientes", (req, res) => {
  res.json([
    {
      id: 1,
      titulo: "Informe 1 (demo)",
      descripcion: "Entrega de prueba para revisar",
      archivo: "#", // Aquí luego irá el link real al archivo
      estado: "en_revision",
      fecha: new Date().toISOString()
    },
    {
      id: 2,
      titulo: "Informe 2 (demo)",
      descripcion: "Otra entrega pendiente de revisión",
      archivo: "#",
      estado: "en_revision",
      fecha: new Date().toISOString()
    }
  ]);
});

// Yo agrego un endpoint que simula aprobar o rechazar una entrega.
// Por ahora solo imprime en consola la acción y responde con ok:true.
app.post("/api/entregas/:id/revision", (req, res) => {
  console.log("Revisión recibida:", req.params.id, req.body);
  res.json({ ok: true, mocked: true });
});

// ─────────── 🔧 FIN ENDPOINTS MOCK ───────────



// Finalmente, defino el puerto en el que se va a ejecutar el servidor.
// Si existe una variable de entorno PORT la uso, si no, por defecto será 8000.
const PORT = process.env.PORT || 8000;

// Pongo el servidor a escuchar en el puerto definido.
// Cuando arranque, muestro un mensaje en consola para confirmar que está corriendo.
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});

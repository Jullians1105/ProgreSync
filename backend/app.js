import express from "express";
import cors from "cors";
import entregasRoutes from "./routes/entregas.routes.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Servidor backend funcionando 🚀");
});

// 🔗 Monta el router AQUÍ (prefijo /api/entregas)
app.use("/api/entregas", entregasRoutes);

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});

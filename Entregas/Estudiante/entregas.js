// Entregas/Estudiante/entregas.js
import { API_BASE } from "/guard.js";

// Espero a que el guard valide y me devuelva el usuario
const SESSION = await window.SESION_PROMISE;
if (!SESSION) throw new Error("Sesión inválida o sin permisos");

// Alineado con backend en /api/entregas
const API = `${API_BASE}/api/entregas`;
const API_ORIGIN = new URL(API).origin; // origen dinámico (http://localhost:8000)
const ID_ESTUDIANTE = SESSION.id;

// Escapar texto para evitar inyecciones
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

// Cargar mis entregas
async function cargarMisEntregas() {
  const tbody = document.getElementById("tbody-entregas");
  tbody.innerHTML = "<tr><td colspan='6'>Cargando...</td></tr>";
  try {
    const res = await fetch(`${API}/mis/${ID_ESTUDIANTE}`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      tbody.innerHTML = "<tr><td colspan='6'>Sin entregas aún</td></tr>";
      return;
    }

    // Renderizo las filas incluyendo comentario_docente
    tbody.innerHTML = data
      .map(
        (e) => `
        <tr>
          <td>${esc(e.titulo)}</td>
          <td>${esc(e.descripcion)}</td>
          <td>
            <a href="${API_ORIGIN}${esc(e.archivo)}" target="_blank" rel="noopener">Ver</a>
          </td>
          <td><span class="badge badge-${esc(e.estado)}">${esc(e.estado)}</span></td>
          <td>${esc(e.comentario_docente ?? "—")}</td>
          <td>${e.fecha ? new Date(e.fecha).toLocaleString() : ""}</td>
        </tr>
      `
      )
      .join("");
  } catch (err) {
    console.error(err);
    tbody.innerHTML =
      "<tr><td colspan='6' class='text-danger'>Error al cargar</td></tr>";
  }
}

// Envío del formulario
document.getElementById("form-entrega").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.getElementById("msg");
  msg.textContent = "Enviando...";

  const fd = new FormData(e.target); // incluye titulo, descripcion y archivo (por los name)
  fd.append("id_estudiante", ID_ESTUDIANTE);

  try {
    const res = await fetch(API, {
      method: "POST",
      body: fd,
      credentials: "include",
    });

    if (!res.ok) {
      let info = {};
      try {
        info = await res.json();
      } catch {}
      throw new Error(info.error || `Error HTTP ${res.status}`);
    }

    msg.textContent = "¡Enviado!";
    e.target.reset();
    cargarMisEntregas();
  } catch (err) {
    console.error(err);
    msg.textContent = "Error";
  }
});

// Inicializo la tabla
cargarMisEntregas();

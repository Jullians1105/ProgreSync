// Entregas/Estudiante/entregas.js
import { API_BASE } from "/guard.js";


const claseEstado = (s = "") => {
  s = s.toLowerCase();
  if (s === "aprobado")    return "badge rounded-pill bg-success";          // verde
  if (s === "rechazado")   return "badge rounded-pill bg-danger";           // rojo
  if (s === "en_revision") return "badge rounded-pill bg-warning text-dark"; // amarillo
  return "badge rounded-pill bg-secondary";
};


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

// =================== Render tabla ===================
async function cargarMisEntregas() {
  const tbody = document.getElementById("tbody-entregas");
  tbody.innerHTML = "<tr><td colspan='7'>Cargando...</td></tr>";
  try {
    const res = await fetch(`${API}/mis/${ID_ESTUDIANTE}`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      tbody.innerHTML = "<tr><td colspan='7'>Sin entregas aún</td></tr>";
      return;
    }

    // Renderizo filas + botón "Ver historial"
    tbody.innerHTML = data
      .map(
        (e) => `
        <tr>
          <td>${esc(e.titulo)}</td>
          <td>${esc(e.descripcion)}</td>
          <td>
            <a href="${API_ORIGIN}${esc(e.archivo)}" target="_blank" rel="noopener">Ver</a>
          </td>
          <td><span class="${claseEstado(e.estado)}">${esc(e.estado)}</span></td>
          <td>${esc(e.comentario_docente ?? "—")}</td>
          <td>${e.fecha ? new Date(e.fecha).toLocaleString() : ""}</td>
          <td>
            <button
              type="button"
              class="btn btn-sm btn-outline-primary btn-ver-historial"
              data-entrega-id="${e.id}"
              data-entrega-titulo="${esc(e.titulo)}">
              Ver historial
            </button>
          </td>
        </tr>
      `
      )
      .join("");
  } catch (err) {
    console.error(err);
    tbody.innerHTML =
      "<tr><td colspan='7' class='text-danger'>Error al cargar</td></tr>";
  }
}

// =================== Modal Historial ===================
function setHistorialState(state /* 'loading'|'ok'|'empty'|'error' */) {
  const elLoader = document.getElementById("historial-loader");
  const elCont   = document.getElementById("historial-contenido");
  const elVacio  = document.getElementById("historial-vacio");
  const elError  = document.getElementById("historial-error");
  elLoader.classList.toggle("d-none", state !== "loading");
  elCont.classList.toggle("d-none", state !== "ok");
  elVacio.classList.toggle("d-none", state !== "empty");
  elError.classList.toggle("d-none", state !== "error");
}

function renderHistorial(items) {
  const ul = document.getElementById("historial-lista");
  ul.innerHTML = items
    .map((it) => {
      const fecha = it.fecha ? new Date(it.fecha).toLocaleString() : "";
      const usuario = it.usuario_nombre || `Usuario #${it.usuario_id ?? "—"}`;

      // Si viene "estado_anterior/estado_nuevo", lo mostramos como De→A; si no, solo comentario
      const detalleEstado =
        it.estado_anterior != null || it.estado_nuevo != null
          ? `
            <div class="small text-muted">
              <strong>Estado:</strong>
              <span class="badge bg-light text-dark ms-1">${esc(it.estado_anterior ?? "—")}</span>
              <span class="mx-1">→</span>
              <span class="badge bg-primary">${esc(it.estado_nuevo ?? "—")}</span>
            </div>
          `
          : "";

      const comentario =
        it.comentario
          ? `<div class="mt-1"><strong>Comentario:</strong> ${esc(it.comentario)}</div>`
          : "";

      return `
        <li class="list-group-item">
          <div class="d-flex justify-content-between">
            <div>
              <div class="fw-semibold">${esc(usuario)}</div>
              ${detalleEstado}
              ${comentario}
            </div>
            <div class="text-end">
              <div class="small text-muted">${fecha}</div>
              ${it.ip ? `<div class="small text-muted">IP: ${esc(it.ip)}</div>` : ""}
            </div>
          </div>
        </li>
      `;
    })
    .join("");
}

async function abrirModalHistorial(entregaId, entregaTitulo) {
  // Título del modal contextual
  const modalTitle = document.getElementById("modalHistorialLabel");
  if (modalTitle) {
    modalTitle.textContent = `Historial: ${entregaTitulo || `Entrega #${entregaId}`}`;
  }

  // Estado inicial: loading
  setHistorialState("loading");
  document.getElementById("historial-lista").innerHTML = "";

  try {
    const res = await fetch(`${API}/${encodeURIComponent(entregaId)}/historial`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      setHistorialState("empty");
    } else {
      renderHistorial(data);
      setHistorialState("ok");
    }
  } catch (err) {
    console.error(err);
    setHistorialState("error");
  }

  // Abrir modal
  const modalEl = document.getElementById("modalHistorial");
  const bsModal = new window.bootstrap.Modal(modalEl);
  bsModal.show();
}

// Delegación de click para el botón "Ver historial"
document.addEventListener("click", (ev) => {
  const btn = ev.target.closest(".btn-ver-historial");
  if (!btn) return;
  const entregaId = btn.dataset.entregaId;
  const entregaTitulo = btn.dataset.entregaTitulo || "";
  abrirModalHistorial(entregaId, entregaTitulo);
});

// =================== Form submit ===================
document.getElementById("form-entrega").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.getElementById("msg");
  msg.textContent = "Enviando...";

  const fd = new FormData(e.target); // incluye titulo, descripcion y archivo
  fd.append("id_estudiante", ID_ESTUDIANTE);

  try {
    const res = await fetch(API, {
      method: "POST",
      body: fd,
      credentials: "include",
    });

    if (!res.ok) {
      let info = {};
      try { info = await res.json(); } catch {}
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

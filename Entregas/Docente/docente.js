// Entregas/Docente/docente.js
import { API_BASE } from "/guard.js";

/* ===========================
   Sesión y constantes
=========================== */
const SESSION = await window.SESION_PROMISE; // { id, email, role, rol }
const API = `${API_BASE}/entregas`;
const BACKEND_ORIGIN = "http://localhost:8000";

/* ===========================
   DOM refs
=========================== */
const grid = document.getElementById("grid");
const msg  = document.getElementById("msg");

// Elementos del modal de Historial (ya existen en el HTML)
const modalEl          = document.getElementById("modalHistorial");
const modalTitleEl     = document.getElementById("modalHistorialLabel");
const historialLoader  = document.getElementById("historial-loader");
const historialCont    = document.getElementById("historial-contenido");
const historialLista   = document.getElementById("historial-lista");
const historialVacio   = document.getElementById("historial-vacio");
const historialError   = document.getElementById("historial-error");

/* ===========================
   Utils
=========================== */
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

const toLocal = (d) => {
  try {
    return d ? new Date(d).toLocaleString() : "—";
  } catch { return "—"; }
};

const setHistorialState = (state /* 'loading'|'ok'|'empty'|'error' */) => {
  historialLoader.classList.toggle("d-none", state !== "loading");
  historialCont.classList.toggle("d-none", state !== "ok");
  historialVacio.classList.toggle("d-none", state !== "empty");
  historialError.classList.toggle("d-none", state !== "error");
};

const renderHistorial = (items) => {
  historialLista.innerHTML = items.map((it) => {
    const fecha    = toLocal(it.fecha);
    const usuario  = esc(it.usuario_nombre || (it.usuario_id != null ? `Usuario #${it.usuario_id}` : "—"));
    const rol      = esc(it.usuario_rol ?? "");
    const esEstado = it.campo === "estado" || it.estado_anterior != null || it.estado_nuevo != null;

    const detalleEstado = esEstado
      ? `<div class="small text-muted">
           <strong>Estado:</strong>
           <span class="badge bg-light text-dark ms-1">${esc(it.estado_anterior ?? it.valor_anterior ?? "—")}</span>
           <span class="mx-1">→</span>
           <span class="badge bg-primary">${esc(it.estado_nuevo ?? it.valor_nuevo ?? "—")}</span>
         </div>`
      : "";

    const comentario = it.comentario
      ? `<div class="mt-1"><strong>Comentario:</strong> ${esc(it.comentario)}</div>`
      : "";

    return `
      <li class="list-group-item">
        <div class="d-flex justify-content-between">
          <div>
            <div class="fw-semibold">${usuario} <small class="text-muted">(${rol})</small></div>
            ${detalleEstado}
            ${comentario}
          </div>
          <div class="text-end">
            <div class="small text-muted">${fecha}</div>
          </div>
        </div>
      </li>`;
  }).join("");
};

const abrirModalHistorial = async (entregaId, titulo) => {
  modalTitleEl.textContent = `Historial: ${titulo || `Entrega #${entregaId}`}`;
  historialLista.innerHTML = "";
  setHistorialState("loading");

  try {
    const r = await fetch(`${API}/${encodeURIComponent(entregaId)}/historial`, {
      credentials: "include",
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const data = await r.json();

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

  new window.bootstrap.Modal(modalEl).show();
};

/* ===========================
   Carga de pendientes
=========================== */
async function cargarPendientes() {
  msg.textContent = "Cargando…";
  grid.innerHTML = "";

  try {
    const r = await fetch(`${API}/pendientes`, { credentials: "include" });
    if (!r.ok) throw new Error("HTTP " + r.status);

    const data = await r.json();

    if (!data.length) {
      grid.innerHTML = `<div class="col-12"><div class="alert alert-info">No hay entregas en revisión.</div></div>`;
      msg.textContent = "";
      return;
    }

    grid.innerHTML = data.map(e => {
      const hrefArchivo = `${BACKEND_ORIGIN}${e.archivo}`;
      return `
      <div class="col-12 col-md-6 col-lg-4">
        <div class="card h-100 shadow-sm">
          <div class="card-body d-flex flex-column">
            <h5 class="card-title mb-1">${esc(e.titulo)}</h5>
            <p class="text-muted mb-2">${esc(e.estudiante)} · ${esc(e.estudiante_email)}</p>
            <p class="card-text small flex-grow-1">${esc(e.descripcion)}</p>

            <a href="${hrefArchivo}" target="_blank" rel="noopener">Ver archivo</a>

            <div class="d-flex gap-2 mt-3">
              <!-- ✅ Botón HISTORIAL por entrega -->
              <button
                type="button"
                class="btn btn-outline-secondary btn-sm btn-historial"
                data-id="${e.id}"
                data-titulo="${esc(e.titulo)}">
                Historial
              </button>
            </div>

            <div class="input-group mb-2 mt-3">
              <select class="form-select estado">
                <option value="aprobado">Aprobar</option>
                <option value="rechazado">Rechazar</option>
              </select>
            </div>
            <textarea class="form-control comentario mb-2" placeholder="Comentario (opcional)"></textarea>
            <button class="btn btn-success w-100 btn-guardar" data-id="${e.id}">Guardar revisión</button>
          </div>
          <div class="card-footer bg-transparent border-0 pt-0">
            <small class="text-muted">Enviado: ${toLocal(e.fecha)}</small>
          </div>
        </div>
      </div>`;
    }).join("");

    msg.textContent = "";
  } catch (err) {
    console.error(err);
    msg.textContent = "Error cargando pendientes";
  }
}

/* ===========================
   Delegación de eventos
=========================== */
// Guardar revisión (aprobar/rechazar)
grid.addEventListener("click", async (ev) => {
  const btnGuardar = ev.target.closest(".btn-guardar");
  if (!btnGuardar) return;

  const card = btnGuardar.closest(".card");
  const id = btnGuardar.dataset.id;
  const estado = card.querySelector(".estado").value;
  const comentario = card.querySelector(".comentario").value.trim();

  btnGuardar.disabled = true;
  btnGuardar.textContent = "Guardando…";

  try {
    const r = await fetch(`${API}/${id}/estado`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ estado, comentario }),
    });
    if (!r.ok) throw new Error("HTTP " + r.status);

    btnGuardar.textContent = "Guardado ✅";
    setTimeout(cargarPendientes, 400);
  } catch (err) {
    console.error(err);
    btnGuardar.textContent = "Error";
  } finally {
    setTimeout(() => { btnGuardar.disabled = false; btnGuardar.textContent = "Guardar revisión"; }, 1200);
  }
});

// Abrir historial (por entrega)
document.addEventListener("click", (ev) => {
  const btnHist = ev.target.closest(".btn-historial");
  if (!btnHist) return;
  const id = btnHist.dataset.id;
  const titulo = btnHist.dataset.titulo || "";
  abrirModalHistorial(id, titulo);
});

/* ===========================
   Botón "Cargar pendientes" y auto-load
=========================== */
document.getElementById("btn-cargar")?.addEventListener("click", cargarPendientes);
cargarPendientes();

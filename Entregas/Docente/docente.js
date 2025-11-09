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
const gridPend = document.getElementById("grid");
const gridApr  = document.getElementById("grid-aprobadas");
const gridRech = document.getElementById("grid-rechazadas");

const msg  = document.getElementById("msg");

// Filtros (si no existen en el HTML, quedan como null y el código ignora eventos)
const fEstado = document.getElementById("f-doc-estado");
const fDesde  = document.getElementById("f-doc-desde");
const fHasta  = document.getElementById("f-doc-hasta");
const fAplicar= document.getElementById("f-doc-aplicar");
const fLimpiar= document.getElementById("f-doc-limpiar");
const fResumen= document.getElementById("filtros-doc-resumen");

// Modal Historial
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
  try { return d ? new Date(d).toLocaleString() : "—"; }
  catch { return "—"; }
};

const normalizaEstado = (s = "") => String(s).toLowerCase().trim().replace(/\s+/g, "_");

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
   Cache y filtros
=========================== */
const CACHE = {
  pendientes: [],
  aprobadas:  [],
  rechazadas: [],
};

const pasaFiltro = (item, selEstado, dDesde, dHasta, seccion) => {
  // Estado: usa item.estado si viene; si no, usa la sección
  if (selEstado) {
    const estItem = normalizaEstado(item.estado || seccion || "");
    if (estItem !== selEstado) return false;
  }
  // Fecha (inclusivo)
  if (dDesde || dHasta) {
    const dItem = item.fecha ? new Date(item.fecha) : null;
    if (!dItem || isNaN(dItem)) return false;
    if (dDesde && dItem < dDesde) return false;
    if (dHasta && dItem > dHasta) return false;
  }
  return true;
};

const setResumenDoc = () => {
  if (!fResumen) return;
  const selEstado = fEstado?.value || "";
  const desde = fDesde?.value || "";
  const hasta = fHasta?.value || "";

  const dDesde = desde ? new Date(desde + "T00:00:00") : null;
  const dHasta = hasta ? new Date(hasta + "T23:59:59") : null;

  const pV = CACHE.pendientes.filter(x => pasaFiltro(x, selEstado, dDesde, dHasta, "en_revision")).length;
  const aV = CACHE.aprobadas.filter(x  => pasaFiltro(x, selEstado, dDesde, dHasta, "aprobado")).length;
  const rV = CACHE.rechazadas.filter(x => pasaFiltro(x, selEstado, dDesde, dHasta, "rechazado")).length;

  const pT = CACHE.pendientes.length;
  const aT = CACHE.aprobadas.length;
  const rT = CACHE.rechazadas.length;

  const partes = [];
  if (selEstado) partes.push(`estado: ${selEstado === "en_revision" ? "en revisión" : selEstado}`);
  if (desde) partes.push(`desde: ${desde}`);
  if (hasta) partes.push(`hasta: ${hasta}`);
  const filtrosTxt = partes.length ? `(${partes.join(" · ")})` : "(sin filtros)";

  fResumen.textContent = `Pendientes: ${pV}/${pT} · Aprobadas: ${aV}/${aT} · Rechazadas: ${rV}/${rT} ${filtrosTxt}.`;
};

/* ===========================
   Render por sección
=========================== */
const cardPendiente = (e) => {
  const hrefArchivo = `${BACKEND_ORIGIN}${e.archivo}`;
  return `
    <div class="col-12 col-md-6 col-lg-4">
      <div class="card h-100 shadow-sm">
        <div class="card-body d-flex flex-column">
          <h5 class="card-title mb-1">${esc(e.titulo)}</h5>
          <p class="text-muted mb-2">${esc(e.estudiante)} · ${esc(e.estudiante_email)}</p>
          <p class="card-text small flex-grow-1">${esc(e.descripcion ?? "—")}</p>

          <a href="${hrefArchivo}" target="_blank" rel="noopener">Ver archivo</a>

          <div class="d-flex gap-2 mt-3">
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
};

const cardBasica = (e, bordeClase, colorTexto) => {
  const hrefArchivo = `${BACKEND_ORIGIN}${e.archivo}`;
  const comentarioClase = colorTexto ?? "text-muted";
  const comentarioLabel = "<strong>Comentario:</strong> ";
  return `
    <div class="col-12 col-md-6 col-lg-4">
      <div class="card h-100 shadow-sm ${bordeClase || ""}">
        <div class="card-body">
          <h6 class="card-title mb-1">${esc(e.titulo)}</h6>
          <p class="text-muted mb-1">${esc(e.estudiante)} · ${esc(e.estudiante_email)}</p>
          <p class="card-text small text-muted mb-1"><em>Descripción:</em> ${esc(e.descripcion ?? "—")}</p>
          <p class="card-text small mb-1">
            <a href="${hrefArchivo}" target="_blank" rel="noopener">Ver archivo</a>
          </p>
          <p class="card-text small ${comentarioClase} mb-2">
            ${comentarioLabel}${esc(e.comentario_docente ?? "—")}
          </p>
          <div class="d-flex gap-2">
            <button
              class="btn btn-outline-secondary btn-sm btn-historial"
              data-id="${e.id}"
              data-titulo="${esc(e.titulo)}">
              Historial
            </button>
          </div>
          <small class="text-muted d-block mt-2">Enviado: ${toLocal(e.fecha)}</small>
        </div>
      </div>
    </div>`;
};

function renderSeccion(gridEl, data, type /* 'pend'|'apr'|'rech' */) {
  if (!gridEl) return;
  if (!Array.isArray(data) || data.length === 0) {
    gridEl.innerHTML = `<div class="col-12"><p class="text-muted">No hay entregas en esta sección</p></div>`;
    return;
  }
  gridEl.innerHTML = data.map(e => {
    if (type === "pend") return cardPendiente(e);
    if (type === "apr")  return cardBasica(e, "border-success", "text-success");
    return cardBasica(e, "border-danger", "text-danger");
  }).join("");
}

/* ===========================
   Aplicar / limpiar filtros
=========================== */
function aplicarFiltrosDoc() {
  const selEstado = fEstado?.value || "";
  const desde = fDesde?.value || "";
  const hasta = fHasta?.value || "";
  const dDesde = desde ? new Date(desde + "T00:00:00") : null;
  const dHasta = hasta ? new Date(hasta + "T23:59:59") : null;

  const pendV = CACHE.pendientes.filter(x => pasaFiltro(x, selEstado, dDesde, dHasta, "en_revision"));
  const aprV  = CACHE.aprobadas.filter(x  => pasaFiltro(x, selEstado, dDesde, dHasta, "aprobado"));
  const rechV = CACHE.rechazadas.filter(x => pasaFiltro(x, selEstado, dDesde, dHasta, "rechazado"));

  renderSeccion(gridPend, pendV, "pend");
  renderSeccion(gridApr,  aprV,  "apr");
  renderSeccion(gridRech, rechV, "rech");

  setResumenDoc();
}

function limpiarFiltrosDoc() {
  if (fEstado) fEstado.value = "";
  if (fDesde)  fDesde.value  = "";
  if (fHasta)  fHasta.value  = "";
  aplicarFiltrosDoc();
}

/* ===========================
   Carga desde API
=========================== */
async function cargarPendientes() {
  if (msg) { msg.textContent = "Cargando…"; }
  if (gridPend) gridPend.innerHTML = "";

  try {
    const r = await fetch(`${API}/pendientes`, { credentials: "include" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const data = await r.json();
    CACHE.pendientes = Array.isArray(data) ? data.slice() : [];
    aplicarFiltrosDoc();
  } catch (err) {
    console.error(err);
    if (gridPend) gridPend.innerHTML = `<div class="col-12"><div class="alert alert-danger">Error cargando pendientes</div></div>`;
  } finally {
    if (msg) setTimeout(() => (msg.textContent = ""), 500);
  }
}

async function cargarAprobadas() {
  if (!gridApr) return;
  try {
    const r = await fetch(`${API}/aprobadas`, { credentials: "include" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const data = await r.json();
    CACHE.aprobadas = Array.isArray(data) ? data.slice() : [];
    aplicarFiltrosDoc();
  } catch (err) {
    console.error(err);
    gridApr.innerHTML = `<div class="col-12"><div class="alert alert-danger">Error cargando aprobadas</div></div>`;
  }
}

async function cargarRechazadas() {
  if (!gridRech) return;
  try {
    const r = await fetch(`${API}/rechazadas`, { credentials: "include" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const data = await r.json();
    CACHE.rechazadas = Array.isArray(data) ? data.slice() : [];
    aplicarFiltrosDoc();
  } catch (err) {
    console.error(err);
    gridRech.innerHTML = `<div class="col-12"><div class="alert alert-danger">Error cargando rechazadas</div></div>`;
  }
}

/* ===========================
   Delegación de eventos
=========================== */
// Guardar revisión (aprobar/rechazar) en PENDIENTES
gridPend?.addEventListener("click", async (ev) => {
  const btnGuardar = ev.target.closest(".btn-guardar");
  if (!btnGuardar) return;

  const card = btnGuardar.closest(".card");
  const id = btnGuardar.dataset.id;
  const estado = card.querySelector(".estado").value;
  const comentario = card.querySelector(".comentario").value.trim();

  btnGuardar.disabled = true;
  btnGuardar.textContent = "Guardando…";

  try {
      // Primero verificamos que tengamos sesión
      if (!SESSION?.id) {
        throw new Error("No hay sesión activa. Por favor, inicia sesión nuevamente.");
      }

      const r = await fetch(`${API}/${id}/estado`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          "X-User-Id": SESSION.id.toString(),
          "X-User-Role": SESSION.role || SESSION.rol || "docente"
        },
        credentials: "include",
        body: JSON.stringify({ 
          estado, 
          comentario,
          usuario_id: SESSION.id  // Incluimos el ID del usuario en el cuerpo
        }),
      });
    
      if (!r.ok) {
        const errorData = await r.json().catch(() => ({}));
        throw new Error(errorData.error || `Error ${r.status}: ${r.statusText}`);
      }

    btnGuardar.textContent = "Guardado ✅";
    // tras guardar, recargamos tres listas (puede moverse de pendientes a otra sección)
    await Promise.all([cargarPendientes(), cargarAprobadas(), cargarRechazadas()]);
  } catch (err) {
    console.error(err);
    btnGuardar.textContent = "Error";
  } finally {
    setTimeout(() => { btnGuardar.disabled = false; btnGuardar.textContent = "Guardar revisión"; }, 1200);
  }
});

// Abrir historial (todas las secciones)
document.addEventListener("click", (ev) => {
  const btnHist = ev.target.closest(".btn-historial");
  if (!btnHist) return;
  const id = btnHist.dataset.id;
  const titulo = btnHist.dataset.titulo || "";
  abrirModalHistorial(id, titulo);
});

/* ===========================
   Botones / eventos de filtros
=========================== */
fAplicar?.addEventListener("click", aplicarFiltrosDoc);
fLimpiar?.addEventListener("click",  limpiarFiltrosDoc);
[fEstado, fDesde, fHasta].forEach(el => el?.addEventListener("change", aplicarFiltrosDoc));

/* ===========================
   Init
=========================== */
document.getElementById("btn-cargar")?.addEventListener("click", cargarPendientes);

// Carga inicial de las tres listas
cargarPendientes();
cargarAprobadas();
cargarRechazadas();

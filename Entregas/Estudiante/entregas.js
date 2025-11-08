// Entregas/Estudiante/entregas.js
import { API_BASE } from "/guard.js";

/* =================== Utilidades =================== */
const claseEstado = (s = "") => {
  s = String(s).toLowerCase().trim();
  if (s === "aprobado")    return "badge rounded-pill bg-success";           // verde
  if (s === "rechazado")   return "badge rounded-pill bg-danger";            // rojo
  if (s === "en_revision" || s === "en revisión") return "badge rounded-pill bg-warning text-dark"; // amarillo
  return "badge rounded-pill bg-secondary";
};

const normalizaEstado = (s = "") =>
  String(s).toLowerCase().replace(/\s+/g, "_").trim();

const soloFecha = (d) => {
  // Retorna "YYYY-MM-DD" desde Date o string
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt)) return "";
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// Escapar texto para evitar inyecciones
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

/* =================== Sesión / API =================== */
const SESSION = await window.SESION_PROMISE;
if (!SESSION) throw new Error("Sesión inválida o sin permisos");

const API = `${API_BASE}/api/entregas`;
const API_ORIGIN = new URL(API).origin; // ej: http://localhost:8000
const ID_ESTUDIANTE = SESSION.id;

/* =================== Estado local (cache) =================== */
let CACHE_ENTREGAS = [];  // todas las entregas del estudiante (desde API)
let VISTA_ENTREGAS = [];  // resultado después de aplicar filtros

/* =================== Render base =================== */
function renderFilas(data) {
  const tbody = document.getElementById("tbody-entregas");
  if (!Array.isArray(data) || data.length === 0) {
    tbody.innerHTML = "<tr><td colspan='7'>Sin resultados</td></tr>";
    return;
  }

  tbody.innerHTML = data.map((e) => {
    const fechaLegible = e.fecha ? new Date(e.fecha).toLocaleString() : "";
    const estadoTxt = esc(e.estado);
    return `
      <tr>
        <td>${esc(e.titulo)}</td>
        <td>${esc(e.descripcion)}</td>
        <td>
          <a href="${API_ORIGIN}${esc(e.archivo)}" target="_blank" rel="noopener">Ver</a>
        </td>
        <td><span class="${claseEstado(e.estado)}">${estadoTxt}</span></td>
        <td>${esc(e.comentario_docente ?? "—")}</td>
        <td>${fechaLegible}</td>
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
    `;
  }).join("");
}

function setResumen(total, filtrados, estadoSel, desde, hasta) {
  const el = document.getElementById("filtros-resumen");
  if (!el) return;

  const partes = [];
  if (estadoSel) {
    const friendly = estadoSel === "en_revision" ? "en revisión" : estadoSel;
    partes.push(`estado: ${friendly}`);
  }
  if (desde) partes.push(`desde: ${desde}`);
  if (hasta) partes.push(`hasta: ${hasta}`);

  const filtrosTxt = partes.length ? `(${partes.join(" · ")})` : "(sin filtros)";
  el.textContent = `Mostrando ${filtrados} de ${total} entregas ${filtrosTxt}.`;
}

/* =================== Filtrado =================== */
function aplicaFiltros() {
  const selEstado = normalizaEstado(document.getElementById("f-estado")?.value || "");
  const desde = document.getElementById("f-desde")?.value || "";
  const hasta = document.getElementById("f-hasta")?.value || "";

  const dDesde = desde ? new Date(`${desde}T00:00:00`) : null;
  const dHasta = hasta ? new Date(`${hasta}T23:59:59`) : null;

  VISTA_ENTREGAS = CACHE_ENTREGAS.filter((e) => {
    // Estado
    if (selEstado) {
      if (normalizaEstado(e.estado) !== selEstado) return false;
    }
    // Fechas (inclusivo)
    if (dDesde || dHasta) {
      const dItem = e.fecha ? new Date(e.fecha) : null;
      if (!dItem || isNaN(dItem)) return false;
      if (dDesde && dItem < dDesde) return false;
      if (dHasta && dItem > dHasta) return false;
    }
    return true;
  });

  renderFilas(VISTA_ENTREGAS);
  setResumen(CACHE_ENTREGAS.length, VISTA_ENTREGAS.length, selEstado, desde, hasta);
}

function limpiarFiltros() {
  const fEstado = document.getElementById("f-estado");
  const fDesde  = document.getElementById("f-desde");
  const fHasta  = document.getElementById("f-hasta");
  if (fEstado) fEstado.value = "";
  if (fDesde)  fDesde.value  = "";
  if (fHasta)  fHasta.value  = "";
  VISTA_ENTREGAS = [...CACHE_ENTREGAS];
  renderFilas(VISTA_ENTREGAS);
  setResumen(CACHE_ENTREGAS.length, VISTA_ENTREGAS.length, "", "", "");
}

/* =================== Carga inicial =================== */
async function cargarMisEntregas() {
  const tbody = document.getElementById("tbody-entregas");
  tbody.innerHTML = "<tr><td colspan='7'>Cargando...</td></tr>";
  try {
    const res = await fetch(`${API}/mis/${ID_ESTUDIANTE}`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    CACHE_ENTREGAS = Array.isArray(data) ? data.slice() : [];
    // Orden opcional: más recientes primero
    CACHE_ENTREGAS.sort((a, b) => {
      const da = a.fecha ? new Date(a.fecha).getTime() : 0;
      const db = b.fecha ? new Date(b.fecha).getTime() : 0;
      return db - da;
    });

    // Inicializamos vista y resumen
    VISTA_ENTREGAS = [...CACHE_ENTREGAS];
    renderFilas(VISTA_ENTREGAS);
    setResumen(CACHE_ENTREGAS.length, VISTA_ENTREGAS.length, "", "", "");
  } catch (err) {
    console.error(err);
    tbody.innerHTML =
      "<tr><td colspan='7' class='text-danger'>Error al cargar</td></tr>";
  }
}

/* =================== Modal Historial =================== */
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
  const modalTitle = document.getElementById("modalHistorialLabel");
  if (modalTitle) {
    modalTitle.textContent = `Historial: ${entregaTitulo || `Entrega #${entregaId}`}`;
  }

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

  const modalEl = document.getElementById("modalHistorial");
  const bsModal = new window.bootstrap.Modal(modalEl);
  bsModal.show();
}

// Delegación de click para "Ver historial"
document.addEventListener("click", (ev) => {
  const btn = ev.target.closest(".btn-ver-historial");
  if (!btn) return;
  const entregaId = btn.dataset.entregaId;
  const entregaTitulo = btn.dataset.entregaTitulo || "";
  abrirModalHistorial(entregaId, entregaTitulo);
});

/* =================== Envío de nueva entrega =================== */
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
    await cargarMisEntregas(); // recarga cache
  } catch (err) {
    console.error(err);
    msg.textContent = "Error";
  }
});

/* =================== Eventos de filtros =================== */
const btnAplicar = document.getElementById("f-aplicar");
const btnLimpiar = document.getElementById("f-limpiar");

// Botones
btnAplicar?.addEventListener("click", aplicaFiltros);
btnLimpiar?.addEventListener("click", limpiarFiltros);

// Enter en inputs ejecuta "Aplicar"
document.getElementById("filtros-form")?.addEventListener("submit", (e) => {
  e.preventDefault();
  aplicaFiltros();
});

// Opcional: aplicar al cambiar (UX rápida)
["f-estado", "f-desde", "f-hasta"].forEach((id) => {
  const el = document.getElementById(id);
  el?.addEventListener("change", () => aplicaFiltros());
});

/* =================== Init =================== */
cargarMisEntregas();

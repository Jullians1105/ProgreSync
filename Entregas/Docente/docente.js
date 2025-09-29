// Entregas/Docente/docente.js
import { API_BASE } from "/guard.js";

const SESSION = await window.SESION_PROMISE; // { id, email, role, rol }
const API = `${API_BASE}/entregas`;

const grid = document.getElementById("grid");
const msg  = document.getElementById("msg");

// Escapamos texto para evitar inyección en HTML
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => (
  {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]
));

/* Construimos la URL ABSOLUTA del archivo siempre contra el backend */
const buildFileUrl = (pathLike) => {
  try {
    return new URL(pathLike, API_BASE).href;
  } catch {
    const p = String(pathLike || "").trim();
    return `${API_BASE}${p.startsWith("/") ? p : (p ? `/${p}` : "")}`;
  }
};

// Normalizamos el estado a lo que el backend espera (ajusta a tu convención)
const mapEstadoOut = (v) => {
  switch ((v || "").toLowerCase()) {
    case "aprobado":   return "Aprobado";
    case "rechazado":  return "Rechazado";
    case "en revisión":
    case "en revision":
    default:           return "En revisión";
  }
};

// Cargar pendientes
async function cargarPendientes() {
  msg.textContent = "Cargando…";
  grid.innerHTML = "";
  try {
    const r = await fetch(`${API}/pendientes`, { credentials: "include" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const data = await r.json();

    if (!Array.isArray(data) || !data.length) {
      grid.innerHTML = `
        <div class="col-12">
          <div class="alert alert-info">No hay entregas en revisión.</div>
        </div>`;
      msg.textContent = "";
      return;
    }

    grid.innerHTML = data.map(e => {
      const titulo       = esc(e.titulo);
      const estudiante   = esc(e.estudiante);
      const email        = esc(e.estudiante_email);
      const descripcion  = esc(e.descripcion ?? "");
      const archivoPath  = e.archivo ?? "";
      const hrefArchivo  = archivoPath ? buildFileUrl(archivoPath) : "";

      const btnArchivo = hrefArchivo
        ? `<a href="${esc(hrefArchivo)}" class="btn btn-outline-primary btn-sm" target="_blank" rel="noopener">Ver archivo</a>`
        : `<button class="btn btn-outline-secondary btn-sm" disabled>Sin archivo</button>`;

      // Estado actual si viene desde el backend, lo mapeamos a minúscula para select
      const estadoActual = ((e.estado ?? "En revisión") + "").toLowerCase();

      return `
      <div class="col-12 col-md-6 col-lg-4 mb-3">
        <div class="card h-100 shadow-sm">
          <div class="card-body d-flex flex-column">
            <h5 class="card-title mb-1">${titulo}</h5>
            <p class="text-muted mb-2">${estudiante}${email ? ` · ${email}` : ""}</p>
            <p class="card-text small flex-grow-1">${descripcion}</p>

            <div class="d-flex gap-2 mb-2">
              ${btnArchivo}
            </div>

            <div class="input-group mb-2">
              <label class="input-group-text" for="sel-${e.id}">Estado</label>
              <select id="sel-${e.id}" class="form-select estado">
                <option value="en revisión" ${estadoActual==="en revisión"?"selected":""}>En revisión</option>
                <option value="aprobado"    ${estadoActual==="aprobado"?"selected":""}>Aprobado</option>
                <option value="rechazado"   ${estadoActual==="rechazado"?"selected":""}>Rechazado</option>
              </select>
            </div>
            <textarea class="form-control comentario mb-2" placeholder="Comentario (opcional)"></textarea>
            <button class="btn btn-success w-100 btn-guardar" data-id="${e.id}">Guardar revisión</button>
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

// Guardar revisión (delegación + credentials)
grid.addEventListener("click", async (ev) => {
  const btn = ev.target.closest(".btn-guardar");
  if (!btn) return;
  const card = btn.closest(".card");
  const id = btn.dataset.id;
  const estadoSel = card.querySelector(".estado").value; // "aprobado"/"rechazado"/"en revisión"
  const comentario = card.querySelector(".comentario").value.trim();

  const estado = mapEstadoOut(estadoSel);

  btn.disabled = true;
  btn.textContent = "Guardando…";

  try {
    const r = await fetch(`${API}/${id}/estado`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ estado, comentario }),
    });

    if (!r.ok) {
      // Intentamos mostrar mensaje del backend si viene en JSON
      let detail = "";
      try { detail = (await r.json())?.message || ""; } catch {}
      throw new Error(`HTTP ${r.status}${detail ? ` – ${detail}` : ""}`);
    }

    btn.textContent = "Guardado ✅";
    setTimeout(cargarPendientes, 400);
  } catch (err) {
    console.error(err);
    btn.textContent = "Error";
  } finally {
    setTimeout(() => { btn.disabled = false; btn.textContent = "Guardar revisión"; }, 1200);
  }
});

document.getElementById("btn-cargar")?.addEventListener("click", cargarPendientes);
cargarPendientes();

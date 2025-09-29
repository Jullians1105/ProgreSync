import { API_BASE } from "/guard.js";

const SESSION = await window.SESION_PROMISE; // { id, email, role, rol }
if (!SESSION) throw new Error("Sesión inválida");

const API_ORIGIN = new URL(API_BASE).origin;        // p.ej. "http://localhost:8000"
const API = `${API_BASE}/entregas`;

const grid = document.getElementById("grid");
const msg  = document.getElementById("msg");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => (
  {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]
));

const buildFileUrl = (pathLike) => {
  const p = String(pathLike || "").trim();          // "/uploads/xxx.pdf" o "uploads/xxx.pdf"
  return new URL(p.startsWith("/") ? p : `/${p}`, API_ORIGIN).href;
};

const mapEstadoOut = (v) => {
  switch ((v || "").toLowerCase()) {
    case "aprobado":  return "Aprobado";
    case "rechazado": return "Rechazado";
    default:          return "En revisión";
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
        <div class="col-12"><div class="alert alert-info">No hay entregas en revisión.</div></div>`;
      msg.textContent = "";
      return;
    }

    grid.innerHTML = data.map(e => {
      const hrefArchivo = e.archivo ? buildFileUrl(e.archivo) : "";
      const btnArchivo = hrefArchivo
        ? `<a href="${hrefArchivo}" class="btn btn-outline-primary btn-sm" target="_blank" rel="noopener">Ver archivo</a>`
        : `<button class="btn btn-outline-secondary btn-sm" disabled>Sin archivo</button>`;

      const estadoActual = ((e.estado ?? "En revisión") + "").toLowerCase();

      return `
      <div class="col-12 col-md-6 col-lg-4 mb-3">
        <div class="card h-100 shadow-sm">
          <div class="card-body d-flex flex-column">
            <h5 class="card-title mb-1">${esc(e.titulo)}</h5>
            <p class="text-muted mb-2">${esc(e.estudiante)}${e.estudiante_email ? ` · ${esc(e.estudiante_email)}` : ""}</p>
            <p class="card-text small flex-grow-1">${esc(e.descripcion ?? "")}</p>

            <div class="d-flex gap-2 mb-2">${btnArchivo}</div>

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

// Guardar revisión
grid.addEventListener("click", async (ev) => {
  const btn = ev.target.closest(".btn-guardar");
  if (!btn) return;
  const card = btn.closest(".card");
  const id = btn.dataset.id;
  const estadoSel = card.querySelector(".estado").value;
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
    if (!r.ok) throw new Error("HTTP " + r.status);

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

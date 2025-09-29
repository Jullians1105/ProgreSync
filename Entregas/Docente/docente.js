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

/* Construimos la URL ABSOLUTA del archivo siempre contra el backend
   - Si e.archivo viene como "/uploads/archivo.pdf" → queda "http://localhost:8000/uploads/archivo.pdf"
   - Si viniera como "uploads/archivo.pdf" → también lo resuelve bien
   - Si en producción API_BASE cambia, esto se adapta solo               */
const buildFileUrl = (pathLike) => {
  try {
    return new URL(pathLike, API_BASE).href;
  } catch {
    // Fallback defensivo si algo extraño viene en pathLike
    const p = String(pathLike || "");
    return `${API_BASE}${p.startsWith("/") ? p : `/${p}`}`;
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

    if (!data.length) {
      grid.innerHTML = `<div class="col-12"><div class="alert alert-info">No hay entregas en revisión.</div></div>`;
      msg.textContent = "";
      return;
    }

    grid.innerHTML = data.map(e => {
      // Armamos la URL final del archivo contra el backend
      const hrefArchivo = buildFileUrl(e.archivo);

      return `
      <div class="col-12 col-md-6 col-lg-4">
        <div class="card h-100 shadow-sm">
          <div class="card-body d-flex flex-column">
            <h5 class="card-title mb-1">${esc(e.titulo)}</h5>
            <p class="text-muted mb-2">${esc(e.estudiante)} · ${esc(e.estudiante_email)}</p>
            <p class="card-text small flex-grow-1">${esc(e.descripcion)}</p>

            <!-- Mostramos un enlace para VER el archivo, abre en otra pestaña -->
            <td><a href="http://localhost:8000${esc(e.archivo)}" target="_blank" rel="noopener">Ver</a></td>

            <div class="input-group mb-2">
              <select class="form-select estado">
                <option value="aprobado">Aprobar</option>
                <option value="rechazado">Rechazar</option>
              </select>
            </div>
            <textarea class="form-control comentario mb-2" placeholder="Comentario (opcional)"></textarea>
            <button class="btn btn-success w-100 btn-guardar" data-id="${e.id}">Guardar revisión</button>
          </div>
        </div>
      </div>
    `;
    }).join("");

    msg.textContent = "";
  } catch (err) {
    console.error(err);
    msg.textContent = "Error cargando pendientes";
  }
}

// Guardar revisión (recuerda credentials)
grid.addEventListener("click", async (ev) => {
  const btn = ev.target.closest(".btn-guardar");
  if (!btn) return;
  const card = btn.closest(".card");
  const id = btn.dataset.id;
  const estado = card.querySelector(".estado").value;
  const comentario = card.querySelector(".comentario").value.trim();

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

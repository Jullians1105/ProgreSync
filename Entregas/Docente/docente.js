
import { API_BASE } from "/guard.js";

// Esperamos a que el guard valide sesión y nos entregue el usuario
const SESSION = await window.SESION_PROMISE; // { id, email, role, rol }
if (!SESSION) throw new Error("Sesión inválida o no autenticado");

// Origen puro del backend (sin path /api),lo usamos para armar URLs de archivos
const API_ORIGIN = new URL(API_BASE).origin; // ej: "http://localhost:8000"

// Endpoint del módulo de entregas
const API = `${API_BASE}/api/entregas`;

// Referencias a elementos del DOM de esta vista
const grid = document.getElementById("grid");
const msg  = document.getElementById("msg");


const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c])
  );


const buildFileUrl = (pathLike) => {
  const p = String(pathLike || "").trim();
  // Aseguramos que tenga "/" inicial para que new URL lo resuelva bien
  const normalized = p.startsWith("/") ? p : (p ? `/${p}` : "");
  return new URL(normalized, API_ORIGIN).href;
};

/**
 * Normaliza el estado antes de enviar al backend.
 * Acepta valores del <select> en minúsculas y retorna la convención del servidor.
 * @param {string} v
 * @returns {"En revisión"|"Aprobado"|"Rechazado"}
 */
const mapEstadoOut = (v) => {
  switch ((v || "").toLowerCase()) {
    case "aprobado":  return "Aprobado";
    case "rechazado": return "Rechazado";
    default:          return "En revisión";
  }
};

/* ──────────────────────────────────────────────────────────────────────────
   3) CARGA DE PENDIENTES
   - Llama a GET /api/entregas/pendientes (con cookie de sesión)
   - Renderiza tarjetas con: título, autor, descripción, link "Ver archivo",
     combo de estado y caja de comentario
   ────────────────────────────────────────────────────────────────────────── */
async function cargarPendientes() {
  msg.textContent = "Cargando…";
  grid.innerHTML  = "";

  try {
    const res = await fetch(`${API}/pendientes`, { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json(); // Esperamos arreglo de entregas

    if (!Array.isArray(data) || data.length === 0) {
      // Vacío: mostramos aviso amable y salimos
      grid.innerHTML = `
        <div class="col-12">
          <div class="alert alert-info">No hay entregas en revisión.</div>
        </div>`;
      msg.textContent = "";
      return;
    }

    // Renderizamos las tarjetas de manera compacta
    grid.innerHTML = data.map((e) => {
      // Datos saneados
      const titulo      = esc(e.titulo);
      const estudiante  = esc(e.estudiante ?? "");
      const email       = esc(e.estudiante_email ?? "");
      const descripcion = esc(e.descripcion ?? "");
      const fechaEnvio  = e.fecha ? new Date(e.fecha).toLocaleString() : "";
      const estadoRaw   = (e.estado ?? "En revisión") + ""; // puede venir con mayúsculas
      const estadoSel   = estadoRaw.toLowerCase();          // para marcar en el <select>

      // URL del archivo → construida SIEMPRE contra el backend
      const hrefArchivo = e.archivo ? buildFileUrl(e.archivo) : "";
      const btnArchivo  = hrefArchivo
        ? `<a href="${esc(hrefArchivo)}" class="btn btn-outline-primary btn-sm" target="_blank" rel="noopener">Ver archivo</a>`
        : `<button class="btn btn-outline-secondary btn-sm" disabled>Sin archivo</button>`;

      return `
      <div class="col-12 col-md-6 col-lg-4 mb-3">
        <div class="card h-100 shadow-sm">
          <div class="card-body d-flex flex-column">
            <h5 class="card-title mb-1">${titulo}</h5>
            <p class="text-muted mb-2">${estudiante}${email ? ` · ${email}` : ""}</p>
            <p class="card-text small flex-grow-1">${descripcion}</p>

            <div class="d-flex gap-2 mb-2">${btnArchivo}</div>

            <div class="input-group mb-2">
              <label class="input-group-text" for="sel-${e.id}">Estado</label>
              <select id="sel-${e.id}" class="form-select estado">
                <option value="en revisión" ${estadoSel==="en revisión"?"selected":""}>En revisión</option>
                <option value="aprobado"    ${estadoSel==="aprobado"?"selected":""}>Aprobado</option>
                <option value="rechazado"   ${estadoSel==="rechazado"?"selected":""}>Rechazado</option>
              </select>
            </div>

            <textarea class="form-control comentario mb-2" placeholder="Comentario (opcional)"></textarea>

            <button class="btn btn-success w-100 btn-guardar" data-id="${e.id}">
              Guardar revisión
            </button>

            ${fechaEnvio ? `<small class="text-muted mt-2">Enviado: ${esc(fechaEnvio)}</small>` : ""}
          </div>
        </div>
      </div>`;
    }).join("");

    msg.textContent = "";
  } catch (err) {
    console.error("[Docente] cargarPendientes:", err);
    msg.textContent = "Error cargando pendientes";
  }
}

/* ──────────────────────────────────────────────────────────────────────────
   4) GUARDAR REVISIÓN (PATCH estado + comentario)
   - Delegación sobre el grid: buscamos .btn-guardar, leemos select + textarea
   - Enviamos PATCH /api/entregas/:id/estado con { estado, comentario }
   ────────────────────────────────────────────────────────────────────────── */
grid.addEventListener("click", async (ev) => {
  const btn = ev.target.closest(".btn-guardar");
  if (!btn) return;

  const card       = btn.closest(".card");
  const id         = btn.dataset.id;
  const estadoSel  = card.querySelector(".estado").value;           // "aprobado" | "rechazado" | "en revisión"
  const comentario = card.querySelector(".comentario").value.trim();
  const estado     = mapEstadoOut(estadoSel);                       // Normalizamos a convención del backend

  // Feedback inmediato en UI mientras persiste
  btn.disabled  = true;
  btn.textContent = "Guardando…";

  try {
    const res = await fetch(`${API}/${id}/estado`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ estado, comentario }),
    });

    if (!res.ok) {
      // Si el backend envía mensaje, lo mostramos en consola para debug fino
      let detail = "";
      try { detail = (await res.json())?.message || ""; } catch {}
      throw new Error(`HTTP ${res.status}${detail ? ` – ${detail}` : ""}`);
    }

    btn.textContent = "Guardado ✅";

    // Recargamos la lista (con un pequeño delay para que el usuario vea el check)
    setTimeout(cargarPendientes, 400);
  } catch (err) {
    console.error("[Docente] guardarRevision:", err);
    btn.textContent = "Error";
  } finally {
    // Restauramos el botón a estado normal
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = "Guardar revisión";
    }, 1200);
  }
});

/* ──────────────────────────────────────────────────────────────────────────
   5) INICIALIZACIÓN
   - Botón manual para recargar (si existe)
   - Carga inicial de pendientes
   ────────────────────────────────────────────────────────────────────────── */
document.getElementById("btn-cargar")?.addEventListener("click", cargarPendientes);
cargarPendientes();

// ============================================================================
//  FIN DE ARCHIVO
// ============================================================================

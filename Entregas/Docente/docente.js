// Entregas/Docente/docente.js
import { API_BASE } from "/guard.js";

// Primero espero a que se cargue mi sesión, así sé quién soy y qué rol tengo
const SESSION = await window.SESION_PROMISE; // { id, email, role, rol }
const API = `${API_BASE}/entregas`; // acá armo la URL base de mi módulo entregas

// Defino el origen del backend en duro, porque los archivos siempre están en el puerto 8000
// Esto me evita que el navegador intente abrirlos desde 127.0.0.7:5500 (mi front)
const BACKEND_ORIGIN = "http://localhost:8000";

// Capturo los elementos del DOM donde voy a pintar datos y mensajes
const grid = document.getElementById("grid");
const msg  = document.getElementById("msg");

// Me hago una función para escapar texto y evitar inyecciones en el HTML
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

// Con esta función voy a cargar las entregas pendientes que debo revisar como docente
async function cargarPendientes() {
  msg.textContent = "Cargando…"; // muestro mensaje de carga
  grid.innerHTML = ""; // limpio el grid antes de pintar

  try {
    // Hago la petición al backend, siempre con credentials para mantener la sesión
    const r = await fetch(`${API}/pendientes`, { credentials: "include" });
    if (!r.ok) throw new Error("HTTP " + r.status);

    // Parseo la respuesta a JSON
    const data = await r.json();

    // Si no tengo entregas, muestro un aviso
    if (!data.length) {
      grid.innerHTML = `<div class="col-12"><div class="alert alert-info">No hay entregas en revisión.</div></div>`;
      msg.textContent = "";
      return;
    }

    // Si tengo entregas, armo el HTML de cada tarjeta
    grid.innerHTML = data.map(e => {
      // Acá me aseguro de construir SIEMPRE la URL contra el backend (puerto 8000)
      const hrefArchivo = `${BACKEND_ORIGIN}${e.archivo}`;

      return `
      <div class="col-12 col-md-6 col-lg-4">
        <div class="card h-100 shadow-sm">
          <div class="card-body d-flex flex-column">
            <h5 class="card-title mb-1">${esc(e.titulo)}</h5>
            <p class="text-muted mb-2">${esc(e.estudiante)} · ${esc(e.estudiante_email)}</p>
            <p class="card-text small flex-grow-1">${esc(e.descripcion)}</p>

            <!-- Este link ahora abre desde el backend, no desde el front -->
            <a href="${hrefArchivo}" target="_blank" rel="noopener">Ver archivo</a>

            <!-- Controles para aprobar o rechazar -->
            <div class="input-group mb-2 mt-2">
              <select class="form-select estado">
                <option value="aprobado">Aprobar</option>
                <option value="rechazado">Rechazar</option>
              </select>
            </div>
            <textarea class="form-control comentario mb-2" placeholder="Comentario (opcional)"></textarea>
            <button class="btn btn-success w-100 btn-guardar" data-id="${e.id}">Guardar revisión</button>
          </div>
        </div>
      </div>`;
    }).join("");

    msg.textContent = ""; // limpio el mensaje
  } catch (err) {
    console.error(err);
    msg.textContent = "Error cargando pendientes"; // muestro error
  }
}

// Acá escucho los clics en el grid, para detectar cuando le doy a "Guardar revisión"
grid.addEventListener("click", async (ev) => {
  const btn = ev.target.closest(".btn-guardar");
  if (!btn) return;

  // Localizo la card de esa entrega y leo los valores seleccionados
  const card = btn.closest(".card");
  const id = btn.dataset.id;
  const estado = card.querySelector(".estado").value;
  const comentario = card.querySelector(".comentario").value.trim();

  // Muestro feedback mientras se guarda
  btn.disabled = true;
  btn.textContent = "Guardando…";

  try {
    // Llamo al backend para actualizar el estado de la entrega
    const r = await fetch(`${API}/${id}/estado`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ estado, comentario }),
    });
    if (!r.ok) throw new Error("HTTP " + r.status);

    // Si todo salió bien, muestro confirmación
    btn.textContent = "Guardado ✅";
    setTimeout(cargarPendientes, 400); // recargo la lista
  } catch (err) {
    console.error(err);
    btn.textContent = "Error"; // muestro error
  } finally {
    // Restauro el botón después de un segundo
    setTimeout(() => { btn.disabled = false; btn.textContent = "Guardar revisión"; }, 1200);
  }
});

// Acá engancho el botón de "Cargar pendientes"
document.getElementById("btn-cargar")?.addEventListener("click", cargarPendientes);

// Finalmente, cargo de una vez al entrar a la página
cargarPendientes();

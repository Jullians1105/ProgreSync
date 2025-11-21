// /admin/admin.js
import { API_BASE } from "/guard.js";

/* ========== Gate de sesión ========== */
const SESSION = await window.SESION_PROMISE;
if (!SESSION || SESSION.rol !== "admin") {
  alert("Acceso restringido: solo administradores.");
  location.href = "/";
  throw new Error("No admin");
}

/* ========== Whoami (opcional) ========== */
const whoami = document.getElementById("whoami");
if (whoami && SESSION?.email && SESSION?.rol) {
  whoami.textContent = `${SESSION.email} · ${SESSION.rol}`;
}

/* ========== Constantes / refs ========== */
const API = `${API_BASE}/usuarios`;

const grid          = document.getElementById("grid");
const msg           = document.getElementById("msg");
const buscar        = document.getElementById("buscar");
const filtroEstado  = document.getElementById("filtroEstado");
const btnNuevo      = document.getElementById("btnNuevo");
const btnBuscar     = document.getElementById("btnBuscar");

// Modal y campos (IDs según tu HTML)
const modalEl   = document.getElementById("modalUsuario");
const form      = document.getElementById("formUsuario");
const uId       = document.getElementById("uId");
const uNombre   = document.getElementById("uNombre");
const uEmail    = document.getElementById("uEmail");
const uRol      = document.getElementById("uRol");
const uEstado   = document.getElementById("uEstado");
const uPass     = document.getElementById("uPass");


// agregar casilla de telefono 
const uTelefono = document.getElementById("uTelefono");



// Bootstrap Modal
const modal = (window.bootstrap && modalEl) ? new bootstrap.Modal(modalEl) : null;

/* ========== Utils ========== */
function flash(type, text) {
  if (!msg) return;
  msg.innerHTML = `<div class="alert alert-${type} py-2 mb-0">${text}</div>`;
  window.clearTimeout(flash._t);
  flash._t = window.setTimeout(() => (msg.innerHTML = ""), 3500);
}

function setTitle(text) {
  const t = modalEl?.querySelector(".modal-title");
  if (t) t.textContent = text;
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

function rowTemplate(u) {
  const estado = (u.estado || "").toLowerCase();
  const badgeEstado =
    estado === "activo"
      ? `<span class="badge text-bg-success">activo</span>`
      : `<span class="badge text-bg-secondary">inactivo</span>`;

  const actionButtons = estado === "activo"
    ? `<button class="btn btn-outline-danger" data-off="${esc(u.id)}" title="Desactivar">Desactivar</button>`
    : `<button class="btn btn-outline-success" data-on="${esc(u.id)}" title="Activar">Activar</button>`;

  return `
    <tr>
      <td>${esc(u.id ?? "—")}</td>
      <td>${esc(u.nombre ?? "—")}</td>
      <td>${esc(u.email ?? "—")}</td>


      <!-- columna telefono -->
      <td>${esc(u.telefono ?? "—")}</td>


      <td><span class="badge text-bg-secondary">${esc(u.rol ?? "—")}</span></td>
      <td>${badgeEstado}</td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-primary" data-edit="${esc(u.id)}" title="Editar">
            Editar
          </button>
          ${actionButtons}
        </div>
      </td>
    </tr>
  `;
}

/* ========== Listado (con cancelación de peticiones) ========== */
let listAbort = null;

async function listar() {
  if (!grid) return;

  if (listAbort) listAbort.abort();
  listAbort = new AbortController();

  grid.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-3">Cargando…</td></tr>`;

  const params = new URLSearchParams();
  const q = (buscar?.value || "").trim();
  const est = (filtroEstado?.value || "").trim();
  if (q) params.set("q", q);
  if (est) params.set("estado", est);

  const url = params.toString() ? `${API}?${params.toString()}` : API;

  try {
    const res = await fetch(url, { credentials: "include", signal: listAbort.signal });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`No se pudo cargar la lista (HTTP ${res.status}) ${t}`);
    }

    const data = await res.json();
    const lista = Array.isArray(data) ? data : (Array.isArray(data?.usuarios) ? data.usuarios : []);

    if (lista.length === 0) {
      grid.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-3">Sin resultados</td></tr>`;
      return;
    }
    grid.innerHTML = lista.map(rowTemplate).join("");
  } catch (e) {
    if (e.name === "AbortError") return;
    grid.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-3">Error al listar</td></tr>`;
    flash("danger", e.message || "Error al listar");
  }
}

/* ========== Buscar/Filtro ========== */
btnBuscar?.addEventListener("click", listar);
filtroEstado?.addEventListener("change", listar);

if (buscar) {
  buscar.addEventListener("keydown", (e) => { if (e.key === "Enter") listar(); });
  let t = null;
  buscar.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(listar, 350);
  });
}

/* ========== Nuevo ========== */
btnNuevo?.addEventListener("click", () => {
  if (!modal) return;
  form.reset();
  form.dataset.mode = "nuevo";
  form.dataset.id = "";
  uId.value = "";
  uEstado.value = "activo";
  uPass.value = "";

  // Telefono, celda vacia
  if (uTelefono) uTelefono.value = "";
  setTitle("Nuevo usuario");
  modal.show();
});

/* ========== Delegación en la grilla (Editar / Activar / Desactivar) ========== */
grid?.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const id = btn.dataset.edit || btn.dataset.off || btn.dataset.on;
  if (!id) return;

  // EDITAR: precargar usando la fila (sin API) y, si existe, refinar con GET.
  if (btn.dataset.edit) {
    try {
      // 1) Precarga inmediata desde la fila
      const tr = btn.closest("tr");
      const c = tr?.children || [];
      const idTxt       = c[0]?.textContent?.trim() ?? id;
      const nombreTxt   = c[1]?.textContent?.trim() ?? "";
      const emailTxt    = c[2]?.textContent?.trim() ?? "";
      // Telefono 
      const telefonoTxt = c[3]?.textContent?.trim() ?? "";
      const rolTxt      = c[4]?.innerText?.trim() ?? "estudiante"; // badge → texto
      const estTxt      = c[5]?.innerText?.trim().toLowerCase() ?? "activo";

      form.reset();
      form.dataset.mode = "editar";
      form.dataset.id = String(idTxt);
      uId.value       = String(idTxt);
      uNombre.value   = nombreTxt;
      uEmail.value    = emailTxt;
      // Telefono 
      if (uTelefono) uTelefono.value = telefonoTxt;
      uRol.value      = rolTxt;
      uEstado.value   = (estTxt === "activo" || estTxt === "inactivo") ? estTxt : "activo";
      uPass.value     = ""; // opcional en edición

      setTitle(`Editar usuario #${idTxt}`);
      modal?.show();

      // 2) Intento de GET para datos “fresh” (si tu backend lo soporta)
      try {
        const res = await fetch(`${API}/${id}`, { credentials: "include" });
        if (res.ok) {
          const u = await res.json();
          uNombre.value     = u.nombre   ?? uNombre.value;
          uEmail.value      = u.email    ?? uEmail.value;
          // pregunta si telefono tiene un valor
          if (uTelefono) uTelefono.value = u.telefono ?? uTelefono.value;
          uRol.value        = u.rol      ?? uRol.value;
          uEstado.value     = u.estado   ?? uEstado.value;
        }
        // Si 404, lo ignoramos; ya cargamos desde la fila
      } catch {
        /* ignorar errores de red aquí */
      }

    } catch (err) {
      console.error(err);
      flash("danger", err.message || "No se pudo abrir el editor");
    }
    return;
  }

  // DESACTIVAR
  if (btn.dataset.off) {
    if (!confirm("¿Desactivar este usuario?")) return;
    try {
      // preferido: PATCH /usuarios/:id/estado
      let r = await fetch(`${API}/${id}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ estado: "inactivo" })
      });
      if (r.status === 404) {
        // fallback a rutas antiguas
        r = await fetch(`${API}/${id}/desactivar`, { method: "PATCH", credentials: "include" });
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      flash("success", "Usuario desactivado");
      listar();
    } catch (e2) {
      flash("danger", `No se pudo desactivar (${e2.message})`);
    }
    return;
  }

  // ACTIVAR
  if (btn.dataset.on) {
    try {
      let r = await fetch(`${API}/${id}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ estado: "activo" })
      });
      if (r.status === 404) {
        r = await fetch(`${API}/${id}/activar`, { method: "PATCH", credentials: "include" });
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      flash("success", "Usuario activado");
      listar();
    } catch (e2) {
      flash("danger", `No se pudo activar (${e2.message})`);
    }
    return;
  }
});

/* ========== Guardar (crear/editar) ========== */
form?.addEventListener("submit", async (e) => {
  e.preventDefault();

  // Validación mínima
  if (!uNombre?.checkValidity() || !uEmail?.checkValidity() || !uRol?.value || !uEstado?.value) {
    form.reportValidity?.();
    return;
  }

  const mode = form.dataset.mode || (uId.value ? "editar" : "nuevo");
  const id   = form.dataset.id || uId.value;

  const payload = {
    nombre:   uNombre.value.trim(),
    email:    uEmail.value.trim(),
    // en la parte de telefono agrega el valor o null sin espacios
    telefono: uTelefono?.value.trim() || null,
    rol:      uRol.value,
    estado:   uEstado.value
  };
  // Incluir password solo si se escribió
  if (uPass.value.trim()) payload.password = uPass.value.trim();

  const url = mode === "editar" ? `${API}/${id}` : API;
  const method = mode === "editar" ? "PUT" : "POST";

  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      let err = `Error al guardar (HTTP ${res.status})`;
      try { const j = await res.json(); if (j?.detail) err = j.detail; } catch {}
      flash("danger", err);
      return;
    }

    modal?.hide();
    flash("success", mode === "editar" ? "Usuario actualizado" : "Usuario creado");
    listar();
  } catch (e2) {
    flash("danger", e2.message || "Error de red");
  }
});

/* ========== Inicial ========== */
listar();

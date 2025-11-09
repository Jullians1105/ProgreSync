// /Admin/usuarios.js
import { API_BASE } from "/guard.js";

/* ========== Sesión y gate ========== */
const SESSION = await window.SESION_PROMISE;
if (!SESSION || SESSION.rol !== "admin") {
  alert("Acceso restringido: solo administradores.");
  location.href = "/";
  throw new Error("No admin");
}

// Mostrar quién soy (opcional)
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

const form      = document.getElementById("formUsuario");
const modalEl   = document.getElementById("modalForm");
const titulo    = document.getElementById("modalTitulo");

const uid       = document.getElementById("uid");
const nombre    = document.getElementById("nombre");
const email     = document.getElementById("email");
const rol       = document.getElementById("rol");
const password  = document.getElementById("password");
const grpPass   = document.getElementById("grpPass");

// Bootstrap Modal (si existe)
const modal = (window.bootstrap && modalEl) ? new bootstrap.Modal(modalEl) : null;

/* ========== Utils ========== */
function flash(type, text) {
  if (!msg) return;
  msg.innerHTML = `<div class="alert alert-${type} py-2 mb-0">${text}</div>`;
  window.clearTimeout(flash._t);
  flash._t = window.setTimeout(() => (msg.innerHTML = ""), 3500);
}

function rowTemplate(u) {
  const estado = (u.estado || "").toLowerCase();
  const badgeEstado = estado === "activo"
    ? `<span class="badge text-bg-success">activo</span>`
    : `<span class="badge text-bg-danger">inactivo</span>`;

  const rolTxt = u.rol ?? "—";
  return `
    <tr>
      <td>${u.id ?? "—"}</td>
      <td>${u.nombre ?? "—"}</td>
      <td>${u.email ?? "—"}</td>
      <td><span class="badge text-bg-secondary">${rolTxt}</span></td>
      <td>${badgeEstado}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-primary me-2" data-edit="${u.id}">
          <i class="bi bi-pencil"></i> Editar
        </button>
        ${
          estado === "activo"
            ? `<button class="btn btn-sm btn-outline-danger" data-off="${u.id}">
                 <i class="bi bi-person-dash"></i> Desactivar
               </button>`
            : `<button class="btn btn-sm btn-outline-success" data-on="${u.id}">
                 <i class="bi bi-person-check"></i> Activar
               </button>`
        }
      </td>
    </tr>
  `;
}

/* ========== Data ========== */
// Cancelación de peticiones de lista si el usuario teclea rápido
let listAbort = null;

async function listar() {
  if (!grid) return;

  // cancelar petición anterior si sigue en vuelo
  if (listAbort) listAbort.abort();
  listAbort = new AbortController();

  grid.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Cargando…</td></tr>`;

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
    // ⬇️ NUEVO: soporta [ ... ] o { usuarios:[ ... ] }
    const lista = Array.isArray(data) ? data : (Array.isArray(data?.usuarios) ? data.usuarios : []);

    if (lista.length === 0) {
      grid.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Sin resultados</td></tr>`;
      return;
    }
    grid.innerHTML = lista.map(rowTemplate).join("");
  } catch (e) {
    if (e.name === "AbortError") return; // fue cancelada por otra búsqueda
    grid.innerHTML = `<tr><td colspan="6" class="text-center text-danger">Error al listar</td></tr>`;
    flash("danger", e.message || "Error al listar");
  }
}

/* ========== Eventos UI ========== */
btnBuscar?.addEventListener("click", listar);
filtroEstado?.addEventListener("change", listar);

if (buscar) {
  // Enter para buscar
  buscar.addEventListener("keydown", (e) => { if (e.key === "Enter") listar(); });
  // debounce en escritura
  let t = null;
  buscar.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(listar, 350);
  });
}

btnNuevo?.addEventListener("click", () => {
  if (!modal) return;
  titulo.textContent = "Nuevo usuario";
  uid.value = "";
  nombre.value = "";
  email.value = "";
  rol.value = "docente";
  password.value = "";
  grpPass?.classList.remove("d-none"); // password visible/obligatorio al crear
  modal.show();
});

grid?.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const id = btn.dataset.edit || btn.dataset.off || btn.dataset.on;
  if (!id) return;

  // Editar: prellenar
  if (btn.dataset.edit) {
    const tr = btn.closest("tr");
    if (!tr || !modal) return;

    uid.value    = id;
    nombre.value = tr.children[1]?.textContent.trim() || "";
    email.value  = tr.children[2]?.textContent.trim() || "";
    // la celda 3 es el badge; usar innerText para obtener solo el texto del rol
    rol.value    = tr.children[3]?.innerText.trim() || "docente";

    password.value = "";
    grpPass?.classList.add("d-none"); // no se cambia password aquí
    titulo.textContent = `Editar usuario #${id}`;
    modal.show();
    return;
  }

  // Desactivar
  if (btn.dataset.off) {
    if (!confirm("¿Desactivar este usuario?")) return;
    const res = await fetch(`${API}/${id}/desactivar`, { method: "PATCH", credentials: "include" });
    if (res.ok) { flash("success", "Usuario desactivado"); listar(); }
    else flash("danger", `No se pudo desactivar (HTTP ${res.status})`);
    return;
  }

  // Activar
  if (btn.dataset.on) {
    const res = await fetch(`${API}/${id}/activar`, { method: "PATCH", credentials: "include" });
    if (res.ok) { flash("success", "Usuario activado"); listar(); }
    else flash("danger", `No se pudo activar (HTTP ${res.status})`);
    return;
  }
});

// Guardar (crear/editar)
form?.addEventListener("submit", async (e) => {
  e.preventDefault();

  // Validación mínima en cliente
  if (!nombre?.checkValidity() || !email?.checkValidity() || !rol?.value) {
    form.reportValidity?.();
    return;
  }
  const isEdit = !!uid.value;

  const payload = {
    email:  email.value.trim(),
    nombre: nombre.value.trim(),
    rol:    rol.value
  };

  if (!isEdit) {
    if (!password.value || password.value.length < 8) {
      password?.focus();
      flash("warning", "La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    payload.password = password.value;
  }

  const url = isEdit ? `${API}/${uid.value}` : API;
  const method = isEdit ? "PUT" : "POST";

  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include"
    });

    if (!res.ok) {
      let err = `Error al guardar (HTTP ${res.status})`;
      try { const j = await res.json(); if (j?.detail) err = j.detail; } catch {}
      flash("danger", err);
      return;
    }

    modal?.hide();
    flash("success", isEdit ? "Usuario actualizado" : "Usuario creado");
    listar();
  } catch (e) {
    flash("danger", e.message || "Error de red");
  }
});

/* ========== Inicial ========== */
listar();

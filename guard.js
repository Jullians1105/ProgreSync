// /guard.js

// Usa el mismo host del frontend para que la cookie de sesión viaje
export const API_BASE = `http://${location.hostname}:8000`;

/**
 * Valida sesión y (opcional) el rol.
 * Deja disponible una promesa global: window.SESION_PROMISE
 * Devuelve: { id, email, role, rol }
 */
export function requireRole(rolesPermitidos = null) {
  const p = (async () => {
    const r = await fetch(`${API_BASE}/me`, { credentials: "include" });
    if (!r.ok) {
      // sin sesión
      location.href = "/iniciosesion/iniciosesion.html";
      throw new Error("No autenticado");
    }
    const me = await r.json();
    const role = me?.user?.rol ?? me?.user?.role ?? null;
    if (rolesPermitidos && !rolesPermitidos.includes(role)) {
      alert("No tienes permiso para esta vista");
      location.href = "/index.html";
      throw new Error("Sin permisos");
    }
    return me.user;
  })();

  // útil para otras vistas/scripts
  window.SESION_PROMISE = p;
  return p;
}

// /guard.js
export const API_BASE = "http://localhost:8000";

// Valida sesión y rol. Si no hay sesión o el rol no coincide, redirige.
export async function requireRole(roles = ["estudiante"]) {
  try {
    const r = await fetch(`${API_BASE}/me`, { credentials: "include" });
    if (!r.ok) {
      // sin sesión → al login
      window.location.href = "/iniciosesion/iniciosesion.html";
      return null;
    }
    const data = await r.json();
    const rol = data?.user?.rol || data?.user?.role;
    if (!rol || !roles.includes(rol)) {
      alert("No tienes permiso para esta vista");
      window.location.href = "/index.html";
      return null;
    }
    return data.user;
  } catch (e) {
    console.error("Guard error:", e);
    alert("Error verificando sesión");
    window.location.href = "/index.html";
    return null;
  }
}

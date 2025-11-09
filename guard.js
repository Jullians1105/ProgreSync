// /guard.js

// FRONT en 5500 (static) y API en 8000 (Express/FastAPI)
export const API_BASE   = `http://${location.hostname}:8000`;
export const FRONT_BASE = `http://${location.hostname}:5500`;

/* ───────── Helpers "volver después del login" ───────── */
export function redirectToLoginWithBack() {
  try {
    // No guardes back si ya estás en la página de login para evitar bucle
    const isLogin = location.pathname.endsWith("/iniciosesion/iniciosesion.html");
    if (!isLogin) {
      sessionStorage.setItem("backAfterLogin", location.pathname + location.search + location.hash);
    }
  } catch {}
  location.href = "/iniciosesion/iniciosesion.html";
}

export function getBackAfterLogin() {
  try { return sessionStorage.getItem("backAfterLogin"); } catch { return null; }
}

export function clearBackAfterLogin() {
  try { sessionStorage.removeItem("backAfterLogin"); } catch {}
}

/* ───────── Helpers de fetch con cookies ───────── */
export const api = (path, options = {}) =>
  fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });

export const apiJSON = async (path, options = {}) => {
  const r = await api(path, options);
  if (!r.ok) {
    // Intenta extraer mensaje útil
    let msg = `HTTP ${r.status}`;
    try {
      const body = await r.json();
      if (body?.detail) msg += `: ${body.detail}`;
      else if (body?.error) msg += `: ${body.error}`;
    } catch {
      try { msg += `: ${await r.text()}`; } catch {}
    }
    throw new Error(msg);
  }
  return r.json();
};

/* ───────── Sesión centralizada ─────────
 * - Valida sesión y (opcional) rol.
 * - Expone window.SESION_PROMISE para que otras vistas lo lean.
 * - Devuelve objeto usuario (ej. { id, email, rol }).
 */
let _sessionCache = null;     // cache en memoria para evitar llamadas repetidas
let _sessionInFlight = null;  // promesa en vuelo para de-duplicar

function normalizeUser(u) {
  if (!u) return null;
  const role = u.rol ?? u.role ?? null;
  return { ...u, rol: role };
}

export function requireRole(rolesPermitidos = null) {
  // Re-usa promesa en vuelo si ya estamos pidiendo /me
  if (_sessionInFlight) {
    const p = _sessionInFlight.then(user => {
      if (!user) throw new Error("No autenticado");
      if (rolesPermitidos && !rolesPermitidos.includes(user.rol) && user.rol !== "admin") {
        alert("No tienes permiso para esta vista");
        location.href = "/index.html";
        throw new Error("Sin permisos");
      }
      return user;
    });
    window.SESION_PROMISE = p.catch(() => null);
    return p;
  }

  const p = (async () => {
    // Usa cache si ya la tenemos
    if (_sessionCache) return _sessionCache;

    // 1) Preguntar al backend por la sesión
    let r;
    try {
      r = await fetch(`${API_BASE}/me`, { credentials: "include" });
    } catch {
      // caída de red → mándalo a login
      redirectToLoginWithBack();
      throw new Error("No autenticado");
    }

    if (!r.ok) {
      redirectToLoginWithBack();
      throw new Error("No autenticado");
    }

    // 2) Parsear JSON con tolerancia a { user: {...} } o {...}
    let meJson = null;
    try { meJson = await r.json(); } catch {}
    const user = normalizeUser(meJson?.user ?? meJson ?? null);

    if (!user) {
      redirectToLoginWithBack();
      throw new Error("No autenticado");
    }

    // 3) Verificar permisos (si aplica)
    if (rolesPermitidos && !rolesPermitidos.includes(user.rol) && user.rol !== "admin") {
      alert("No tienes permiso para esta vista");
      location.href = "/index.html";
      throw new Error("Sin permisos");
    }

    _sessionCache = user; // guarda en cache
    return user;
  })();

  _sessionInFlight = p.finally(() => { _sessionInFlight = null; });

  // expone promesa global sin dejar pendientes sin manejar
  window.SESION_PROMISE = p.catch(() => null);
  return p;
}

/* ───────── Guards convenientes ───────── */
export async function ensureAuth() {
  try { return !!(await requireRole()); } catch { return false; }
}
export async function ensureAdmin() {
  try { return !!(await requireRole(["admin"])); } catch { return false; }
}
export async function getSession() {
  try {
    if (_sessionCache) return _sessionCache;
    return await requireRole(); // obtiene y cachea
  } catch {
    return null;
  }
}

/* ───────── Logout conveniente ───────── */
export async function logoutAndGoHome() {
  try { await api("/logout", { method: "POST" }); } catch {}
  _sessionCache = null;
  clearBackAfterLogin();
  location.href = "/index.html";
}

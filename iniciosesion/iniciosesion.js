// /iniciosesion/iniciosesion.js
// Cárgalo con <script type="module" ...>

import { API_BASE, getBackAfterLogin, clearBackAfterLogin } from "/guard.js";

document.addEventListener("DOMContentLoaded", () => {
  const form       = document.getElementById("loginForm");
  const emailInput = document.getElementById("email");
  const passInput  = document.getElementById("password");
  const msg        = document.getElementById("loginMsg");

  // helper de mensajes
  const show = (text, type = "info") => {
    if (!msg) { alert(text); return; }
    msg.textContent = text;
    msg.style.color =
      type === "error" ? "#b00020" : type === "ok" ? "#0a7c2f" : "#444";
  };

  // Autorrelleno desde query params (opcional)
  try {
    const q = new URLSearchParams(location.search);
    if (q.get("email"))    emailInput.value = q.get("email");
    if (q.get("password")) passInput.value  = q.get("password");
  } catch {}

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = String(emailInput.value || "").trim().toLowerCase();
    const password = String(passInput.value || "");

    if (!email || !password) {
      show("Debo ingresar el e-mail y la contraseña.", "error");
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.style.opacity = "0.7";
    show("Verificando credenciales…");

    try {
      // 1) Login
      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // para que la cookie viaje
        body: JSON.stringify({ email, password }),
      });

      let data = null;
      try { data = await res.json(); } catch {}

      if (!res.ok) {
        const detail = data?.detail || data?.error || "Credenciales inválidas o error en el servidor.";
        show(detail, "error");
        return;
      }

      // 2) Consultar sesión/rol
      const meRes = await fetch(`${API_BASE}/me`, { credentials: "include" });
      let me = null;
      try { me = await meRes.json(); } catch {}
      const role = me?.user?.rol || me?.user?.role || null;

      // 3) Redirecciones
      show("Inicio de sesión correcto. Redirigiendo…", "ok");

      if (role === "admin") {
        // Admin va directo al panel
        window.location.href = "/admin/admin.html";
        return;
      }

      // No admin: volver a donde estaba o home
      const back = getBackAfterLogin();
      if (back) {
        clearBackAfterLogin();
        window.location.href = back;
      } else {
        window.location.href = "/index.html";
      }
    } catch (err) {
      console.error(err);
      show("Error de red. Verifica que el backend esté en ejecución.", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.style.opacity = "1";
    }
  });
});

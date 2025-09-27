// iniciosesion/iniciosesion.js

// 1) Backend API base (tu servidor Express en 8000)
const API_BASE = "http://localhost:8000";

document.addEventListener("DOMContentLoaded", () => {
  // 2) Referencias seguras
  const form = document.querySelector("#loginForm") || document.querySelector("form");
  const emailInput = document.querySelector("#email") || document.querySelector("#username") || document.querySelector('input[type="email"]');
  const passInput  = document.querySelector("#password") || document.querySelector('input[type="password"]');
  let msg = document.getElementById("loginMsg");

  if (!form || !emailInput || !passInput) {
    console.error("Login: faltan elementos del formulario", { form, emailInput, passInput });
    return;
  }

  // 3) Mensajes
  if (!msg) {
    msg = document.createElement("p");
    msg.id = "loginMsg";
    msg.style.marginTop = "8px";
    msg.style.fontSize = "0.95rem";
    msg.style.color = "#444";
    (document.querySelector(".form-actions") || form).appendChild(msg);
  }
  const show = (text, type = "info") => {
    msg.textContent = text;
    msg.style.color = type === "error" ? "#b00020" : type === "ok" ? "#0a7c2f" : "#444";
  };

  // 4) Submit
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = String(emailInput.value || "").trim().toLowerCase();
    const password = String(passInput.value || "");
    if (!email || !password) return show("Debo ingresar el e-mail y la contraseña.", "error");

    const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.style.opacity = "0.7"; }
    show("Verificando credenciales…");

    try {
      // POST /login
      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // importante: cookies de sesión
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        show(data?.error || "Credenciales inválidas o error en el servidor.", "error");
        return;
      }

      // GET /me para conocer el rol
      const meRes = await fetch(`${API_BASE}/me`, { credentials: "include" });
      const me = await meRes.json().catch(() => null);
      const rol = me?.user?.rol || me?.user?.role;

      show("Inicio de sesión correcto. Redirigiendo…", "ok");

      // Redirección por rol
      if (rol === "admin")        location.href = "/admin/dashboard.html";
      else if (rol === "docente") location.href = "/docente/inicio.html";
      else if (rol === "estudiante") location.href = "/estudiante/inicio.html";
      else                        location.href = "/index.html";
    } catch (err) {
      console.error("LOGIN_FETCH_ERROR", err);
      show("Error de red/CORS. Verifica que el backend esté corriendo.", "error");
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = "1"; }
    }
  });
});

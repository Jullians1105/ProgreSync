// iniciosesion/iniciosesion.js

// Usamos el mismo host del frontend para que la cookie de sesión viaje
const API_BASE = `http://${location.hostname}:8000`;

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const emailInput = document.getElementById("email");
  const passInput = document.getElementById("password");
  const msg = document.getElementById("loginMsg");

  // helper de mensajes
  const show = (text, type = "info") => {
    msg.textContent = text;
    msg.style.color =
      type === "error" ? "#b00020" : type === "ok" ? "#0a7c2f" : "#444";
  };

  // Por si llegaron query params, los rellenamos
  try {
    const q = new URLSearchParams(location.search);
    if (q.get("email")) emailInput.value = q.get("email");
    if (q.get("password")) passInput.value = q.get("password");
  } catch {}

  form.addEventListener("submit", async (e) => {
    e.preventDefault(); // ¡IMPORTANTE!

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
      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // para que la cookie de sesión viaje
        body: JSON.stringify({ email, password }),
      });

      let data = null;
      try { data = await res.json(); } catch {}

      if (!res.ok) {
        show(data?.error || "Credenciales inválidas o error en el servidor.", "error");
        return;
      }

      // Consultamos la ruta /me para obtener el rol del usuario, así podemos redirigirlo según corresponda
      const meRes = await fetch(`${API_BASE}/me`, { credentials: "include" });
      let me = null;
      try { me = await meRes.json(); } catch {}

      const role = me?.user?.rol || me?.user?.role || null;
      show("Inicio de sesión correcto. Redirigiendo…", "ok");

      // Redirige a la página de inicio "index.html"
      window.location.href = "../index.html";
    } catch (err) {
      console.error(err);
      show("Error de red. Verifica que el backend esté en ejecución.", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.style.opacity = "1";
    }
  });
});




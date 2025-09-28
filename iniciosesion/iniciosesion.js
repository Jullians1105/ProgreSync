// iniciosesion/iniciosesion.js

// 1) Apunto al backend que tengo corriendo en localhost:8000
//    Si más adelante cambio el puerto o el host, solo lo ajusto aquí.
// 1) Backend API base (tu servidor Express en 8000)
const API_BASE = "http://localhost:8000";

// 2) Espero a que cargue el DOM para enganchar los eventos del formulario.
document.addEventListener("DOMContentLoaded", () => {
  // Tomo referencias a los elementos del formulario
  const form = document.querySelector("form");
  const emailInput = document.getElementById("username");
  const passInput = document.getElementById("password");

  // Creo/obtengo un contenedor para mensajes de estado debajo del botón
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
    const actions = document.querySelector(".form-actions") || form;
    actions.appendChild(msg);
    (document.querySelector(".form-actions") || form).appendChild(msg);
  }

  // Función pequeña para mostrar mensajes
  const show = (text, type = "info") => {
    msg.textContent = text;
    msg.style.color = type === "error" ? "#b00020" : type === "ok" ? "#0a7c2f" : "#444";
  };

  // 3) Manejo el submit del formulario
  // 4) Submit
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); // evito el envío tradicional
    e.preventDefault();

    // Leo y normalizo lo que llenó el usuario
    const email = String(emailInput.value || "").trim().toLowerCase();
    const password = String(passInput.value || "");
    if (!email || !password) return show("Debo ingresar el e-mail y la contraseña.", "error");

    // Validaciones mínimas en cliente
    if (!email || !password) {
      show("Debo ingresar el e-mail y la contraseña.", "error");
      return;
    }

    // Deshabilito el formulario mientras hago la petición
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.style.opacity = "0.7";
    const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.style.opacity = "0.7"; }
    show("Verificando credenciales…");

    try {
      // 4) Llamo a POST /login y envío las cookies (credentials: 'include')
      // POST /login
      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // importante para que viaje la cookie de sesión
        credentials: "include", // importante: cookies de sesión
        body: JSON.stringify({ email, password }),
      });

      // Intento parsear respuesta (si no es JSON, no rompo)
      let data = null;
      try { data = await res.json(); } catch { data = null; }

      if (!res.ok) {
        // Muestro el error que vino del servidor si existe
        const msgSrv = data?.error || "Credenciales inválidas o error en el servidor.";
        show(msgSrv, "error");
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        show(data?.error || "Credenciales inválidas o error en el servidor.", "error");
        return;
      }

      // 5) Si el login fue OK, puedo consultar /me para conocer el rol y decidir adónde ir
      // GET /me para conocer el rol
      const meRes = await fetch(`${API_BASE}/me`, { credentials: "include" });
      let me = null;
      try { me = await meRes.json(); } catch { me = null; }

      // Si no pude leer /me, igualmente considero el login como correcto
      const role = me?.user?.role || me?.user?.rol || null;
      const me = await meRes.json().catch(() => null);
      const rol = me?.user?.rol || me?.user?.role;

      show("Inicio de sesión correcto. Redirigiendo…", "ok");

      // 6) Redirección: por ahora voy a la portada. Si tengo rol, puedo personalizar:
      //    - admin     -> '/admin/dashboard.html'
      //    - docente   -> '/docente/inicio.html'
      //    - estudiante-> '/estudiante/inicio.html'
      //    - empresa   -> '/empresa/inicio.html'
      switch (role) {
        case "admin":
          window.location.href = "../index.html"; // cámbialo cuando tengas la página de admin
          break;
        case "docente":
        case "estudiante":
        case "empresa":
          window.location.href = "../index.html"; // cámbialo cuando tengas cada home
          break;
        default:
          window.location.href = "../index.html"; // por defecto, al home general
      }
      // Redirección por rol
      if (rol === "admin")        location.href = "/admin/dashboard.html";
      else if (rol === "docente") location.href = "/docente/inicio.html";
      else if (rol === "estudiante") location.href = "/estudiante/inicio.html";
      else                        location.href = "/index.html";
    } catch (err) {
      // 7) Si falla la red/CORS, informo claramente
      show("Error de red. Verifico que el backend esté en ejecución y que no haya bloqueos de CORS.", "error");
      console.error(err);
      console.error("LOGIN_FETCH_ERROR", err);
      show("Error de red/CORS. Verifica que el backend esté corriendo.", "error");
    } finally {
      // Reactivo el botón
      submitBtn.disabled = false;
      submitBtn.style.opacity = "1";
      if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = "1"; }
    }
  });
});

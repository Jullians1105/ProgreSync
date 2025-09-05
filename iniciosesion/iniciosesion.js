// Dirección del backend (ajusta el puerto si cambia)
const API_BASE = "http://localhost:8000";

// Referencias a elementos del DOM
const form = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const msgEl = document.getElementById("msg");

// Función para mostrar mensajes en la pantalla
function showMsg(text, type = "info") {
  msgEl.textContent = text;
  msgEl.className = type; // puedes definir estilos .info, .error, .success en CSS
}

// Chequea si ya hay una sesión activa
async function checkSession() {
  try {
    const res = await fetch(`${API_BASE}/me`, {
      credentials: "include", // incluye la cookie de sesión
    });

    if (!res.ok) return; // si no hay sesión, no pasa nada

    const data = await res.json();
    if (data?.user) {
      // Si hay sesión, redirige según el rol del usuario
      const role = data.user.role;
      if (role === "admin")        window.location.href = "../admin/index.html";
      else if (role === "docente") window.location.href = "../docente/index.html";
      else if (role === "empresa") window.location.href = "../empresa/index.html";
      else                         window.location.href = "../estudiante/index.html";
    }
  } catch (err) {
    console.error("Error verificando sesión:", err);
  }
}

// Maneja el envío del formulario
form.addEventListener("submit", async (e) => {
  e.preventDefault(); // evita que recargue la página

  showMsg("Validando credenciales…");

  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;

  if (!email || !password) {
    showMsg("Por favor ingresa correo y contraseña.", "error");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // NECESARIO para que guarde la cookie
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showMsg(err?.error || "No se pudo iniciar sesión.", "error");
      return;
    }

    const data = await res.json();
    if (data?.ok) {
      showMsg("Sesión iniciada. Redirigiendo…", "success");
      setTimeout(checkSession, 500); // revisa rol y redirige
    } else {
      showMsg("Credenciales inválidas.", "error");
    }
  } catch (err) {
    console.error("Error de red:", err);
    showMsg("Error de red. Verifica que el backend esté en ejecución.", "error");
  }
});

// Cuando se carga la página, revisa si ya hay sesión activa
checkSession();

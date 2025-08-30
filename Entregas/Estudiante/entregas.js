// Yo apunto a mi API local
const API = "http://localhost:8000/api/entregas";
const ID_ESTUDIANTE = window.SESION.id; // viene del guard.js

// Función para escapar texto y evitar XSS
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));

// Yo cargo mis entregas
async function cargarMisEntregas() {
  const tbody = document.getElementById("tbody-entregas");
  tbody.innerHTML = "<tr><td colspan='5'>Cargando...</td></tr>";
  try {
    const res = await fetch(`${API}/mis/${ID_ESTUDIANTE}`);
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) {
      tbody.innerHTML = "<tr><td colspan='5'>Sin entregas aún</td></tr>";
      return;
    }
    tbody.innerHTML = data.map(e=>`
      <tr>
        <td>${esc(e.titulo)}</td>
        <td>${esc(e.descripcion)}</td>
        <td><a href="${esc(e.archivo)}" target="_blank">Ver</a></td>
        <td><span class="badge badge-${esc(e.estado)}">${esc(e.estado)}</span></td>
        <td>${new Date(e.fecha).toLocaleString()}</td>
      </tr>
    `).join("");
  } catch(err) {
    tbody.innerHTML = "<tr><td colspan='5' class='text-danger'>Error al cargar</td></tr>";
  }
}

// Yo escucho el submit del form
document.getElementById("form-entrega").addEventListener("submit", async e=>{
  e.preventDefault();
  const fd = new FormData(e.target);
  fd.append("id_estudiante", ID_ESTUDIANTE);

  const msg = document.getElementById("msg");
  msg.textContent = "Enviando...";
  try {
    const res = await fetch(API, { method:"POST", body:fd });
    if (!res.ok) throw new Error("Error al enviar");
    msg.textContent = "¡Enviado!";
    e.target.reset();
    cargarMisEntregas();
  } catch(err) {
    msg.textContent = "Error";
  }
});

cargarMisEntregas();


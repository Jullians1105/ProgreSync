const API = "http://localhost:8000/api/entregas";
const ID_DOCENTE = window.SESION.id;

const esc = (s) => String(s ?? "");

async function cargarPendientes(){
  const grid = document.getElementById("grid");
  grid.innerHTML = "<p>Cargando...</p>";
  try {
    const res = await fetch(`${API}/pendientes`);
    const data = await res.json();
    if (!Array.isArray(data) || !data.length){
      grid.innerHTML = "<p>No hay entregas pendientes</p>";
      return;
    }
    grid.innerHTML = data.map(e=>`
      <div class="col-md-4">
        <div class="card text-dark mb-3">
          <div class="card-body">
            <h5>${esc(e.titulo)}</h5>
            <p>${esc(e.descripcion)}</p>
            <p><a href="${esc(e.archivo)}" target="_blank">Ver archivo</a></p>
            <button class="btn btn-success btn-sm" onclick="resolver(${e.id},'aprobado')">Aprobar</button>
            <button class="btn btn-danger btn-sm" onclick="resolver(${e.id},'rechazado')">Rechazar</button>
          </div>
        </div>
      </div>
    `).join("");
  } catch(err){
    grid.innerHTML = "<p class='text-danger'>Error cargando</p>";
  }
}

async function resolver(id,estado){
  const comentario = prompt(`Comentario (${estado}):`) || "";
  await fetch(`${API}/${id}/revision`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({id_docente:ID_DOCENTE,nuevo_estado:estado,comentario})
  });
  cargarPendientes();
}

document.getElementById("btn-cargar").addEventListener("click",cargarPendientes);


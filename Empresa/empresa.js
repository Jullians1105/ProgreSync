// API base: usa el mismo helper que notificaciones.js
const API_BASE = (() => {
  try {
    const params = new URLSearchParams(location.search);
    const q = params.get('api');
    if (q) return q.replace(/\/$/, '');
  } catch (e) {}
  if (typeof window !== 'undefined' && window.API_BASE) return window.API_BASE.replace(/\/$/, '');
  try {
    return `http://${location.hostname}:8000`;
  } catch (e) {
    return 'http://localhost:8000';
  }
})();

/* Utilidades */
async function apiGet(path, opts = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
  const res = await fetch(url, { credentials: 'include', ...opts });
  if (!res.ok) {
    const err = new Error(`Error ${res.status}: ${res.statusText}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function fmtDate(dstr) {
  try {
    const d = new Date(dstr);
    return d.toLocaleString();
  } catch (e) { return dstr; }
}

function mostrarError(msg) {
  alert(msg); // Podemos mejorar esto con un toast/notificación mejor
}

/* Renderizado */
function renderEstudiante(est) {
  return `
    <div class="estudiante-item" data-id="${est.id}" data-nombre="${est.nombre}">
      <div class="estudiante-nombre">${est.nombre}</div>
      <div class="estudiante-email">${est.email}</div>
    </div>
  `;
}

function renderEntrega(ent) {
  return `
    <div class="entrega-item">
      <div class="entrega-titulo">${ent.titulo}</div>
      <div class="entrega-meta">
        Fecha: ${fmtDate(ent.fecha)}
        <span class="entrega-estado estado-${ent.estado}">${ent.estado}</span>
      </div>
      ${ent.descripcion ? `<div class="entrega-desc">${ent.descripcion}</div>` : ''}
      ${ent.comentario_docente ? `
        <div class="entrega-comentario">
          <strong>Comentario del docente:</strong><br/>
          ${ent.comentario_docente}
        </div>
      ` : ''}
      <div class="entrega-descarga">
        <a href="${API_BASE}${ent.archivo}" target="_blank">Descargar informe</a>
      </div>
    </div>
  `;
}

/* Estado y navegación */
let estudianteActual = null;

function mostrarSeccion(id) {
  document.querySelectorAll('main > section').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

async function cargarEstudiantes() {
  try {
    const estudiantes = await apiGet('/api/empresa/mis-estudiantes');
    const lista = document.getElementById('listaEstudiantes');
    
    if (!estudiantes?.length) {
      lista.innerHTML = '<p>No hay estudiantes asignados.</p>';
      return;
    }

    lista.innerHTML = estudiantes.map(renderEstudiante).join('');
    
    // Eventos click
    lista.querySelectorAll('.estudiante-item').forEach(el => {
      el.addEventListener('click', () => verEntregas(
        el.dataset.id,
        el.dataset.nombre
      ));
    });

  } catch (err) {
    if (err.status === 401) {
      mostrarError('No autenticado. Por favor inicie sesión.');
      return;
    }
    if (err.status === 403) {
      mostrarError('Acceso denegado. Esta sección es solo para empresas.');
      return;
    }
    console.error('Error cargando estudiantes:', err);
    mostrarError('Error cargando la lista de estudiantes.');
  }
}

async function verEntregas(idEstudiante, nombreEstudiante) {
  try {
    estudianteActual = { id: idEstudiante, nombre: nombreEstudiante };
    
    // Actualizar UI
    document.getElementById('nombreEstudiante').textContent = nombreEstudiante;
    mostrarSeccion('entregas');
    
    // Cargar entregas
    const entregas = await apiGet(`/api/empresa/entregas/${idEstudiante}`);
    const lista = document.getElementById('listaEntregas');
    
    if (!entregas?.length) {
      lista.innerHTML = '<p>Este estudiante aún no tiene informes.</p>';
      return;
    }

    lista.innerHTML = entregas.map(renderEntrega).join('');

  } catch (err) {
    console.error('Error cargando entregas:', err);
    mostrarError('Error cargando los informes del estudiante.');
  }
}

/* Eventos */
document.addEventListener('DOMContentLoaded', () => {
  // Cargar información del usuario
  apiGet('/me')
    .then(data => {
      document.getElementById('userInfo').textContent = 
        `${data.user.nombre} (${data.user.email})`;
    })
    .catch(console.error);

  // Cargar lista inicial
  cargarEstudiantes();

  // Botón volver
  document.getElementById('volverBtn').onclick = () => {
    estudianteActual = null;
    mostrarSeccion('estudiantes');
  };
});
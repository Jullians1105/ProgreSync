// API base: intenta estas fuentes (en este orden):
// 1) query param ?api=http://host:port
// 2) window.API_BASE (si lo defines en la página)
// 3) por defecto http://localhost:8000
const API_BASE = (() => {
  try {
    const params = new URLSearchParams(location.search);
    const q = params.get('api');
    if (q) return q.replace(/\/$/, '');
  } catch (e) {}
  if (typeof window !== 'undefined' && window.API_BASE) return window.API_BASE.replace(/\/$/, '');
  // Por defecto usar el mismo hostname del navegador y puerto 8000 (coincide con login)
  try {
    return `http://${location.hostname}:8000`;
  } catch (e) {
    return 'http://localhost:8000';
  }
})();

async function apiGet(path, opts = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
  const res = await fetch(url, { credentials: 'include', ...opts });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { /* not json */ }
  if (!res.ok) {
    const err = new Error('API error ' + res.status + ' ' + (json?.error || text || res.statusText));
    err.status = res.status;
    err.body = json ?? text;
    throw err;
  }
  return json;
}

function fmtDate(dstr) {
  try {
    const d = new Date(dstr);
    return d.toLocaleString();
  } catch (e) { return dstr; }
}

async function load() {
  const emptyEl = document.getElementById('empty');
  try {
    // Modo de prueba: permite usar ?user=ID para forzar un usuario sin sesión
    const params = new URLSearchParams(location.search);
    const testUser = params.get('user');
    let id;
    if (testUser) {
      id = Number(testUser);
    } else {
      try {
        const me = await apiGet('/me');
        id = me.user?.id;
      } catch (err) {
        // Si es 401 => no autenticado
        if (err.status === 401) {
          emptyEl.textContent = 'No autenticado. Inicia sesión para ver tus notificaciones.';
          return;
        }
        console.error('Error obteniendo /me:', err);
        emptyEl.textContent = 'Error al obtener el usuario: ' + (err.message || err);
        return;
      }
    }

    if (!id) {
      emptyEl.textContent = 'ID de usuario inválido.';
      return;
    }

    // Obtener contador
    let unread;
    try {
      unread = await apiGet(`/api/notificaciones/mis/unread_count/${id}`);
      document.getElementById('unreadCount').textContent = `No leídas: ${unread.unread}`;
    } catch (err) {
      console.error('Error contador no leídas:', err);
      document.getElementById('unreadCount').textContent = 'Error contador';
    }

    // Obtener lista
    let items = [];
    try {
      items = await apiGet(`/api/notificaciones/mis/${id}`);
    } catch (err) {
      console.error('Error cargando notificaciones:', err);
      // Mensaje más detallado para ayudar al debug (por ejemplo, 404 de origen equivocado)
      if (err.status) {
        emptyEl.textContent = `Error al cargar notificaciones: API ${err.status} - ${err.message}`;
      } else {
        emptyEl.textContent = 'Error al cargar notificaciones: ' + (err.message || err);
      }
      // Sugerencia rápida
      emptyEl.innerHTML += '<br/><small>Si abriste el archivo directamente (file://) prueba con <code>?api=http://localhost:8000</code> o usa Live Server.</small>';
      return;
    }

    const list = document.getElementById('notificaciones');
    list.innerHTML = '';
    if (!items || !items.length) {
      emptyEl.textContent = 'No hay notificaciones.';
      return;
    }
    emptyEl.textContent = '';

    for (const n of items) {
      const li = document.createElement('li');
      li.className = 'notif' + (n.leido ? ' leida' : '');

      const left = document.createElement('div');
      const p = document.createElement('p');
      p.className = 'mensaje';
      p.textContent = n.mensaje;
      left.appendChild(p);

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = `${n.tipo} · ${fmtDate(n.fecha)}`;
      left.appendChild(meta);

      const right = document.createElement('div');
      if (!n.leido) {
        const btn = document.createElement('button');
        btn.className = 'btn small';
        btn.textContent = 'Marcar como leída';
        btn.onclick = async () => {
          try {
            // Usar API_BASE para asegurar que la petición vaya al backend (no al origen del static server)
            const url = `${API_BASE}/api/notificaciones/${n.id}/read`;
            const res = await fetch(url, { method: 'PATCH', credentials: 'include' });
            if (!res.ok) throw new Error('No se pudo marcar');
            btn.disabled = true;
            li.classList.add('leida');
            const newCount = await apiGet(`/api/notificaciones/mis/unread_count/${id}`);
            document.getElementById('unreadCount').textContent = `No leídas: ${newCount.unread}`;
          } catch (err) { console.error('Error marcando como leída:', err); }
        };
        right.appendChild(btn);
      }

      li.appendChild(left);
      li.appendChild(right);
      list.appendChild(li);
    }

  } catch (err) {
    console.error(err);
    document.getElementById('empty').textContent = 'Error inesperado al cargar notificaciones.';
  }
}

document.addEventListener('DOMContentLoaded', load);

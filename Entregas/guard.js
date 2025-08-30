// guard.js
export function requireRole(rolesPermitidos=[]){
  try{
    const sesion = JSON.parse(localStorage.getItem('sesion')||'null');
    if (!sesion || !rolesPermitidos.includes(sesion.rol)){
      alert("No tienes permiso para esta vista");
      location.href = "../../iniciosesion/index.html";
    }
    return sesion;
  }catch{
    location.href = "../../iniciosesion/index.html";
  }
}


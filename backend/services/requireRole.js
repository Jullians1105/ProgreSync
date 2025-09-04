// Este middleware verifica que exista una sesión y que el rol del usuario coincida con los permitidos.
// Lo usaré para proteger rutas que solo el admin puede ejecutar (por ejemplo, crear usuarios).
export function requireRole(...rolesPermitidos) {
  return (req, res, next) => {
    const user = req.session?.user;
    if (!user) return res.status(401).json({ error: "No autenticado" });
    if (!rolesPermitidos.includes(user.role)) {
      return res.status(403).json({ error: "Sin permisos" });
    }
    next();
  };
}

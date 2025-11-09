// backend/middlewares/audit.js
import { exec } from "../services/db.js";

export async function writeAudit(entry) {
  const sql = `
    INSERT INTO audit_logs
      (user_id, user_email, user_role, action, entity, entity_id,
       method, path, ip, user_agent, before_json, after_json, status_code)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `;
  const vals = [
    entry.user_id ?? null,
    entry.user_email ?? null,
    entry.user_role ?? null,
    entry.action,
    entry.entity,
    entry.entity_id ?? null,
    entry.method ?? null,
    entry.path ?? null,
    entry.ip ?? null,
    entry.user_agent ?? null,
    entry.before_json ? JSON.stringify(entry.before_json) : null,
    entry.after_json  ? JSON.stringify(entry.after_json)  : null,
    entry.status_code ?? null,
  ];
  try { await exec(sql, vals); } catch (_) {}
}

export function auditMutatingRequests(req, res, next) {
  const mutating = ["POST", "PUT", "PATCH", "DELETE"];
  if (!mutating.includes(req.method)) return next();
  console.log("🟢 Auditoría detectó una mutación:", req.method, req.path);

  const user = req.user || {};
  const ip   = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || null;
  const ua   = req.headers["user-agent"] || null;

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    const { entity, entityId } = inferEntity(req);
    writeAudit({
      user_id:    user.id,
      user_email: user.email,
      user_role:  user.rol || user.role,
      action:     actionFrom(req.method),
      entity,
      entity_id:  entityId || body?.id || body?.data?.id || null,
      method:     req.method,
      path:       req.originalUrl,
      ip,
      user_agent: ua,
      before_json: req.__before,
      after_json:  req.__after ?? body,
      status_code: res.statusCode,
    });
    return originalJson(body);
  };

  res.on("finish", () => {
    const ct = res.getHeader("content-type")?.toString() || "";
    if (ct.includes("application/json")) return;
    const { entity, entityId } = inferEntity(req);
    writeAudit({
      user_id:    user.id,
      user_email: user.email,
      user_role:  user.rol || user.role,
      action:     actionFrom(req.method),
      entity,
      entity_id:  entityId,
      method:     req.method,
      path:       req.originalUrl,
      ip,
      user_agent: ua,
      status_code: res.statusCode,
    });
  });

  next();
}

function inferEntity(req) {
  const parts = req.path.split("?")[0].split("/").filter(Boolean);
  return { entity: parts[0] || "desconocido", entityId: parts[1] || null };
}
function actionFrom(method) {
  switch (method) {
    case "POST": return "CREATE";
    case "PUT":
    case "PATCH": return "UPDATE";
    case "DELETE": return "DELETE";
    default: return "READ";
  }
}

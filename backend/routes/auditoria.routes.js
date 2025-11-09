import { Router } from "express";
import { query } from "../services/db.js";

const r = Router();

// Solo accesible para administradores
r.get("/", async (req, res) => {
  const u = req.session?.user;
  if (!u || (u.rol !== "admin" && u.role !== "admin")) {
    return res.status(403).json({ error: "Solo administradores" });
  }

  const {
    q, user, action, entity, from, to,
    page = 1, limit = 50, sort = "created_at", dir = "DESC"
  } = req.query;

  const where = [];
  const vals  = [];

  if (q)      { where.push("(user_email LIKE ? OR path LIKE ? OR action LIKE ? OR entity LIKE ?)"); vals.push(`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`); }
  if (user)   { where.push("(user_email = ? OR user_id = ?)"); vals.push(user, user); }
  if (action) { where.push("action = ?"); vals.push(action); }
  if (entity) { where.push("entity = ?"); vals.push(entity); }
  if (from)   { where.push("created_at >= ?"); vals.push(from); }
  if (to)     { where.push("created_at <= ?"); vals.push(to); }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const orderCol = ["created_at","action","entity","user_email","status_code"].includes(String(sort)) ? sort : "created_at";
  const orderSql = `ORDER BY ${orderCol} ${String(dir).toUpperCase()==="ASC"?"ASC":"DESC"}`;

  const pageNum  = Math.max(1, parseInt(page,10) || 1);
  const limNum   = Math.min(100, Math.max(1, parseInt(limit,10) || 50));
  const offset   = (pageNum - 1) * limNum;

  const rows = await query(
    `SELECT id, user_id, user_email, user_role, action, entity, entity_id,
            method, path, ip, user_agent, status_code, created_at
     FROM audit_logs
     ${whereSql}
     ${orderSql}
     LIMIT ? OFFSET ?`,
    [...vals, limNum, offset]
  );

  const total = await query(
    `SELECT COUNT(*) AS c FROM audit_logs ${whereSql}`,
    vals
  );

  res.json({
    data: rows,
    page: pageNum,
    total: total[0]?.c || 0,
    pages: Math.ceil((total[0]?.c || 0)/limNum)
  });
});

export default r;

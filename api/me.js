// GET /api/me  — Authorization: Bearer <stytch session_jwt>
// Returns { active, email, until } so the Leads Radar page can decide whether to open.
const { cors } = require("../lib/cors");
const { authenticateSession } = require("../lib/stytch");
const { hasAccess } = require("../lib/access");

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || "");
  if (!m) { res.statusCode = 401; return res.end(JSON.stringify({ active: false, reason: "no_session" })); }
  try {
    const d = await authenticateSession(m[1]);
    const user = d.user || {};
    const email = (user.emails && user.emails[0] && user.emails[0].email) || "";
    const a = (user.trusted_metadata && user.trusted_metadata.leads_radar) || {};
    const admins = (process.env.ADMIN_EMAILS || "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
    const active = admins.includes(email.toLowerCase()) || hasAccess(user.trusted_metadata);
    res.statusCode = 200;
    res.end(JSON.stringify({ active, email, status: a.status || null, until: a.paid_until || null }));
  } catch (e) {
    res.statusCode = e.status === 401 || e.status === 404 ? 401 : 500;
    res.end(JSON.stringify({ active: false, reason: res.statusCode === 401 ? "invalid_session" : "server_error" }));
  }
};

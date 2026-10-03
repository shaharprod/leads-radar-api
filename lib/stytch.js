// Stytch REST helpers (server side only). Secrets come from Vercel env vars.
const BASE = process.env.STYTCH_ENV === "live" ? "https://api.stytch.com/v1" : "https://test.stytch.com/v1";

function auth() {
  const id = process.env.STYTCH_PROJECT_ID, secret = process.env.STYTCH_SECRET;
  if (!id || !secret) throw new Error("missing STYTCH_PROJECT_ID / STYTCH_SECRET");
  return "Basic " + Buffer.from(id + ":" + secret).toString("base64");
}

async function call(method, path, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: auth() },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error("stytch " + path + " " + r.status + " " + (data.error_type || ""));
    err.status = r.status; err.data = data; throw err;
  }
  return data;
}

async function authenticateSession(sessionJwt) {
  return call("POST", "/sessions/authenticate", { session_jwt: sessionJwt });
}

async function findUserByEmail(email) {
  const d = await call("POST", "/users/search", {
    limit: 1,
    query: { operator: "AND", operands: [{ filter_name: "email_address", filter_value: [email] }] }
  });
  return (d.results && d.results[0]) || null;
}

async function getOrCreateUser(email) {
  const u = await findUserByEmail(email);
  if (u) return u;
  const d = await call("POST", "/users", { email });
  return d.user || { user_id: d.user_id, trusted_metadata: {} };
}

async function setAccess(userId, patch) {
  // trusted_metadata can only be written by the server
  const cur = await call("GET", "/users/" + encodeURIComponent(userId));
  const tm = Object.assign({}, (cur.user || cur).trusted_metadata || {});
  tm.leads_radar = Object.assign({}, tm.leads_radar || {}, patch, { updated_at: new Date().toISOString() });
  return call("PUT", "/users/" + encodeURIComponent(userId), { trusted_metadata: tm });
}

module.exports = { authenticateSession, findUserByEmail, getOrCreateUser, setAccess, _call: call };

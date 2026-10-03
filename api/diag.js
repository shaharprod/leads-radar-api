// GET /api/diag — verifies the server can actually talk to Stytch and PayPal with the configured keys.
// Reports only ok / error type, never any key values.
const { _call } = require("../lib/stytch");

async function paypalToken() {
  const BASE = process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  const r = await fetch(BASE + "/v1/oauth2/token", {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(process.env.PAYPAL_CLIENT_ID + ":" + process.env.PAYPAL_SECRET).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials"
  });
  const d = await r.json().catch(() => ({}));
  return r.ok ? { ok: true, app_id: d.app_id || null } : { ok: false, status: r.status, error: d.error || d.error_description || null };
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  const out = {};
  try { const d = await _call("POST", "/users/search", { limit: 1 }); out.stytch = { ok: true, users_found: (d.results || []).length }; }
  catch (e) { out.stytch = { ok: false, status: e.status || null, error: (e.data && e.data.error_type) || e.message }; }
  try { out.paypal = await paypalToken(); } catch (e) { out.paypal = { ok: false, error: e.message }; }
  out.paypal_webhook_id_set = Boolean(process.env.PAYPAL_WEBHOOK_ID);
  res.end(JSON.stringify(out));
};

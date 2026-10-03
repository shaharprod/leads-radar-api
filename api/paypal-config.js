// GET /api/paypal-config — public values the sales page needs to render PayPal subscription buttons.
// Client ID is a public identifier (it is embedded in every PayPal button page); the secret never leaves the server.
const { cors } = require("../lib/cors");
const { token, BASE } = require("../lib/paypal");

const NAMES = { monthly: "Leads Radar - Monthly", annual: "Leads Radar - Annual (one payment)" };
let cache = null, cacheAt = 0;

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  try {
    if (!cache || Date.now() - cacheAt > 10 * 60 * 1000) {
      const t = await token();
      const r = await fetch(BASE + "/v1/billing/plans?page_size=20", { headers: { Authorization: "Bearer " + t } });
      const d = await r.json();
      const plans = {};
      for (const [key, name] of Object.entries(NAMES)) {
        const p = (d.plans || []).find(x => x.name === name && x.status === "ACTIVE");
        if (p) plans[key] = p.id;
      }
      cache = { env: process.env.PAYPAL_ENV || "sandbox", client_id: process.env.PAYPAL_CLIENT_ID, currency: "ILS", plans };
      cacheAt = Date.now();
    }
    res.end(JSON.stringify(cache));
  } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: e.message })); }
};

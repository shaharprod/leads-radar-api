// GET /api/setup-plans — idempotent: creates the "Leads Radar" product and its subscription plans in PayPal
// if they don't exist yet, syncs the price of existing plans to PLANS below (update-pricing-schemes; affects
// new subscriptions only, existing subscribers keep their price), and returns their IDs. Safe to call repeatedly.
const { token, BASE } = require("../lib/paypal");

const PRODUCT = { name: "Leads Radar", description: "Leads Radar - business lead scanner (SaaS subscription)", type: "SERVICE", category: "SOFTWARE" };
const PLANS = [
  { key: "monthly", name: "Leads Radar - Monthly", price: "97.00", unit: "MONTH", count: 1, cycles: 0 },
  // 970 = 10 x 97: "pay for 10 months, get 12" (lowered from 1020 on 2026-10-03)
  { key: "annual", name: "Leads Radar - Annual (one payment)", price: "970.00", unit: "YEAR", count: 1, cycles: 0 }
];
// Plans that must NOT be offered any more; deactivated if found active.
const RETIRED = ["Leads Radar - Annual (12 payments of 85)"];

async function api(method, path, body, t) {
  const r = await fetch(BASE + path, { method, headers: { Authorization: "Bearer " + t, "Content-Type": "application/json", Prefer: "return=representation" }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(method + " " + path + " " + r.status + " " + JSON.stringify(d).slice(0, 300));
  return d;
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  try {
    const t = await token();
    // product
    const list = await api("GET", "/v1/catalogs/products?page_size=20", null, t);
    let product = (list.products || []).find(p => p.name === PRODUCT.name);
    let createdProduct = false;
    if (!product) { product = await api("POST", "/v1/catalogs/products", PRODUCT, t); createdProduct = true; }
    // plans
    const pl = await api("GET", "/v1/billing/plans?product_id=" + encodeURIComponent(product.id) + "&page_size=20", null, t);
    const existing = pl.plans || [];
    const out = {};
    for (const p of PLANS) {
      let plan = existing.find(x => x.name === p.name);
      let created = false, priceUpdated = false, priceBefore = null;
      if (plan) {
        // the list endpoint has no prices; fetch the plan to compare its current fixed price with PLANS
        const full = await api("GET", "/v1/billing/plans/" + plan.id, null, t);
        const cyc = (full.billing_cycles || []).find(c => c.tenure_type === "REGULAR") || (full.billing_cycles || [])[0];
        priceBefore = cyc && cyc.pricing_scheme && cyc.pricing_scheme.fixed_price ? cyc.pricing_scheme.fixed_price.value : null;
        if (priceBefore !== null && Number(priceBefore) !== Number(p.price)) {
          await api("POST", "/v1/billing/plans/" + plan.id + "/update-pricing-schemes", {
            pricing_schemes: [{ billing_cycle_sequence: cyc.sequence || 1, pricing_scheme: { fixed_price: { value: p.price, currency_code: "ILS" } } }]
          }, t);
          priceUpdated = true;
        }
      }
      if (!plan) {
        plan = await api("POST", "/v1/billing/plans", {
          product_id: product.id, name: p.name, status: "ACTIVE",
          billing_cycles: [{ frequency: { interval_unit: p.unit, interval_count: p.count }, tenure_type: "REGULAR", sequence: 1, total_cycles: p.cycles,
            pricing_scheme: { fixed_price: { value: p.price, currency_code: "ILS" } } }],
          payment_preferences: { auto_bill_outstanding: true, setup_fee_failure_action: "CONTINUE", payment_failure_threshold: 3 },
          taxes: { percentage: "0", inclusive: true }
        }, t);
        created = true;
      }
      out[p.key] = { id: plan.id, name: p.name, price_ils: p.price, every: p.count + " " + p.unit, cycles: p.cycles || "unlimited", status: plan.status, created, price_before: priceBefore, price_updated: priceUpdated };
    }
    const retired = {};
    for (const name of RETIRED) {
      const plan = existing.find(x => x.name === name);
      if (!plan) continue;
      if (plan.status === "ACTIVE") { await api("POST", "/v1/billing/plans/" + plan.id + "/deactivate", null, t); retired[name] = { id: plan.id, status: "INACTIVE", deactivated_now: true }; }
      else retired[name] = { id: plan.id, status: plan.status, deactivated_now: false };
    }
    res.end(JSON.stringify({ retired, ok: true, env: process.env.PAYPAL_ENV || "sandbox", product: { id: product.id, created: createdProduct }, plans: out }));
  } catch (e) {
    res.statusCode = 500; res.end(JSON.stringify({ ok: false, error: e.message }));
  }
};

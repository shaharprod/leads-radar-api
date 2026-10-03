// POST /api/paypal-webhook — PayPal sends payment / subscription events here.
// Every event is verified with PayPal before anything is changed.
const { verifyWebhook, getSubscription } = require("../lib/paypal");
const { getOrCreateUser, setAccess } = require("../lib/stytch");

const ON = ["BILLING.SUBSCRIPTION.ACTIVATED", "BILLING.SUBSCRIPTION.RE-ACTIVATED", "BILLING.SUBSCRIPTION.UPDATED"];
const OFF = ["BILLING.SUBSCRIPTION.CANCELLED", "BILLING.SUBSCRIPTION.SUSPENDED", "BILLING.SUBSCRIPTION.EXPIRED"];

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = []; for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function addDays(days) { return new Date(Date.now() + days * 86400000).toISOString(); }

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "POST") { res.statusCode = 405; return res.end('{"ok":false}'); }
  let event;
  try { event = await readBody(req); } catch { res.statusCode = 400; return res.end('{"ok":false,"reason":"bad_json"}'); }

  try {
    if (!(await verifyWebhook(req.headers, event))) { res.statusCode = 400; return res.end('{"ok":false,"reason":"not_verified"}'); }
  } catch (e) { res.statusCode = 500; return res.end('{"ok":false,"reason":"verify_error"}'); }

  const type = event.event_type || "";
  const r = event.resource || {};
  const days = Number(process.env.ACCESS_DAYS || 31);
  try {
    if (ON.includes(type) || OFF.includes(type)) {
      const email = r.subscriber && r.subscriber.email_address;
      if (!email) throw new Error("no subscriber email");
      const u = await getOrCreateUser(email);
      await setAccess(u.user_id, ON.includes(type)
        ? { status: "active", paypal_subscription_id: r.id, paid_until: addDays(days) }
        : { status: "inactive", paypal_subscription_id: r.id });
    } else if (type === "PAYMENT.SALE.COMPLETED" && r.billing_agreement_id) {
      // monthly renewal of a subscription
      const sub = await getSubscription(r.billing_agreement_id);
      const email = sub.subscriber && sub.subscriber.email_address;
      if (!email) throw new Error("no subscriber email");
      const u = await getOrCreateUser(email);
      await setAccess(u.user_id, { status: "active", paypal_subscription_id: sub.id, paid_until: addDays(days) });
    } else if (type === "PAYMENT.CAPTURE.COMPLETED") {
      // one-time payment (like a PayPal "Buy now" button)
      const email = r.payer && r.payer.email_address;
      if (email) {
        const u = await getOrCreateUser(email);
        await setAccess(u.user_id, { status: "one_time", paid_until: addDays(days) });
      }
    }
    // forward the verified event to the Leads Radar audit server (login gate + admin screen keep their own subscribers list)
    if (process.env.LR_NOTIFY_URL) {
      try { await fetch(process.env.LR_NOTIFY_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event), signal: AbortSignal.timeout(8000) }); }
      catch (e) { console.error("notify failed", e.message); }
    }
    res.statusCode = 200; res.end(JSON.stringify({ ok: true, type }));
  } catch (e) {
    // non-200 makes PayPal retry later
    res.statusCode = 500; res.end(JSON.stringify({ ok: false, type, reason: String(e.message).slice(0, 120) }));
  }
};

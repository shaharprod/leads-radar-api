// PayPal REST helpers. PAYPAL_ENV = "sandbox" (default) or "live".
const BASE = process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

async function token() {
  const id = process.env.PAYPAL_CLIENT_ID, secret = process.env.PAYPAL_SECRET;
  if (!id || !secret) throw new Error("missing PAYPAL_CLIENT_ID / PAYPAL_SECRET");
  const r = await fetch(BASE + "/v1/oauth2/token", {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(id + ":" + secret).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials"
  });
  const d = await r.json();
  if (!r.ok) throw new Error("paypal token " + r.status);
  return d.access_token;
}

const EVENTS = ["BILLING.SUBSCRIPTION.ACTIVATED","BILLING.SUBSCRIPTION.RE-ACTIVATED","BILLING.SUBSCRIPTION.UPDATED",
  "BILLING.SUBSCRIPTION.CANCELLED","BILLING.SUBSCRIPTION.SUSPENDED","BILLING.SUBSCRIPTION.EXPIRED",
  "PAYMENT.SALE.COMPLETED","PAYMENT.CAPTURE.COMPLETED"];
const WEBHOOK_URL = process.env.PUBLIC_WEBHOOK_URL || "https://leads-radar-api.vercel.app/api/paypal-webhook";
let cachedWebhookId = null;

// Finds (or creates once) the PayPal webhook that points at this server, so no manual PAYPAL_WEBHOOK_ID is needed.
async function getWebhookId() {
  if (process.env.PAYPAL_WEBHOOK_ID) return process.env.PAYPAL_WEBHOOK_ID;
  if (cachedWebhookId) return cachedWebhookId;
  const t = await token();
  const r = await fetch(BASE + "/v1/notifications/webhooks", { headers: { Authorization: "Bearer " + t } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("paypal list webhooks " + r.status);
  const found = (d.webhooks || []).find(w => w.url === WEBHOOK_URL);
  if (found) return (cachedWebhookId = found.id);
  const c = await fetch(BASE + "/v1/notifications/webhooks", {
    method: "POST", headers: { Authorization: "Bearer " + t, "Content-Type": "application/json" },
    body: JSON.stringify({ url: WEBHOOK_URL, event_types: EVENTS.map(name => ({ name })) })
  });
  const cd = await c.json().catch(() => ({}));
  if (!c.ok) throw new Error("paypal create webhook " + c.status + " " + (cd.name || ""));
  return (cachedWebhookId = cd.id);
}

async function verifyWebhook(headers, event) {
  const webhookId = await getWebhookId();
  const h = (k) => headers[k] || headers[k.toLowerCase()];
  const r = await fetch(BASE + "/v1/notifications/verify-webhook-signature", {
    method: "POST",
    headers: { Authorization: "Bearer " + (await token()), "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_algo: h("paypal-auth-algo"),
      cert_url: h("paypal-cert-url"),
      transmission_id: h("paypal-transmission-id"),
      transmission_sig: h("paypal-transmission-sig"),
      transmission_time: h("paypal-transmission-time"),
      webhook_id: webhookId,
      webhook_event: event
    })
  });
  const d = await r.json().catch(() => ({}));
  return r.ok && d.verification_status === "SUCCESS";
}

async function getSubscription(id) {
  const r = await fetch(BASE + "/v1/billing/subscriptions/" + encodeURIComponent(id), {
    headers: { Authorization: "Bearer " + (await token()) }
  });
  if (!r.ok) throw new Error("paypal subscription " + r.status);
  return r.json();
}

module.exports = { verifyWebhook, getSubscription, getWebhookId, WEBHOOK_URL };

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

async function verifyWebhook(headers, event) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) throw new Error("missing PAYPAL_WEBHOOK_ID");
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

module.exports = { verifyWebhook, getSubscription };

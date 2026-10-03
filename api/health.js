// GET /api/health — quick check that the server is up and which settings are present (never values).
module.exports = (req, res) => {
  const has = (k) => Boolean(process.env[k]);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({
    ok: true,
    stytch_env: process.env.STYTCH_ENV || "test",
    paypal_env: process.env.PAYPAL_ENV || "sandbox",
    configured: {
      STYTCH_PROJECT_ID: has("STYTCH_PROJECT_ID"), STYTCH_SECRET: has("STYTCH_SECRET"),
      PAYPAL_CLIENT_ID: has("PAYPAL_CLIENT_ID"), PAYPAL_SECRET: has("PAYPAL_SECRET"), PAYPAL_WEBHOOK_ID: has("PAYPAL_WEBHOOK_ID")
    }
  }));
};

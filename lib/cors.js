function cors(req, res) {
  const allowed = (process.env.ALLOWED_ORIGIN || "https://shaharprod.github.io").split(",").map(s => s.trim());
  const origin = req.headers.origin;
  if (origin && allowed.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return true; }
  return false;
}
module.exports = { cors };

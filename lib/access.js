// Decide whether a user's trusted_metadata grants access to Leads Radar.
function hasAccess(tm, now = Date.now()) {
  const a = (tm && tm.leads_radar) || {};
  if (a.status === "active") return true;
  if (a.paid_until && Date.parse(a.paid_until) > now) return true;
  return false;
}
module.exports = { hasAccess };

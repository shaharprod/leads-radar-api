const assert = require("assert");
process.env.STYTCH_PROJECT_ID="p"; process.env.STYTCH_SECRET="s"; process.env.PAYPAL_CLIENT_ID="c"; process.env.PAYPAL_SECRET="x"; 
let users = {}; let verified = true; const log=[];
global.fetch = async (url, opt={}) => {
  if (url.endsWith("/v1/notifications/webhooks") && (opt.method||"GET")==="GET") return {ok:true,status:200,json:async()=>({webhooks:[{id:"WH-1",url:"https://leads-radar-api.vercel.app/api/paypal-webhook"}]})};
  const body = opt.body && opt.body.startsWith && opt.body.startsWith("{") ? JSON.parse(opt.body) : {};
  log.push(opt.method+" "+url);
  const ok = (d)=>({ok:true,status:200,json:async()=>d});
  if (url.endsWith("/v1/oauth2/token")) return ok({access_token:"t"});
  if (url.includes("verify-webhook-signature")) return ok({verification_status: verified?"SUCCESS":"FAILURE"});
  if (url.includes("/v1/billing/subscriptions/")) return ok({id:"I-1",subscriber:{email_address:"a@b.com"}});
  if (url.endsWith("/users/search")) { const e=body.query.operands[0].filter_value[0]; const u=Object.values(users).find(x=>x.email===e); return ok({results:u?[u]:[]}); }
  if (url.endsWith("/v1/users") && opt.method==="POST") { const u={user_id:"user-"+Object.keys(users).length,email:body.email,trusted_metadata:{}}; users[u.user_id]=u; return ok({user_id:u.user_id,user:u}); }
  const m = url.match(/\/users\/(user-\d+)$/);
  if (m && opt.method==="GET") return ok({user:users[m[1]]});
  if (m && opt.method==="PUT") { users[m[1]].trusted_metadata=body.trusted_metadata; return ok({user:users[m[1]]}); }
  if (url.endsWith("/sessions/authenticate")) { if(body.session_jwt!=="good") return {ok:false,status:401,json:async()=>({error_type:"session_not_found"})}; const u=Object.values(users)[0]; return ok({user:{emails:[{email:u?u.email:"x@y.z"}],trusted_metadata:u?u.trusted_metadata:{}}}); }
  throw new Error("unexpected "+url);
};
function mkres(){ const r={headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v},end(b){this.body=b;this.done=true}}; return r; }
const hook=require("./api/paypal-webhook"), me=require("./api/me");
(async()=>{
  // 1. me with no session
  let res=mkres(); await me({method:"GET",headers:{origin:"https://shaharprod.github.io"}},res); assert.equal(res.statusCode,401);
  assert.equal(res.headers["Access-Control-Allow-Origin"],"https://shaharprod.github.io");
  // 2. unverified webhook rejected
  verified=false; res=mkres(); await hook({method:"POST",headers:{},body:{event_type:"BILLING.SUBSCRIPTION.ACTIVATED",resource:{id:"I-1",subscriber:{email_address:"a@b.com"}}}},res); assert.equal(res.statusCode,400); assert.equal(Object.keys(users).length,0);
  // 3. activation creates user + active
  verified=true; res=mkres(); await hook({method:"POST",headers:{},body:{event_type:"BILLING.SUBSCRIPTION.ACTIVATED",resource:{id:"I-1",subscriber:{email_address:"a@b.com"}}}},res); assert.equal(res.statusCode,200);
  const u=Object.values(users)[0]; assert.equal(u.trusted_metadata.leads_radar.status,"active");
  // 4. me with good session -> active
  res=mkres(); await me({method:"GET",headers:{authorization:"Bearer good"}},res); assert.equal(JSON.parse(res.body).active,true);
  // 5. bad session -> 401
  res=mkres(); await me({method:"GET",headers:{authorization:"Bearer bad"}},res); assert.equal(res.statusCode,401);
  // 6. cancel -> inactive, and paid_until kept? cancelled keeps paid_until -> still access until period end
  res=mkres(); await hook({method:"POST",headers:{},body:{event_type:"BILLING.SUBSCRIPTION.CANCELLED",resource:{id:"I-1",subscriber:{email_address:"a@b.com"}}}},res);
  assert.equal(u.trusted_metadata.leads_radar.status,"inactive");
  res=mkres(); await me({method:"GET",headers:{authorization:"Bearer good"}},res); console.log("after cancel:",res.body);
  // 7. renewal
  res=mkres(); await hook({method:"POST",headers:{},body:{event_type:"PAYMENT.SALE.COMPLETED",resource:{billing_agreement_id:"I-1"}}},res); assert.equal(u.trusted_metadata.leads_radar.status,"active");
  // 8. expired paid_until, inactive -> no access
  u.trusted_metadata.leads_radar={status:"inactive",paid_until:"2020-01-01T00:00:00Z"}; res=mkres(); await me({method:"GET",headers:{authorization:"Bearer good"}},res); assert.equal(JSON.parse(res.body).active,false);
  // 9. admin override
  process.env.ADMIN_EMAILS="A@b.com"; res=mkres(); await me({method:"GET",headers:{authorization:"Bearer good"}},res); assert.equal(JSON.parse(res.body).active,true);
  console.log("ALL TESTS PASSED");
})().catch(e=>{console.error("FAIL",e);process.exit(1)});

import {randomUUID,randomBytes} from "node:crypto";
import {HttpError,equal,hash} from "../vault/auth";
import {initializeMetadata,query} from "../vault/store";
import {accountBy,updateAccount,type Account} from "./store";
export type AdminAudit={at:string;action:string;reason:string;actor:string;requestId?:string;fingerprint?:string};
export type Delivery={checkoutId:string;eventId:string;status:"pending"|"sending"|"delivered"|"failed";attempts:number;lastError:string|null;url:string;secret:string;body:string;nextAt:number;lease?:string};
export type Checkout={id:string;token:string;amount_sats:number;reference:string;returnUrl:string;origin:string;expiresAt:string;paidAt?:string;idem:string;fingerprint:string};
export type MerchantState={
  status:"active"|"frozen"|"suspended";returnUrls:string[];webhookUrl?:string;webhookSecret?:string;
  apiKeyHash?:string;apiKeyPrefix?:string;apiKeyExpires?:number;liveApplication:"none"|"pending"|"approved"|"rejected";
  checkouts:Checkout[];deliveries:Delivery[];audit:AdminAudit[];daily?:{day:string;sats:number};
};
export function merchant(a:Account):MerchantState{
  return a.merchant??=( {status:"active",returnUrls:[],liveApplication:"none",checkouts:[],deliveries:[],audit:[]} );
}
export function record(list:AdminAudit[],action:string,reason:string,actor:string){
  if(list.length>=2000)throw new HttpError(409,"Audit retention limit reached. Export and review before further changes.");
  list.push({at:new Date().toISOString(),action,reason,actor});
}
// Write-ahead security history is outside the tenant JSON and has no application
// count cap. A crash can leave a truthful "requested" row, never a false success.
// An "applied" event is written only after the account CAS update succeeds.
export async function securityRecord(accountId:string,action:string,reason:string){
  await initializeMetadata();
  const event:AdminAudit={at:new Date().toISOString(),actor:"owner",action,reason};
  await query("INSERT INTO developer_security_audit(id,account_id,created_at,data) VALUES(?,?,?,?)",
    [randomUUID(),accountId,event.at,JSON.stringify(event)]);
}
export async function recentSecurityAudit():Promise<Map<string,AdminAudit[]>>{
  const result=new Map<string,AdminAudit[]>();
  const rows=await query("SELECT account_id,data FROM developer_security_audit ORDER BY created_at DESC,id DESC LIMIT 1000");
  for(const row of rows){
    const id=String(row.account_id),events=result.get(id)??[];
    if(events.length<100)events.push(JSON.parse(String(row.data)));
    result.set(id,events);
  }
  return result;
}
export async function accounts(){
  await initializeMetadata();
  return (await query("SELECT data FROM developer_accounts ORDER BY id LIMIT 501")).map(r=>JSON.parse(String(r.data)) as Account);
}
export type Controls={paused:boolean;audit:AdminAudit[]};
export async function controls():Promise<Controls>{
  await initializeMetadata();
  await query("INSERT OR IGNORE INTO developer_control(id,version,data) VALUES('simulation',0,?)",[JSON.stringify({paused:false,audit:[]})]);
  return JSON.parse(String((await query("SELECT data FROM developer_control WHERE id='simulation'"))[0].data));
}
export async function setPaused(paused:boolean,reason:string,actor:string){
  await controls();
  for(let i=0;i<8;i++){
    const row=(await query("SELECT version,data FROM developer_control WHERE id='simulation'"))[0];
    const c:Controls=JSON.parse(String(row.data));c.paused=paused;record(c.audit,"pause:"+paused,reason,actor);
    if((await query("UPDATE developer_control SET data=?,version=version+1 WHERE id='simulation' AND version=? RETURNING id",[JSON.stringify(c),Number(row.version)])).length)return;
  }
  throw new HttpError(409,"Control changed; refresh before retrying");
}
export async function writable(){if((await controls()).paused)throw new HttpError(503,"Sandbox payment creation is paused by the owner");}
export function eligible(a:Account,write=false){
  const m=merchant(a);
  if(m.status==="suspended")throw new HttpError(403,"Developer access suspended");
  if(write&&m.status==="frozen")throw new HttpError(403,"Outgoing operations frozen");
  if(!a.verified||a.provisioning!=="ready"||!a.passkeys.length)throw new HttpError(403,"Finish developer setup first");
}
export async function bearer(value:string|undefined){
  const match=/^Bearer sk_test_([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})$/.exec(value??"");
  if(!match)throw new HttpError(401,"A Sandbox checkout API key is required");
  const a=await accountBy("id",match[1]);
  if(!a || !merchant(a).apiKeyHash || !equal(merchant(a).apiKeyHash!,hash(match[2])) || (merchant(a).apiKeyExpires??0)<Date.now())
    throw new HttpError(401,"Invalid or expired API key");
  eligible(a);return {a,keyHash:hash(match[2])};
}
export function issueApi(a:Account){
  const secret=randomBytes(32).toString("base64url"),m=merchant(a);
  m.apiKeyHash=hash(secret);m.apiKeyPrefix=`sk_test_${a.id.slice(0,8)}…`;m.apiKeyExpires=Date.now()+90*86400000;
  return `sk_test_${a.id}.${secret}`;
}
export function publicCheckout(c:Checkout){
  const status=c.paidAt?"simulation_paid":Date.parse(c.expiresAt)<=Date.now()?"expired":"pending";
  const url=`${c.origin}/checkout/${c.token}`;
  let return_url:null|string=null;
  if(c.paidAt){const u=new URL(c.returnUrl);u.searchParams.set("checkout_id",c.id);u.searchParams.set("status","simulation_paid");return_url=u.href;}
  return {id:c.id,url,amount_sats:c.amount_sats,reference:c.reference,expiresAt:c.expiresAt,status,environment:"simulation",return_url,qrPayload:url};
}
export async function findPublic(token:string){
  if(!/^[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/.test(token))throw new HttpError(404,"Checkout not found");
  const a=await accountBy("id",token.split(".")[0]);
  const c=a?.merchant?.checkouts.find(x=>equal(x.token,token));
  if(!c||!a)throw new HttpError(404,"Checkout not found");
  if(merchant(a).status==="suspended")throw new HttpError(403,"Checkout unavailable");
  return {a,c};
}
export function create(a:Account,b:{amount_sats:number;reference:string;return_url:string},idem:string,origin:string){
  eligible(a,true);const m=merchant(a),fingerprint=hash(JSON.stringify(b));
  const old=m.checkouts.find(c=>c.idem===idem);
  if(old){if(old.fingerprint!==fingerprint)throw new HttpError(409,"Idempotency key already used for different input");return publicCheckout(old);}
  if(!m.returnUrls.includes(b.return_url))throw new HttpError(400,"Return URL must exactly match your configured allowlist");
  if(m.checkouts.length>=500)throw new HttpError(409,"Checkout retention limit reached");
  const c:Checkout={id:randomUUID(),token:`${a.id}.${randomBytes(32).toString("base64url")}`,amount_sats:b.amount_sats,reference:b.reference,
    returnUrl:b.return_url,origin,expiresAt:new Date(Date.now()+30*60000).toISOString(),idem,fingerprint};
  m.checkouts.push(c);return publicCheckout(c);
}
export function simulate(a:Account,id:string){
  eligible(a);const m=merchant(a),c=m.checkouts.find(c=>c.id===id);
  if(!c)throw new HttpError(404,"Checkout not found");
  if(c.paidAt)return;
  if(Date.parse(c.expiresAt)<=Date.now())throw new HttpError(409,"Checkout expired");
  const day=new Date().toISOString().slice(0,10);if(m.daily?.day!==day)m.daily={day,sats:0};
  if(m.daily.sats+c.amount_sats>10000000)throw new HttpError(429,"Daily simulated receipt limit reached");
  if(a.balanceSats+c.amount_sats>100000000000)throw new HttpError(409,"Simulation balance limit reached");
  record(m.audit,"checkout_simulated",c.reference,"developer");
  m.daily.sats+=c.amount_sats;a.balanceSats+=c.amount_sats;c.paidAt=new Date().toISOString();
  if(m.webhookUrl&&m.webhookSecret){
    const eventId=randomUUID();
    m.deliveries.push({checkoutId:id,eventId,status:"pending",attempts:0,lastError:null,url:m.webhookUrl,secret:m.webhookSecret,nextAt:0,
      body:JSON.stringify({id:eventId,type:"checkout.simulation_paid",created_at:c.paidAt,data:{id:c.id,reference:c.reference,amount_sats:c.amount_sats,environment:"simulation",status:"simulation_paid"}})});
  }
}
export async function merchantUpdate<T>(id:string,keyHash:string,fn:(a:Account)=>T){
  return updateAccount(id,a=>{if(merchant(a).apiKeyHash!==keyHash)throw new HttpError(401,"API key revoked");return fn(a);});
}

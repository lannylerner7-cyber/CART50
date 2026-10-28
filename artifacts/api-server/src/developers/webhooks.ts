import {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes,randomUUID} from "node:crypto";
import {resolve4} from "node:dns/promises";
import {request} from "node:https";
import {HttpError} from "../vault/auth";
import {updateAccount} from "./store";
import {accounts,merchant,type Delivery} from "./merchant";
function encryptionKey(){
  if(!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length<32)throw new HttpError(503,"Webhook encryption is not configured");
  return createHash("sha256").update("developer-webhooks:"+process.env.SESSION_SECRET).digest();
}
export function seal(secret:string){
  const iv=randomBytes(12),c=createCipheriv("aes-256-gcm",encryptionKey(),iv);
  const b=Buffer.concat([c.update(secret,"utf8"),c.final()]);
  return [iv,c.getAuthTag(),b].map(v=>v.toString("base64url")).join(".");
}
function unseal(value:string){
  const [iv,tag,b]=value.split(".").map(v=>Buffer.from(v,"base64url"));
  const c=createDecipheriv("aes-256-gcm",encryptionKey(),iv);c.setAuthTag(tag);
  return Buffer.concat([c.update(b),c.final()]).toString("utf8");
}
export function httpsUrl(value:string){
  let u:URL;try{u=new URL(value);}catch{throw new HttpError(400,"A valid HTTPS URL is required");}
  if(u.protocol!=="https:"||u.username||u.password||u.hash||(u.port&&u.port!=="443")||u.hostname.length>253)
    throw new HttpError(400,"Use HTTPS without credentials, fragments or custom ports");
  return u;
}
export function publicIPv4(ip:string){
  if(!/^\d+\.\d+\.\d+\.\d+$/.test(ip))return false;
  const [a,b,c,d]=ip.split(".").map(Number);
  return [a,b,c,d].every(n=>n>=0&&n<=255)&&a>0&&a<224&&a!==10&&a!==127&&
    !(a===169&&b===254)&&!(a===172&&b>=16&&b<=31)&&!(a===192&&(b===168||b===0||b===2))&&
    !(a===100&&b>=64&&b<=127)&&!(a===198&&(b===18||b===19||b===51))&&!(a===203&&b===0&&c===113);
}
export async function deliver(d:Delivery){
  const u=httpsUrl(d.url);
  let timer:ReturnType<typeof setTimeout>|undefined;
  const ips=await Promise.race([resolve4(u.hostname),new Promise<never>((_r,reject)=>{timer=setTimeout(()=>reject(new Error("DNS timeout")),5000);})]).finally(()=>clearTimeout(timer));
  if(!ips.length||ips.some(ip=>!publicIPv4(ip)))throw new Error("Destination is not a public IPv4 endpoint");
  const timestamp=Math.floor(Date.now()/1000).toString();
  const sig=createHmac("sha256",unseal(d.secret)).update(timestamp+"."+d.body).digest("hex");
  await new Promise<void>((resolve,reject)=>{
    // Pin the resolved address while retaining TLS hostname verification. No redirects.
    const r=request(u,{method:"POST",family:4,lookup:(_hostname,_options,cb)=>cb(null,ips[0],4),
      headers:{"content-type":"application/json","content-length":Buffer.byteLength(d.body),"x-vault-event-id":d.eventId,"x-vault-signature":`t=${timestamp},v1=${sig}`}},
      response=>{response.resume();if(response.statusCode&&response.statusCode>=200&&response.statusCode<300)resolve();else reject(new Error("Non-success response"));});
    const timer=setTimeout(()=>r.destroy(new Error("Delivery timeout")),5000);
    r.on("close",()=>clearTimeout(timer));r.on("error",reject);r.end(d.body);
  });
}
export async function attemptDelivery(accountId:string,eventId:string,transport=deliver){
  const lease=randomUUID();
  const d=await updateAccount(accountId,a=>{
    const m=merchant(a),d=m.deliveries.find(x=>x.eventId===eventId);
    if(m.status==="suspended"||!d||d.status==="delivered"||d.nextAt>Date.now()||d.attempts>=8)return null;
    d.status="sending";d.lease=lease;d.nextAt=Date.now()+60000;d.attempts++;return {...d};
  });
  if(!d)return;
  let success=false;try{await transport(d);success=true;}catch{/* Never store a raw upstream response or secret. */}
  await updateAccount(accountId,a=>{
    const current=merchant(a).deliveries.find(x=>x.eventId===eventId);
    if(!current||current.lease!==lease)return;
    current.status=success?"delivered":"failed";current.lastError=success?null:"Delivery failed; check the public HTTPS endpoint and signature configuration.";
    current.nextAt=Date.now()+Math.min(3600000,30000*2**current.attempts);delete current.lease;
  });
}
let running=false;
export async function drainWebhooks(){
  if(running)return;running=true;
  try{
    let count=0;
    for(const a of await accounts()){
      for(const d of a.merchant?.deliveries??[]){
        if(d.status!=="delivered"&&d.nextAt<=Date.now()&&d.attempts<8){
          await attemptDelivery(a.id,d.eventId);if(++count>=10)return;
        }
      }
    }
  }finally{running=false;}
}
export function startWebhookDelivery(){
  const timer=setInterval(()=>{void drainWebhooks().catch(()=>{});},30000);timer.unref();
}

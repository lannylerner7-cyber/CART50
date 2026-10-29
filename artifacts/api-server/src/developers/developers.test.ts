import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { randomBytes } from "node:crypto";

test("isolated developer lifecycle, email safety, provisioning and payment idempotency", async () => {
  for(const k of Object.keys(process.env)) if(/^(CF_|VAULT_|SMTP_|DEVELOPER_)/.test(k)) delete process.env[k];
  const dir=mkdtempSync(join(tmpdir(),"developer-api-test-"));
  Object.assign(process.env,{NODE_ENV:"test",VAULT_DATA_DIR:dir,PUBLIC_ORIGIN:"http://localhost"});
  const { developerRouter }=await import("./routes");
  const { accountBy, updateAccount }=await import("./store");
  const { hash }=await import("../vault/auth");
  const { readState, query }=await import("../vault/store");
  const mail=new Map<string,string>();
  let available=true,failMail=false;
  const quote = process.env.LIVE_MARKET_TEST === "1"
    ? await (await import("../vault/public-market")).fetchPublicPrice()
    : {price:100000,updatedAt:new Date().toISOString(),source:"fixture quote — not market evidence"};
  const expectedBalance=Number(300000n*100000000n/BigInt(Math.round(quote.price*100)));
  const app=express();app.use(express.json());app.use("/api/developers",developerRouter({
    send:async m=>{if(failMail)throw new Error("delivery failed");mail.set(m.to,m.text.match(/\n\n([A-Za-z0-9_-]{24})\n\n/)![1]);return {accepted:[m.to],rejected:[],response:"fixture"};},
    quote:()=>({...quote,available,stale:!available}),
  }));
  app.use((e:any,_req:any,res:any,_next:any)=>res.status(e.status??400).json({error:e.message}));
  const server=app.listen(0,"127.0.0.1");
  await new Promise<void>(r=>server.once("listening",r));
  const url=`http://127.0.0.1:${(server.address() as any).port}/api/developers`;
  type Client={cookie:string;csrf:string};
  const client=():Client=>({cookie:"",csrf:""});
  async function call(c:Client,path:string,data?:unknown,origin="http://localhost"){
    const r=await fetch(url+path,{method:data===undefined?"GET":"POST",headers:{origin,"content-type":"application/json",cookie:c.cookie,"x-developer-csrf":c.csrf},...(data===undefined?{}:{body:JSON.stringify(data)})});
    const set=r.headers.get("set-cookie");
    if(set)c.cookie=set.split(";")[0];
    const b=await r.json() as any;if(b.csrfToken)c.csrf=b.csrfToken;
    return {status:r.status,b};
  }
  async function enroll(email:string) {
    const c=client();
    assert.equal((await call(c,"/register",{name:"Disposable developer",email,accepted:true,termsVersion:"preview-draft-1"})).status,200);
    assert.equal(mail.get(email)?.length,24);
    assert.equal((await call(c,"/verify-email",{email,key:mail.get(email)})).status,200);
    return c;
  }
  try {
    const ownerBefore=JSON.stringify(await readState());
    const c=await enroll("a@example.invalid");
    assert.equal((await call(client(),"/verify-email",{email:"a@example.invalid",key:mail.get("a@example.invalid")})).status,400);
    assert.equal((await call(c,"/provision",{})).status,401,"passkey enrollment is mandatory");
    assert.equal((await call(c,"/passkey-register-options",{},"https://attacker.invalid")).status,403);
    const a=(await accountBy("email","a@example.invalid"))!;
    // Unit-only modeling of already verified WebAuthn enrollment. Browser acceptance verifies the real ceremony.
    await updateAccount(a.id,a=>{a.passkeys=[{id:"unit-only",name:"Unit fixture",createdAt:new Date().toISOString(),publicKey:"",counter:0}];a.sessions[0].level="full";a.sessions[0].passkeyAt=Date.now();});
    available=false;assert.equal((await call(c,"/provision",{})).status,503);
    assert.equal((await accountBy("id",a.id))?.balanceSats,0);
    available=true;
    assert.equal((await call(c,"/provision",{})).status,200);
    assert.equal((await call(c,"/provision",{})).status,200);
    assert.equal((await accountBy("id",a.id))?.balanceSats,expectedBalance);
    const issued=await call(c,"/issue-key",{});
    assert.equal(issued.b.key.length,86);
    assert.equal((await call(c,"/issue-key",{})).status,403,"fresh passkey proof consumed");
    const login=client();
    assert.equal((await call(login,"/login",{email:a.email,key:issued.b.key})).status,200);
    assert.equal((await call(login,"/rotate-key",{})).status,403,"key login is not passkey step-up");
    const d=await enroll("b@example.invalid");
    const b=(await accountBy("email","b@example.invalid"))!;
    await updateAccount(b.id,a=>{a.passkeys=[{id:"unit-b",name:"Fixture",createdAt:new Date().toISOString(),publicKey:"",counter:0}];a.sessions[0].level="full";a.sessions[0].passkeyAt=Date.now();});
    assert.equal((await call(d,"/provision",{})).status,200);
    const snap=(await call(c,"/sandbox")).b;
    assert.equal((await call(d,`/sandbox/address?destination=${snap.assignedAddress}`)).status,400);
    const rv=(await call(c,"/review",{destination:snap.assignedAddress,amountCents:1000})).b;
    assert.equal((await call(d,"/pay",{reviewId:rv.id,confirmed:true})).status,400);
    assert.equal((await call(c,"/pay",{reviewId:rv.id,confirmed:false})).status,400);
    const sends=await Promise.all([call(c,"/pay",{reviewId:rv.id,confirmed:true}),call(c,"/pay",{reviewId:rv.id,confirmed:true})]);
    assert.equal(sends[0].status,200);assert.equal(sends[0].b.id,sends[1].b.id);
    assert.equal((await accountBy("id",a.id))?.transactions.length,1);
    assert.equal((await accountBy("id",b.id))?.transactions.length,0);
    const rv2=(await call(d,"/review",{destination:`sandbox-${b.id}`,amountCents:1000})).b;
    await updateAccount(b.id,a=>{a.reviews.find(r=>r.id===rv2.id)!.expiresAt=new Date(0).toISOString();});
    assert.equal((await call(d,"/pay",{reviewId:rv2.id,confirmed:true})).status,409);
    await updateAccount(a.id,a=>{a.sessions.find(s=>s.csrf===c.csrf)!.passkeyAt=Date.now();});
    const rotated=await call(c,"/rotate-key",{});
    assert.equal(rotated.status,200);
    assert.equal((await call(login,"/sandbox")).status,401);
    assert.equal((await call(client(),"/login",{email:a.email,key:issued.b.key})).status,401);
    assert.equal((await call(client(),"/login",{email:a.email,key:rotated.b.key})).status,200);
    assert.equal(JSON.stringify(await readState()),ownerBefore,"owner state unchanged");
    const row=await query("SELECT data FROM developer_accounts WHERE id=?",[a.id]);
    assert.ok(!String(row[0].data).includes(rotated.b.key));
    assert.equal((await call(c,"/logout",{})).status,200);
    assert.equal((await call(c,"/sandbox")).status,401);
    // Expired/resend keys and duplicate registration cannot create extra identities.
    const e=client(),email="expired@example.invalid";
    await call(e,"/register",{name:"Expired",email,accepted:true,termsVersion:"preview-draft-1"});
    const old=mail.get(email)!;const ea=(await accountBy("email",email))!;
    await updateAccount(ea.id,a=>{a.verification!.expires=0;a.verification!.sentAt=0;});
    assert.equal((await call(e,"/verify-email",{email,key:old})).status,400);
    await call(e,"/resend",{email});
    assert.notEqual(old,mail.get(email));
    assert.equal((await call(e,"/verify-email",{email,key:old})).status,400);
    assert.equal((await call(e,"/verify-email",{email,key:mail.get(email)})).status,200);
    // Expired onboarding can recover by email only until passkey enrollment.
    await updateAccount(ea.id,a=>{a.sessions=[];});
    assert.equal((await call(e,"/resend",{email})).status,200);
    assert.equal((await call(e,"/verify-email",{email,key:mail.get(email)})).status,200);
    const duplicate=await query("SELECT count(*) AS n FROM developer_accounts WHERE email=?",[email]);assert.equal(duplicate[0].n,1);
    assert.equal(hash(randomBytes(18).toString("base64url")).length,64);
    failMail=true;
    assert.equal((await call(client(),"/register",{name:"Mail failure",email:"mailfail@example.invalid",accepted:true,termsVersion:"preview-draft-1"})).status,503);
    assert.equal((await accountBy("email","mailfail@example.invalid"))?.verification?.delivery,"failed");
    assert.equal((await accountBy("id",a.id))?.keyHash?.length,64);
  } finally {server.close();rmSync(dir,{recursive:true,force:true});}
});

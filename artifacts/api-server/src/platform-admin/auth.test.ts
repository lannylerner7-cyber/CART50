import {test} from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {randomBytes} from "node:crypto";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

test("platform identity is isolated, CSRF protected, expiring, revocable and throttled",async()=>{
  for(const k of Object.keys(process.env))if(/^(CF_|VAULT_|MAINNET_|SANDBOX_|SMTP_|MARKET_|PLATFORM_ADMIN_)/.test(k))delete process.env[k];
  const dir=mkdtempSync(join(tmpdir(),"platform-admin-test-"));
  const password=randomBytes(32).toString("base64url");
  Object.assign(process.env,{NODE_ENV:"test",VAULT_DATA_DIR:dir,PUBLIC_ORIGIN:"http://localhost",PLATFORM_ADMIN_EMAIL:"admin@example.test",PLATFORM_ADMIN_PASSWORD:password});
  const {platformAdminRouter,requireAdministrator,platformSession}=await import("./auth");
  const {requireOwner}=await import("../vault/auth");
  const app=express();app.use(express.json());app.use("/auth",platformAdminRouter);
  app.get("/admin",requireAdministrator,(_req,res)=>res.json({ok:true}));
  app.post("/admin",requireAdministrator,(_req,res)=>res.json({ok:true}));
  app.get("/owner",requireOwner,(_req,res)=>res.json({ok:true}));
  app.post("/expire", (req,res)=>{const s=platformSession(req);if(s)s.expiresAt=new Date(0).toISOString();res.json({ok:true});});
  app.use((e:any,_req:any,res:any,_next:any)=>res.status(e.status??400).json({error:e.message}));
  const server=app.listen(0,"127.0.0.1");await new Promise<void>(r=>server.once("listening",r));
  const base=`http://127.0.0.1:${(server.address() as any).port}`;
  const call=(path:string,body?:unknown,cookie="",csrf="",origin="http://localhost")=>fetch(base+path,{method:body===undefined?"GET":"POST",headers:{"content-type":"application/json",origin,cookie,"x-csrf-token":csrf,"x-platform-admin":"1"},...(body===undefined?{}:{body:JSON.stringify(body)})});
  try{
    assert.equal((await call("/admin")).status,401);
    assert.equal((await call("/auth/login",{email:"admin@example.test",password},"","","https://evil.invalid")).status,403);
    assert.equal((await call("/auth/login",{email:"wrong@example.test",password})).status,401);
    const login=await call("/auth/login",{email:"admin@example.test",password});
    assert.equal(login.status,200);
    const set=login.headers.get("set-cookie")!; assert.match(set,/HttpOnly/i);assert.match(set,/Secure/i);assert.match(set,/SameSite=Strict/i);
    const token=set.split(";")[0], session=await login.json() as any;
    assert.equal((await call("/admin",undefined,token)).status,200);
    assert.equal((await call("/owner",undefined,token)).status,401);
    assert.equal((await call("/admin",{},token)).status,403);
    assert.equal((await call("/admin",{},token,session.csrfToken)).status,200);
    assert.equal((await call("/auth/logout",{},token,session.csrfToken)).status,200);
    assert.equal((await call("/admin",undefined,token)).status,401);
    const again=await call("/auth/login",{email:"admin@example.test",password});
    const token2=again.headers.get("set-cookie")!.split(";")[0];
    await call("/expire",{},token2);
    assert.equal((await call("/admin",undefined,token2)).status,401);
    const third=await call("/auth/login",{email:"admin@example.test",password});
    const token3=third.headers.get("set-cookie")!.split(";")[0];
    process.env.PLATFORM_ADMIN_PASSWORD=randomBytes(32).toString("base64url");
    assert.equal((await call("/admin",undefined,token3)).status,401);
    delete process.env.PLATFORM_ADMIN_PASSWORD;
    assert.equal((await (await call("/auth/session")).json() as any).configured,false);
    // Account-wide budget does not reset for a different claimed email.
    await call("/auth/login",{email:"a@example.test",password:"wrong"});
    assert.equal((await call("/auth/login",{email:"b@example.test",password:"wrong"})).status,429);
  }finally{await new Promise<void>(r=>server.close(()=>r()));rmSync(dir,{recursive:true,force:true});}
});

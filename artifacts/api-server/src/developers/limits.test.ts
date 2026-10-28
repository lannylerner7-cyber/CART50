import {test} from "node:test";
import assert from "node:assert/strict";
import {Worker} from "node:worker_threads";
import {mkdtempSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
test("shared quota is atomic across independent connections and fails closed",async()=>{
  for(const k of Object.keys(process.env))if(/^(CF_|VAULT_)/.test(k))delete process.env[k];
  const dir=mkdtempSync(join(tmpdir(),"shared-quota-"));
  process.env.VAULT_DATA_DIR=dir;process.env.NODE_ENV="test";
  const {initializeMetadata,query}=await import("../vault/store");
  const {BUDGET_SQL,sharedBudget,developerLimits}=await import("./limits");
  await initializeMetadata();
  try{
    const results=await Promise.all(Array.from({length:4},()=>new Promise<number>((resolve,reject)=>{
      const w=new Worker(`const {workerData,parentPort}=require('node:worker_threads');
        const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(workerData.path);
        db.exec('PRAGMA busy_timeout=5000');let admitted=0;
        for(let i=0;i<20;i++)admitted+=db.prepare(workerData.sql).all('same-shared-key',10).length;
        db.close();parentPort.postMessage(admitted);`,{eval:true,workerData:{path:join(dir,"metadata.sqlite"),sql:BUDGET_SQL}});
      w.once("message",resolve);w.once("error",reject);
    })));
    assert.equal(results.reduce((a,b)=>a+b,0),10);
    await sharedBudget("one","tenant",1);
    let retry="";
    await assert.rejects(()=>sharedBudget("one","tenant",1,{setHeader:(_k:string,v:string)=>{retry=v;}} as any),{status:429});
    assert.equal(retry,"60");
    await query("DROP TABLE developer_rate_limits");
    await assert.rejects(()=>sharedBudget("failure","tenant",1));
    let nextCalled=false;
    await developerLimits({path:"/admin/developers/revoke"} as any,{} as any,()=>{nextCalled=true;});
    assert.equal(nextCalled,true,"owner emergency route bypasses tenant quota store");
  }finally{rmSync(dir,{recursive:true,force:true});}
});

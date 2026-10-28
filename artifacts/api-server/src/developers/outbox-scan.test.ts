import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
test("due projection reaches tenants beyond admin bounds and excludes held events",async()=>{
  for(const k of Object.keys(process.env))if(/^(CF_|VAULT_)/.test(k))delete process.env[k];
  const dir=mkdtempSync(join(tmpdir(),"outbox-scan-"));
  process.env.NODE_ENV="test";process.env.VAULT_DATA_DIR=dir;
  const {initializeMetadata,query}=await import("../vault/store");
  const {dueDeliveries}=await import("./webhooks");
  await initializeMetadata();
  try{
    for(let i=0;i<505;i++){
      const id=String(i).padStart(5,"0");
      const deliveries=i<501?[]:[{eventId:"event-"+id,status:"pending",attempts:0,nextAt:i}];
      await query("INSERT INTO developer_accounts(id,email,version,data) VALUES(?,?,0,?)",
        [id,id+"@example.test",JSON.stringify({merchant:{status:i===502?"suspended":"active",deliveries}})]);
    }
    const due=await dueDeliveries(1000);
    assert.deepEqual(due.map(x=>x.account_id),["00501","00503","00504"]);
    await query("UPDATE developer_accounts SET data=json_set(data,'$.merchant.deliveries[0].nextAt',2000) WHERE id='00501'");
    await query("UPDATE developer_accounts SET data=json_set(data,'$.merchant.deliveries[0].attempts',8) WHERE id='00503'");
    await query("UPDATE developer_accounts SET data=json_set(data,'$.merchant.deliveries[0].status','delivered') WHERE id='00504'");
    assert.deepEqual(await dueDeliveries(1000),[]);
    const {accountPage}=await import("./merchant");
    let cursor="",count=0;const seen=new Set<string>();
    do{
      const page=await accountPage(cursor);
      assert.ok(page.accounts.length<=50);
      for(const account of page.accounts){assert.ok(!seen.has(account.id));seen.add(account.id);count++;}
      cursor=page.nextCursor??"";
    }while(cursor);
    assert.equal(count,505,"keyset pagination traverses every account beyond former bound");
  }finally{rmSync(dir,{recursive:true,force:true});}
});

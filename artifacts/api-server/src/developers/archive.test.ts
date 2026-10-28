import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
test("verified archive retains receipt and idempotency after disposable pruning",async()=>{
 for(const k of Object.keys(process.env))if(/^(CF_|VAULT_)/.test(k))delete process.env[k];
 const dir=mkdtempSync(join(tmpdir(),"archive-test-"));
 process.env.VAULT_DATA_DIR=dir;process.env.NODE_ENV="test";
 const {createAccount,updateAccount,accountBy}=await import("./store");
 const {create,merchant,findPublic}=await import("./merchant");
 const {archiveCheckouts,archivedCheckout}=await import("./archive");
 const {query}=await import("../vault/store");
 try{
  const a=(await createAccount("Archive","archive@example.test","fixture"))!;
  const input={amount_sats:100,reference:"archive",return_url:"https://merchant.example/result"};
  const result=await updateAccount(a.id,async a=>{
   a.verified=true;a.provisioning="ready";a.passkeys=[{id:"fixture",publicKey:"AA",counter:0,name:"fixture",createdAt:new Date().toISOString()}];
   merchant(a).returnUrls=[input.return_url];
   const result=await create(a,input,"archive-idem","https://localhost");
   const c=merchant(a).checkouts[0];c.paidAt=c.expiresAt=new Date(Date.now()-100*86400000).toISOString();
   return result;
  });
  assert.deepEqual(await archiveCheckouts(a.id),{copied:1,pruned:0});
  assert.equal((await accountBy("id",a.id))!.merchant!.checkouts.length,1);
  assert.deepEqual(await archiveCheckouts(a.id,{pruneLocal:true}),{copied:1,pruned:1});
  const c=await archivedCheckout(a.id,"id",result.id);assert.equal(c?.id,result.id);
  assert.equal((await findPublic(c!.token)).c.id,result.id);
  const replay=await updateAccount(a.id,a=>create(a,input,"archive-idem","https://localhost"));
  assert.equal(replay.id,result.id);
  assert.equal((await accountBy("id",a.id))!.merchant!.checkouts.length,0);
  await assert.rejects(()=>updateAccount(a.id,a=>create(a,{...input,amount_sats:101},"archive-idem","https://localhost")),{status:409});
  assert.equal(await archivedCheckout("another-account","id",result.id),undefined);
  await query("UPDATE developer_checkout_archive SET checksum='corrupt' WHERE id=?",[result.id]);
  await assert.rejects(()=>archivedCheckout(a.id,"id",result.id),/verification failed/);
  process.env.NODE_ENV="production";
  await assert.rejects(()=>archiveCheckouts(a.id,{pruneLocal:true}),/restricted/);
 }finally{process.env.NODE_ENV="test";rmSync(dir,{recursive:true,force:true});}
});

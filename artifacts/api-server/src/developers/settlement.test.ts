import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomBytes} from "node:crypto";

test("hosted checkout is settled by a funded Sandbox transfer: payer debit, merchant credit, webhook, idempotent recovery",async()=>{
  for(const k of Object.keys(process.env))if(/^(CF_|VAULT_|MAINNET_|SANDBOX_|SMTP_|MARKET_)/.test(k))delete process.env[k];
  const dir=mkdtempSync(join(tmpdir(),"settlement-unit-"));
  Object.assign(process.env,{NODE_ENV:"test",BITCOIN_NETWORK:"main",ALLOW_MAINNET:"true",VAULT_DATA_DIR:dir,PUBLIC_ORIGIN:"http://localhost",SESSION_SECRET:randomBytes(32).toString("hex")});
  const {default:app}=await import("../app");
  const {createAccount,updateAccount,accountBy}=await import("./store");
  const {issueSession}=await import("./auth");
  const {completeSettlement,resumeSettlements,sweepSettlements}=await import("./settlement");
  const server=app.listen(0,"127.0.0.1");await new Promise<void>(r=>server.once("listening",r));
  const address=server.address() as {port:number};const url=`http://127.0.0.1:${address.port}`;
  type Client={cookie:string;csrf:string};
  const req=async(path:string,method="GET",data?:unknown,client?:Client,headers:Record<string,string>={})=>{
    const r=await fetch(url+"/api"+path,{method,headers:{"content-type":"application/json",origin:"http://localhost",...(client?{cookie:client.cookie,"x-developer-csrf":client.csrf}:{}),...headers},...(data===undefined?{}:{body:JSON.stringify(data)})});
    return {status:r.status,data:await r.json() as any};
  };
  async function developer(email:string,balanceSats:number,priceCents:number){
    const a=(await createAccount("Fixture",email,"draft"))!;
    await updateAccount(a.id,a=>{a.verified=true;a.passkeys=[{id:"fixture",publicKey:"AA",counter:0,name:"Fixture",createdAt:new Date().toISOString()}];a.provisioning="ready";a.balanceSats=balanceSats;a.quote={priceCents,source:"fixture",at:new Date().toISOString()};});
    let cookie="";const s=await issueSession({cookie:(n:string,v:string)=>cookie=n+"="+v} as any,a.id,"full",true);
    return {id:a.id,client:{cookie,csrf:s.csrf}};
  }
  try{
    const merchant=await developer("merchant@example.invalid",1000000,10000000); // $100,000/BTC
    const payer=await developer("payer@example.invalid",100000,12345678);         // different pinned quote
    const settings=await req("/developer-console/settings","POST",{returnUrls:["https://merchant.example/result"],webhookUrl:"https://merchant.example/events"},merchant.client);
    assert.equal(settings.status,200);
    const key=await req("/developer-console/issue-api-key","POST",{},merchant.client);
    const bearer={authorization:"Bearer "+key.data.key,"idempotency-key":"order-settle-1"};
    const created=await req("/v1/checkout/sessions","POST",{amount_sats:25000,reference:"order-settle",return_url:"https://merchant.example/result"},undefined,bearer);
    assert.equal(created.status,200);
    const token=created.data.url.split("/checkout/")[1];
    assert.equal(created.data.sandbox_destination,"checkout:"+token);
    assert.equal(created.data.paid_at,null);
    const dest=created.data.sandbox_destination as string;

    // Public page never settles anything.
    assert.equal((await req(`/checkout/${token}/check`,"POST",{})).data.status,"pending");
    // Payer looks the destination up: amount is fixed in sats and converted with the payer's own quote.
    const lookup=await req("/developers/sandbox/address?destination="+encodeURIComponent(dest),"GET",undefined,payer.client);
    assert.equal(lookup.status,200);assert.equal(lookup.data.kind,"checkout");
    assert.equal(lookup.data.checkout.amount_sats,25000);assert.equal(lookup.data.checkout.selfPay,false);
    const cents=lookup.data.checkout.amountCents as number;
    assert.equal(cents,Math.ceil(25000*12345678/1e8));
    assert.equal((await req("/developers/sandbox/address?destination=checkout:not-a-token","GET",undefined,payer.client)).status,400);
    // Wrong amount is refused; the checkout decides.
    assert.equal((await req("/developers/review","POST",{destination:dest,amountCents:cents+1},payer.client)).status,400);
    const review=await req("/developers/review","POST",{destination:dest,amountCents:cents},payer.client);
    assert.equal(review.status,200);assert.equal(review.data.checkout.reference,"order-settle");assert.equal(review.data.amountSats,25000);
    // Concurrent confirmations settle exactly once.
    const paid=await Promise.all([1,2].map(()=>req("/developers/pay","POST",{reviewId:review.data.id,confirmed:true},payer.client)));
    assert.ok(paid.every(r=>r.status===200),JSON.stringify(paid.map(p=>p.data)));
    assert.equal(paid[0].data.id,paid[1].data.id);
    assert.equal(paid[0].data.direction,"out");assert.equal(paid[0].data.checkout.id,created.data.id);
    const payerState=(await accountBy("id",payer.id))!,merchantState=(await accountBy("id",merchant.id))!;
    assert.equal(payerState.balanceSats,75000);
    assert.equal(merchantState.balanceSats,1025000);
    assert.equal(payerState.transactions.length,1);
    assert.equal(merchantState.transactions.length,1);assert.equal(merchantState.transactions[0].direction,"in");assert.equal(merchantState.transactions[0].amountSats,25000);
    assert.equal(payerState.settlements!.length,1);assert.equal(payerState.settlements![0].state,"settled");
    const c=merchantState.merchant!.checkouts[0];
    assert.ok(c.paidAt);assert.equal(c.paidBy!.via,"sandbox_transfer");assert.equal(c.paidBy!.accountId,payer.id);
    assert.equal(merchantState.merchant!.deliveries.length,1);
    assert.equal(JSON.parse(merchantState.merchant!.deliveries[0].body).data.paid_via,"sandbox_transfer");
    const status=await req(`/checkout/${token}`);
    assert.equal(status.data.status,"simulation_paid");assert.equal(status.data.paid_via,"sandbox_transfer");assert.ok(status.data.paid_at);
    assert.match(status.data.return_url,/status=simulation_paid/);
    // Manual simulate afterwards is a no-op, never a second credit.
    assert.equal((await req("/developer-console/simulate","POST",{checkoutId:created.data.id},merchant.client)).status,200);
    assert.equal((await accountBy("id",merchant.id))!.balanceSats,1025000);
    // Paying an already paid checkout is refused before any debit.
    assert.equal((await req("/developers/review","POST",{destination:dest,amountCents:cents},payer.client)).status,409);
    assert.equal((await accountBy("id",payer.id))!.balanceSats,75000);
    // Payer snapshot shows the outgoing transfer with the order reference; review history hides server-only fields.
    const snap=await req("/developers/sandbox","GET",undefined,payer.client);
    assert.equal(snap.data.transactions[0].checkout.reference,"order-settle");
    assert.equal(snap.data.reviews[0].settlementId,undefined);
    assert.equal(snap.data.reviews[0].checkout.merchantId,undefined);

    // Self-pay: merchant settles its own session; net balance unchanged, status paid, webhook queued.
    const own=await req("/v1/checkout/sessions","POST",{amount_sats:4000,reference:"order-self",return_url:"https://merchant.example/result"},undefined,{...bearer,"idempotency-key":"order-self-1"});
    const ownLookup=await req("/developers/sandbox/address?destination="+encodeURIComponent(own.data.sandbox_destination),"GET",undefined,merchant.client);
    assert.equal(ownLookup.data.checkout.selfPay,true);
    const ownReview=await req("/developers/review","POST",{destination:own.data.sandbox_destination,amountCents:ownLookup.data.checkout.amountCents},merchant.client);
    assert.equal((await req("/developers/pay","POST",{reviewId:ownReview.data.id,confirmed:true},merchant.client)).status,200);
    assert.equal((await accountBy("id",merchant.id))!.balanceSats,1025000);
    assert.equal((await req(`/checkout/${own.data.url.split("/checkout/")[1]}`)).data.status,"simulation_paid");
    assert.equal((await accountBy("id",merchant.id))!.merchant!.deliveries.length,2);

    // Crash recovery: a debit recorded without its credit is completed by resume/sweep, exactly once.
    const third=await req("/v1/checkout/sessions","POST",{amount_sats:1000,reference:"order-crash",return_url:"https://merchant.example/result"},undefined,{...bearer,"idempotency-key":"order-crash-1"});
    const crashReview=await req("/developers/review","POST",{destination:third.data.sandbox_destination,amountCents:(await req("/developers/sandbox/address?destination="+encodeURIComponent(third.data.sandbox_destination),"GET",undefined,payer.client)).data.checkout.amountCents},payer.client);
    await updateAccount(payer.id,a=>{
      const r=a.reviews.find(r=>r.id===crashReview.data.id)!;
      a.balanceSats-=1000;r.settlementId="11111111-1111-4111-8111-111111111111";
      a.settlements!.push({id:r.settlementId,reviewId:r.id,merchantId:merchant.id,checkoutId:third.data.id,token:third.data.url.split("/checkout/")[1],reference:"order-crash",amountSats:1000,amountCents:r.amountCents,createdAt:new Date(Date.now()-60000).toISOString(),state:"debited"});
    });
    await Promise.all([sweepSettlements(),resumeSettlements(payer.id),completeSettlement(payer.id,"11111111-1111-4111-8111-111111111111")]);
    assert.equal((await accountBy("id",payer.id))!.balanceSats,74000);
    assert.equal((await accountBy("id",merchant.id))!.balanceSats,1026000);
    assert.equal((await accountBy("id",payer.id))!.settlements!.find(s=>s.id==="11111111-1111-4111-8111-111111111111")!.state,"settled");
    const recovered=await req("/developers/pay","POST",{reviewId:crashReview.data.id,confirmed:true},payer.client);
    assert.equal(recovered.status,200);assert.equal(recovered.data.amountSats,1000);
    assert.equal((await accountBy("id",payer.id))!.transactions.length,2);

    // Refused credit releases the debit: expire the session between debit and credit.
    const fourth=await req("/v1/checkout/sessions","POST",{amount_sats:500,reference:"order-expired",return_url:"https://merchant.example/result"},undefined,{...bearer,"idempotency-key":"order-expired-1"});
    const fourthReview=await req("/developers/review","POST",{destination:fourth.data.sandbox_destination,amountCents:(await req("/developers/sandbox/address?destination="+encodeURIComponent(fourth.data.sandbox_destination),"GET",undefined,payer.client)).data.checkout.amountCents},payer.client);
    await updateAccount(payer.id,a=>{
      const r=a.reviews.find(r=>r.id===fourthReview.data.id)!;
      a.balanceSats-=500;r.settlementId="22222222-2222-4222-8222-222222222222";
      a.settlements!.push({id:r.settlementId,reviewId:r.id,merchantId:merchant.id,checkoutId:fourth.data.id,token:fourth.data.url.split("/checkout/")[1],reference:"order-expired",amountSats:500,amountCents:r.amountCents,createdAt:new Date().toISOString(),state:"debited"});
    });
    await updateAccount(merchant.id,a=>{a.merchant!.checkouts.find(c=>c.id===fourth.data.id)!.expiresAt=new Date(Date.now()-1000).toISOString();});
    const refused=await req("/developers/pay","POST",{reviewId:fourthReview.data.id,confirmed:true},payer.client);
    assert.equal(refused.status,409);assert.match(refused.data.error??JSON.stringify(refused.data),/expired/i);
    const released=(await accountBy("id",payer.id))!;
    assert.equal(released.balanceSats,74000);
    assert.equal(released.settlements!.find(s=>s.id==="22222222-2222-4222-8222-222222222222")!.state,"released");
    assert.equal((await accountBy("id",merchant.id))!.balanceSats,1026000);
    assert.equal((await req(`/checkout/${fourth.data.url.split("/checkout/")[1]}`)).data.status,"expired");

    // A payer without enough balance cannot start a transfer.
    const poor=await developer("poor@example.invalid",10,10000000);
    const big=await req("/v1/checkout/sessions","POST",{amount_sats:5000,reference:"order-big",return_url:"https://merchant.example/result"},undefined,{...bearer,"idempotency-key":"order-big-1"});
    const poorLookup=await req("/developers/sandbox/address?destination="+encodeURIComponent(big.data.sandbox_destination),"GET",undefined,poor.client);
    assert.equal((await req("/developers/review","POST",{destination:big.data.sandbox_destination,amountCents:poorLookup.data.checkout.amountCents},poor.client)).status,400);
  }finally{await new Promise<void>(r=>server.close(()=>r()));rmSync(dir,{recursive:true,force:true});}
});

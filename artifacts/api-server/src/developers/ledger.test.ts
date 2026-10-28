import {test} from "node:test";
import assert from "node:assert/strict";
import {review,execute,destinationFor,snapshot} from "./ledger";
import type {Account,DevSession} from "./store";
function setup(){
  const s:DevSession={hash:"session",csrf:"csrf",expires:Date.now()+10000,level:"full"};
  const a:Account={id:"a",email:"a@example.invalid",name:"A",createdAt:"",termsVersion:"draft",acceptedAt:"",
    verified:true,passkeys:[],sessions:[s],provisioning:"ready",balanceSats:3000000,
    quote:{priceCents:10000000,source:"fixture",at:new Date().toISOString()},reviews:[],transactions:[],audit:[]};
  return {a,s};
}
test("simulated satoshis are exact and unknown broadcast reconciliation cannot duplicate payments",()=>{
  const {a,s}=setup();
  const r=review(a,s,1234,destinationFor(a));
  assert.equal(r.amountSats,12340);
  const receipt=execute(a,s,r.id,true);
  assert.equal(a.balanceSats,2987660);
  assert.deepEqual(execute(a,s,r.id,true),receipt);
  assert.equal(a.transactions.length,1);
  assert.equal(snapshot(a,s).simulatedCreditCents,298766);
  assert.equal(snapshot(a,{...s,hash:"other"}).reviews.length,0);
});
test("review binds destination, session, expiry and approval",()=>{
  const {a,s}=setup();
  assert.throws(()=>review(a,s,100,"sandbox-other"),/assigned/);
  const r=review(a,s,100,destinationFor(a));
  assert.throws(()=>execute(a,s,r.id,false),/approval/);
  assert.throws(()=>execute(a,{...s,hash:"other"},r.id,true),/approval/);
  a.reviews[0].expiresAt=new Date(0).toISOString();
  assert.throws(()=>execute(a,s,r.id,true),/expired/);
  assert.equal(a.balanceSats,3000000);
});
test("rounding cannot manufacture simulated satoshis",()=>{
  const {a,s}=setup();a.quote!.priceCents=12345678;
  const r=review(a,s,1,destinationFor(a));
  assert.equal(r.amountSats,9);
  execute(a,s,r.id,true);
  assert.equal(a.balanceSats,2999991);
  assert.throws(()=>review(a,s,10000000,destinationFor(a)),/exceeds/);
});

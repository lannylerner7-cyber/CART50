import {randomUUID} from "node:crypto";
import {HttpError} from "../lib/security";
import {accountBy,centsFor,updateAccount,type Account,type DevSession,type Settlement} from "./store";
import {creditCheckout,eligible,findPublic,merchant,parseCheckoutDestination,publicCheckout,type Checkout} from "./merchant";
import {initializeMetadata,query} from "./storage";
import {publicReview} from "./ledger";

/**
 * Funded Sandbox checkout settlement.
 *
 * A payer pastes the hosted checkout's `checkout:<token>` destination into its
 * developer Sandbox wallet. The amount is fixed by the merchant's session. The
 * payer's debit and the merchant's credit live in two versioned account rows,
 * so the transfer is recorded as a durable settlement on the payer and completed
 * idempotently: debited -> settled. A credit the merchant can no longer accept
 * (expired, already paid elsewhere, limits) releases the debit instead.
 * Nothing here is reachable from the public checkout page; the payer must hold
 * an authenticated developer session with CSRF and a sufficient balance.
 */
export type CheckoutTarget={merchantId:string;c:Checkout};

/** Demo-credit view of a satoshi amount using the payer's own pinned quote. Never below one cent. */
export function checkoutCents(a:Account,sats:number){
  if(!a.quote)return 0;
  return Math.max(1,Number((BigInt(sats)*BigInt(a.quote.priceCents)+99999999n)/100000000n));
}
export async function lookupCheckoutTarget(destination:string):Promise<CheckoutTarget>{
  const token=parseCheckoutDestination(destination);
  if(!token)throw new HttpError(400,"Use your assigned Sandbox identifier or a hosted checkout destination");
  const {a,c}=await findPublic(token);
  return {merchantId:a.id,c};
}
export function checkoutInfo(payer:Account,t:CheckoutTarget){
  const p=publicCheckout(t.c);
  return {id:p.id,reference:p.reference,amount_sats:p.amount_sats,amountCents:checkoutCents(payer,p.amount_sats),status:p.status,expiresAt:p.expiresAt,selfPay:t.merchantId===payer.id};
}
function payable(t:CheckoutTarget){
  if(t.c.paidAt)throw new HttpError(409,"This checkout is already paid");
  if(Date.parse(t.c.expiresAt)<=Date.now())throw new HttpError(409,"This checkout has expired. Ask the merchant for a new one");
}
export function reviewCheckout(a:Account,s:DevSession,amountCents:number,t:CheckoutTarget){
  if(!a.quote||a.provisioning!=="ready")throw new HttpError(409,"Workspace not ready");
  payable(t);
  const sats=t.c.amount_sats,expected=checkoutCents(a,sats);
  if(amountCents!==expected)throw new HttpError(400,"The amount is fixed by the checkout. Refresh the destination check and try again");
  if(sats>a.balanceSats)throw new HttpError(400,"Checkout amount exceeds your simulated balance");
  if(a.transactions.length>=1000)throw new HttpError(409,"Simulation history limit reached");
  a.reviews=a.reviews.filter(r=>r.status==="complete"||Date.parse(r.expiresAt)>Date.now());
  if(a.reviews.length>=1000)throw new HttpError(429,"Too many reviews");
  const r={id:randomUUID(),destination:"checkout:"+t.c.token,amountCents,amountSats:sats,sessionHash:s.hash,
    createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+300000).toISOString(),status:"pending" as const,
    checkout:{token:t.c.token,merchantId:t.merchantId,checkoutId:t.c.id,reference:t.c.reference,amountSats:sats}};
  a.reviews.push(r);
  return publicReview(r);
}
const settlements=(a:Account)=>a.settlements??=[];
function finalizeOnPayer(a:Account,st:Settlement){
  const r=a.reviews.find(r=>r.id===st.reviewId);
  if(st.receiptId)return a.transactions.find(t=>t.id===st.receiptId)!;
  const t={id:randomUUID(),destination:"checkout:"+st.token,amountCents:st.amountCents,amountSats:st.amountSats,
    balanceAfterCents:centsFor(a),balanceAfterSats:a.balanceSats,createdAt:new Date().toISOString(),
    status:"simulation_complete" as const,test:true as const,direction:"out" as const,checkout:{id:st.checkoutId,reference:st.reference}};
  a.transactions.unshift(t);st.state="settled";st.receiptId=t.id;
  if(r){r.status="complete";r.receiptId=t.id;}
  return t;
}
/** Phase 2: merchant row. Idempotent on the settlement id. Returns a refusal reason instead of throwing so the payer can be released. */
async function creditMerchant(payerId:string,st:Settlement):Promise<string|null>{
  try{
    return await updateAccount(st.merchantId,a=>{
      const c=merchant(a).checkouts.find(c=>c.id===st.checkoutId);
      if(!c)return "Checkout no longer exists";
      if(c.paidBy?.settlementId===st.id)return null;
      if(merchant(a).status==="suspended")return "Merchant unavailable";
      if(c.paidAt)return "This checkout was already paid";
      if(Date.parse(c.expiresAt)<=Date.now())return "This checkout expired before the transfer completed";
      if(c.amount_sats!==st.amountSats)return "Checkout amount changed";
      try{creditCheckout(a,c,{via:"sandbox_transfer",accountId:payerId,settlementId:st.id});}
      catch(e){if(e instanceof HttpError)return e.message;throw e;}
      return null;
    });
  }catch(e){
    // A missing merchant row means the account was deleted; the debit must be released.
    if(e instanceof HttpError&&e.status===401)return "Merchant account no longer exists";
    throw e;
  }
}
/** Phases 2 and 3 for a settlement already recorded on the payer. Safe to call repeatedly. */
export async function completeSettlement(payerId:string,settlementId:string){
  const current=(await accountBy("id",payerId))?.settlements?.find(s=>s.id===settlementId);
  if(!current)throw new HttpError(404,"Settlement not found");
  if(current.state==="settled"||current.state==="released")return current;
  const refusal=await creditMerchant(payerId,current);
  return updateAccount(payerId,a=>{
    const st=settlements(a).find(s=>s.id===settlementId)!;
    if(st.state==="settled"||st.state==="released")return st;
    if(refusal){
      a.balanceSats+=st.amountSats;st.state="released";st.failure=refusal;
      const r=a.reviews.find(r=>r.id===st.reviewId);if(r)delete r.settlementId;
      return st;
    }
    finalizeOnPayer(a,st);
    return st;
  });
}
function receiptFor(a:Account,st:Settlement){
  if(st.state==="released")throw new HttpError(409,st.failure??"Transfer released");
  const t=a.transactions.find(t=>t.id===st.receiptId);
  if(!t)throw new HttpError(409,"Transfer is still completing; check status again");
  return t;
}
/** Pay a reviewed hosted checkout from the payer's Sandbox balance. Returns the payer's receipt. */
export async function settle(payerId:string,s:DevSession,reviewId:string,confirmed:boolean,guard:(a:Account)=>void){
  const before=await accountBy("id",payerId);
  const existing=before?.reviews.find(r=>r.id===reviewId&&r.sessionHash===s.hash);
  if(!existing||!confirmed)throw new HttpError(400,"Review and explicit approval required");
  if(!existing.checkout)throw new HttpError(400,"Review is not a checkout payment");
  if(existing.receiptId)return before!.transactions.find(t=>t.id===existing.receiptId)!;
  if(!existing.settlementId){
    // Pre-check the merchant side before taking funds, then record the debit on the payer row.
    payable(await lookupCheckoutTarget(existing.destination));
    await updateAccount(payerId,a=>{
      guard(a);eligible(a,true);
      const r=a.reviews.find(r=>r.id===reviewId&&r.sessionHash===s.hash);
      if(!r||!r.checkout)throw new HttpError(400,"Review and explicit approval required");
      if(r.receiptId||r.settlementId)return;
      if(Date.parse(r.expiresAt)<=Date.now())throw new HttpError(409,"Review expired");
      if(r.amountSats>a.balanceSats)throw new HttpError(409,"Insufficient simulated balance");
      const st:Settlement={id:randomUUID(),reviewId:r.id,merchantId:r.checkout.merchantId,checkoutId:r.checkout.checkoutId,token:r.checkout.token,
        reference:r.checkout.reference,amountSats:r.amountSats,amountCents:r.amountCents,createdAt:new Date().toISOString(),state:"debited"};
      a.balanceSats-=r.amountSats;r.settlementId=st.id;settlements(a).push(st);
    });
  }
  const a=(await accountBy("id",payerId))!;
  const r=a.reviews.find(r=>r.id===reviewId)!;
  if(r.receiptId)return a.transactions.find(t=>t.id===r.receiptId)!;
  const st=await completeSettlement(payerId,r.settlementId!);
  return receiptFor((await accountBy("id",payerId))!,st);
}
/** Resume transfers interrupted after the payer debit. Skips very recent rows that an in-flight request still owns. */
export async function resumeSettlements(payerId:string,olderThanMs=15000){
  const a=await accountBy("id",payerId);
  for(const st of a?.settlements??[]){
    if(st.state==="debited"&&Date.now()-Date.parse(st.createdAt)>olderThanMs)await completeSettlement(payerId,st.id).catch(()=>{});
  }
}
/** Background sweep across tenants so a merchant is credited even if the payer never returns. */
export async function sweepSettlements(){
  await initializeMetadata();
  const rows=await query(`SELECT DISTINCT a.id AS account_id FROM developer_accounts a, json_each(a.data,'$.settlements') s
    WHERE json_extract(s.value,'$.state')='debited' LIMIT 20`);
  for(const row of rows)await resumeSettlements(String(row.account_id));
}

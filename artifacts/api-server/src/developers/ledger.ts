import { randomUUID } from "node:crypto";
import { HttpError } from "../vault/auth";
import { centsFor, type Account, type DevSession } from "./store";

export const destinationFor = (a: Account) => `sandbox-${a.id}`;
export function snapshot(a: Account, s: DevSession) {
  if (a.provisioning !== "ready" || !a.quote) throw new HttpError(409, "Complete account provisioning first");
  return {
    environment: "sandbox", simulatedCreditCents: centsFor(a), simulatedBalanceSats: a.balanceSats,
    assignedAddress: destinationFor(a), signetAvailable: false, quote: a.quote,
    message: "Private developer simulation. No real Bitcoin, cash or Signet coins. Valuation uses your recorded provisioning quote.",
    transactions: a.transactions, reviews: a.reviews.filter(r => r.sessionHash === s.hash).map(({sessionHash,...r})=>({...r,receiptId:r.receiptId??null})),
  };
}
export function review(a: Account, s: DevSession, amountCents: number, destination: string) {
  if (!a.quote || a.provisioning !== "ready") throw new HttpError(409,"Workspace not ready");
  if (destination !== destinationFor(a)) throw new HttpError(400,"Use your assigned Sandbox identifier");
  const sats=Number((BigInt(amountCents)*100000000n+BigInt(a.quote.priceCents)-1n)/BigInt(a.quote.priceCents));
  if (!Number.isSafeInteger(sats) || sats<=0 || sats>a.balanceSats) throw new HttpError(400,"Amount exceeds your simulated balance");
  if (a.transactions.length>=1000) throw new HttpError(409,"Simulation history limit reached");
  const r={ id:randomUUID(), destination, amountCents, amountSats:sats, sessionHash:s.hash,
    createdAt:new Date().toISOString(), expiresAt:new Date(Date.now()+300000).toISOString(), status:"pending" as const };
  a.reviews=a.reviews.filter(r=>r.status==="complete" || Date.parse(r.expiresAt)>Date.now());
  if(a.reviews.length>=1000) throw new HttpError(429,"Too many reviews");
  a.reviews.push(r);
  const {sessionHash,...publicReview}=r;
  return {...publicReview,receiptId:null};
}
export function execute(a: Account,s: DevSession,id:string,confirmed:boolean) {
  const r=a.reviews.find(r=>r.id===id && r.sessionHash===s.hash);
  if(!r || !confirmed) throw new HttpError(400,"Review and explicit approval required");
  if(r.receiptId) return a.transactions.find(t=>t.id===r.receiptId)!;
  if(Date.parse(r.expiresAt)<=Date.now()) throw new HttpError(409,"Review expired");
  if(r.amountSats>a.balanceSats) throw new HttpError(409,"Insufficient simulated balance");
  a.balanceSats-=r.amountSats;
  const t={id:randomUUID(), destination:r.destination, amountCents:r.amountCents,amountSats:r.amountSats,
    balanceAfterCents:centsFor(a),balanceAfterSats:a.balanceSats,createdAt:new Date().toISOString(),
    status:"simulation_complete" as const,test:true as const};
  a.transactions.unshift(t); r.status="complete";r.receiptId=t.id;
  return t;
}

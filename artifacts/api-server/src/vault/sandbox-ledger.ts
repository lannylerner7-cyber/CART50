import { randomUUID } from "node:crypto";

// Simulation only. This module deliberately imports no Bitcoin client or signer.
export const SIMULATION_DESTINATION = "sandbox-assigned-wallet";
const MAX_RECEIPTS = 1000;
export type SandboxReceipt = {
  id: string; amountCents: number; destination: string; createdAt: string;
  status: "simulation_complete"; balanceAfterCents: number;
};
export type SandboxReview = {
  id: string; amountCents: number; destination: string; createdAt: string;
  expiresAt: string; status: "pending" | "complete"; receiptId: string | null;
  sessionHash: string;
};
export type SandboxLedger = {
  version: 1; simulatedCreditCents: number;
  reviews: SandboxReview[]; transactions: SandboxReceipt[];
};
export class SandboxError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const newSandboxLedger = (): SandboxLedger => ({
  version: 1, simulatedCreditCents: 300000, reviews: [], transactions: [],
});

export function createSimulationReview(
  ledger: SandboxLedger, amountCents: number, destination: string,
  sessionHash: string, now = Date.now(),
): SandboxReview {
  if (!Number.isSafeInteger(amountCents) || amountCents < 1 || amountCents > 300000)
    throw new SandboxError(400, "Enter a simulated amount between 0.01 and 3,000.00 demoUSD");
  if (destination !== SIMULATION_DESTINATION)
    throw new SandboxError(400, "Only the assigned simulation identifier is allowed. Bitcoin addresses cannot be used for this exercise.");
  if (amountCents > ledger.simulatedCreditCents)
    throw new SandboxError(409, "Insufficient simulated credit");
  // Expired pending reviews have no receipt; completed reviews are retained for
  // idempotent status reconciliation, including after a lost HTTP response.
  ledger.reviews = ledger.reviews.filter(r => r.status === "complete" || Date.parse(r.expiresAt) > now);
  if (ledger.reviews.filter(r => r.status === "pending").length >= 50)
    throw new SandboxError(429, "Too many pending reviews. Wait for them to expire.");
  if (ledger.transactions.length >= MAX_RECEIPTS)
    throw new SandboxError(409, "Simulation history limit reached. Existing receipts are retained.");
  const review: SandboxReview = {
    id: randomUUID(), amountCents, destination, sessionHash,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 5 * 60_000).toISOString(),
    status: "pending", receiptId: null,
  };
  ledger.reviews.push(review);
  return review;
}

export function executeSimulation(
  ledger: SandboxLedger, reviewId: string, confirmed: boolean,
  sessionHash: string, now = Date.now(),
): SandboxReceipt {
  if (confirmed !== true) throw new SandboxError(400, "Explicit approval is required");
  const review = ledger.reviews.find(r => r.id === reviewId);
  if (!review) throw new SandboxError(404, "Review not found. Create a new review.");
  if (review.sessionHash !== sessionHash)
    throw new SandboxError(409, "This review belongs to a previous session. Check activity and create a new review.");
  if (review.receiptId) {
    const existing = ledger.transactions.find(r => r.id === review.receiptId);
    if (!existing) throw new SandboxError(409, "Receipt unavailable. Do not submit a new payment.");
    return existing;
  }
  if (Date.parse(review.expiresAt) <= now) throw new SandboxError(409, "Review expired. Review the payment again.");
  if (review.destination !== SIMULATION_DESTINATION)
    throw new SandboxError(400, "Simulation destination mismatch");
  if (!Number.isSafeInteger(review.amountCents) || review.amountCents < 1 || review.amountCents > ledger.simulatedCreditCents)
    throw new SandboxError(409, "Simulated credit changed. Review the payment again.");
  if (ledger.transactions.length >= MAX_RECEIPTS) throw new SandboxError(409, "Simulation history limit reached.");
  ledger.simulatedCreditCents -= review.amountCents;
  const receipt: SandboxReceipt = {
    id: randomUUID(), amountCents: review.amountCents, destination: review.destination,
    createdAt: new Date(now).toISOString(), status: "simulation_complete",
    balanceAfterCents: ledger.simulatedCreditCents,
  };
  review.status = "complete";
  review.receiptId = receipt.id;
  ledger.transactions.unshift(receipt);
  return receipt;
}

export function publicReview({ sessionHash: _sessionHash, ...review }: SandboxReview) {
  return review;
}

import { Router } from "express";
import * as Z from "@workspace/api-zod";
import { engine } from "../vault/engine";
import { HttpError, rateLimit } from "../vault/auth";
import { changeState, readState } from "../vault/store";

// Owner/origin/CSRF middleware is inherited from /vault. Never uses Live credentials.
export const sandboxSignetRouter = Router();
const walletId = () => {
  const id = process.env.SANDBOX_SIGNET_WALLET_ID;
  if (id !== "vault-spending" && id !== "vault-reserve") throw new HttpError(503, "Assign a Signet server-held wallet before commissioning.");
  return id;
};
async function assignedWallet() {
  const wallet = Z.GetWalletResponse.parse(await engine(`/wallets/${walletId()}`, undefined, "sandbox"));
  if (wallet.id !== walletId() || wallet.status !== "active" || !wallet.address?.startsWith("tb1"))
    throw new HttpError(503, "Assigned Signet wallet is not ready. No address or balance is assumed.");
  return wallet;
}

sandboxSignetRouter.get("/", async (_req, res) => {
  let node: Z.NodeStatus | null = null;
  try {
    node = Z.ReconnectNodeResponse.parse(await engine("/status", undefined, "sandbox"));
    if (!node.connected) throw new HttpError(503, "Signet is syncing or offline; transfers remain disabled.");
    const wallet = await assignedWallet();
    const transactions = Z.ListTransactionsResponse.parse(await engine("/transactions", undefined, "sandbox"))
      .filter(t => t.walletId === wallet.id);
    res.json(Z.GetSandboxSignetResponse.parse({ available: true, network: "signet",
      message: "Actual Signet test wallet. Test coins have no monetary value. Sending is restricted to this assigned wallet address.",
      wallet, node, transactions }));
  } catch (error) {
    res.json(Z.GetSandboxSignetResponse.parse({ available: false, network: "signet",
      message: error instanceof HttpError ? error.message : "Signet connection unavailable. No balance is assumed.",
      wallet: null, node, transactions: [] }));
  }
});

sandboxSignetRouter.post("/reviews", rateLimit, async (req, res) => {
  const body = Z.ReviewSandboxSignetPaymentBody.parse(req.body);
  const wallet = await assignedWallet();
  if (body.address !== wallet.address) throw new HttpError(400, "Only the assigned Signet address is allowed.");
  const review = Z.ReviewPaymentResponse.parse(await engine("/payments/review",
    { ...body, walletId: wallet.id }, "sandbox"));
  if (review.network !== "signet" || review.walletId !== wallet.id || review.address !== wallet.address)
    throw new HttpError(503, "Signet review mismatch. Nothing was approved.");
  await changeState(state => {
    state.sandboxSignetReviews ??= [];
    // Keep expired approvals for lost-response reconciliation; bounded metadata.
    if (state.sandboxSignetReviews.length >= 1000) throw new HttpError(409, "Review history limit reached; reconciliation required.");
    state.sandboxSignetReviews.push({ id: review.id, walletId: wallet.id, address: review.address,
      sessionHash: res.locals.session.hash, expiresAt: review.expiresAt });
  });
  res.json(review);
});

sandboxSignetRouter.post("/payments", async (req, res) => {
  const body = Z.SendSandboxSignetPaymentBody.parse(req.body);
  if (body.confirmed !== true) throw new HttpError(400, "Explicit approval is required.");
  const review = (await readState()).sandboxSignetReviews?.find(r => r.id === body.reviewId);
  if (!review || review.sessionHash !== res.locals.session.hash || review.walletId !== walletId())
    throw new HttpError(409, "Review is not approved for this Sandbox session. Check Signet activity.");
  // Engine owns expiry, UTXO locking and idempotent broadcast reconciliation.
  // Do not re-create a review, auto-retry a mutation, or reset an intent here.
  const result = Z.SendPaymentResponse.parse(await engine("/payments/send", body, "sandbox"));
  if (result.walletId !== review.walletId || result.address !== review.address)
    throw new HttpError(503, "Transaction result mismatch. Check Signet history before any further action.");
  res.json(result);
});

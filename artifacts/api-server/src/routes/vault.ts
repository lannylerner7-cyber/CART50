import { Router } from "express";
import { randomUUID } from "node:crypto";
import * as Z from "@workspace/api-zod";
import { changeState, readState, externalConfigured } from "../vault/store";
import { clearSessionCookie, credentialHash, equal, HttpError, newSession, ownerHash, rateLimit, requireOwner, sessionFor, sessionPayload, verifyOrigin } from "../vault/auth";
import { engine, nodeStatus, operationalSettings } from "../vault/engine";
import { passkeyRouter } from "../vault/passkeys";
import { getMarket } from "../vault/market";
import { checkCredential, loginCooldown } from "../vault/login-security";
import { mainnetSync } from "../vault/node-sync";
import { sandboxRouter } from "./sandbox";
import { sandboxSignetRouter } from "./sandbox-signet";

const router = Router();
router.use((_req, res, next) => {
  res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
  next();
});
router.use(verifyOrigin);
router.get("/session", async (req, res) => res.json({
  ...sessionPayload(await sessionFor(req), !!await ownerHash()),
  loginRetryAfterSeconds: await loginCooldown(req),
}));
router.post("/login", async (req, res) => {
  await checkCredential(req, res);
  res.json(sessionPayload(await newSession(res)));
});
router.use(passkeyRouter);
router.post("/logout", async (req, res) => {
  const session = await sessionFor(req);
  if (session) {
    if (!equal(req.get("x-csrf-token") ?? "", session.csrf)) throw new HttpError(403, "Session verification failed");
    await changeState(s => { s.sessions = s.sessions.filter(x => x.hash !== session.hash); });
  }
  clearSessionCookie(res); res.json({ ok: true, message: "Vault locked" });
});
router.use(requireOwner);
router.use("/sandbox/signet", sandboxSignetRouter);
router.use("/sandbox", sandboxRouter);
router.get("/node/sync", async (_req, res) => res.json(await mainnetSync()));
router.post("/security/revoke", async (_req, res) => {
  await changeState(s => { s.sessions = []; }); clearSessionCookie(res);
  res.json({ ok: true, message: "All sessions revoked" });
});
router.post("/security/rotate", rateLimit, async (req, res) => {
  const body = Z.RotateCredentialBody.parse(req.body);
  const oldHash = credentialHash(body.credential), newHash = credentialHash(body.newCredential);
  if (!equal(oldHash, await ownerHash() ?? "")) throw new HttpError(401, "Current credential not recognized");
  if (oldHash === newHash) throw new HttpError(400, "Use a newly generated offline credential");
  await changeState(s => {
    if (s.credentialHash && !equal(s.credentialHash, oldHash)) throw new HttpError(409, "Credential already rotated");
    s.credentialHash = newHash; s.sessions = [];
  });
  clearSessionCookie(res); res.json({ ok: true, message: "Credential rotated. Unlock with your new keyfile; all sessions revoked." });
});
router.get("/dashboard", async (_req, res) => {
  const node = Z.ReconnectNodeResponse.parse(await nodeStatus());
  let wallets: Z.Wallet[] = [], transactions: Z.Transaction[] = [];
  if (node.connected) {
    wallets = Z.ListWalletsResponse.parse(await engine("/wallets"));
    transactions = Z.ListTransactionsResponse.parse(await engine("/transactions"));
  }
  res.json(Z.GetVaultDashboardResponse.parse({
    node, wallets, transactions: transactions.slice(0, 10),
    confirmedSats: wallets.reduce((sum, w) => sum + BigInt(w.confirmedSats), 0n).toString(),
    unconfirmedSats: wallets.reduce((sum, w) => sum + BigInt(w.unconfirmedSats), 0n).toString(),
    destructionEnabled: false, mainnetEnabled: process.env.BITCOIN_NETWORK === "main" && process.env.ALLOW_MAINNET === "true",
    services: [
      { name: "Bitcoin Core", status: node.connected ? "connected" : "disconnected", message: node.message },
      { name: "Metadata", status: externalConfigured() ? "connected" : "development", message: externalConfigured() ? "Cloudflare D1" : "Local development metadata; Cloudflare is not connected" },
      { name: "Market feed", status: getMarket().available ? "connected" : "disconnected", message: getMarket().message },
      { name: "Destruction scheduler", status: "blocked", message: "120-hour expiry; wait for verified drainage. Existing storage retained by owner choice: key destruction and history deletion remain blocked because storage erasure is unverified." },
    ],
    activity: [{ id: "safety", title: node.network === "main" ? "Mainnet custody boundary" : "Test-network safety boundary", message: node.network === "main" ? "Real Bitcoin network. Server-held keys are online; automatic key destruction remains disabled." : "Test coins only. Automatic key destruction remains disabled.", createdAt: new Date().toISOString(), severity: "info" }],
  }));
});
router.get("/wallets", async (_req, res) => res.json(Z.ListWalletsResponse.parse(await engine("/wallets"))));
router.post("/wallets", async (req, res) => {
  const body = Z.CreateWalletsBody.parse(req.body);
  if (!body.label.trim()) throw new HttpError(400, "Wallet label required");
  res.json(Z.CreateWalletsResponse.parse(await engine("/wallets/create", body)));
});
router.get("/wallets/:id", async (req, res) => {
  const { id } = Z.GetWalletParams.parse(req.params);
  res.json(Z.GetWalletResponse.parse(await engine(`/wallets/${encodeURIComponent(id)}`)));
});
router.post("/wallets/:id/receive", async (req, res) => {
  const { id } = Z.CreateWalletReceiveAddressParams.parse(req.params);
  const node = await nodeStatus();
  const network = process.env.BITCOIN_NETWORK === "main" ? "main" : process.env.BITCOIN_NETWORK === "regtest" ? "regtest" : "signet";
  if (!node.connected || node.network !== network) throw new HttpError(503, "Node disconnected or network mismatch; receiving is unavailable");
  res.json(Z.CreateWalletReceiveAddressResponse.parse(await engine(`/wallets/${encodeURIComponent(id)}/receive`, {})));
});
router.patch("/wallets/:id", async (req, res) => {
  const { id } = Z.UpdateWalletParams.parse(req.params);
  res.json(Z.UpdateWalletResponse.parse(await engine(`/wallets/${encodeURIComponent(id)}/rename`, Z.UpdateWalletBody.parse(req.body))));
});
router.delete("/wallets/:id", async (req, res) => {
  const { id } = Z.DeleteWalletHistoryParams.parse(req.params);
  res.json(Z.DeleteWalletHistoryResponse.parse(await engine(`/wallets/${encodeURIComponent(id)}/delete`, {})));
});
router.get("/transactions", async (_req, res) => res.json(Z.ListTransactionsResponse.parse(await engine("/transactions"))));
router.get("/settings", async (_req, res) => res.json(await operationalSettings()));
router.put("/settings", async (req, res) => {
  const body = Z.UpdateVaultSettingsBody.parse(req.body);
  if (BigInt(body.totalFeeCeilingSats) > 2100000000000000n || BigInt(body.hotExposureLimitSats) > 2100000000000000n || Number(body.feeRateCeiling) > 10000) throw new HttpError(400, "Limit exceeds supported range");
  // Apply to authoritative signer before reporting success. Metadata alone cannot unpause it.
  await engine("/settings", body);
  res.json(await operationalSettings());
});
router.post("/node/reconnect", async (_req, res) => res.json(Z.ReconnectNodeResponse.parse(await nodeStatus())));
router.get("/market", (_req, res) => res.json(getMarket()));
router.get("/alerts", async (_req, res) => res.json((await readState()).alerts));
function validateAlert(body: ReturnType<typeof Z.CreateAlertBody.parse>) {
  if (!body.name.trim() || !Number.isFinite(body.threshold) || (body.kind === "percent_drop" && body.threshold > 100)) throw new HttpError(400, "Invalid alert threshold or name");
  return body;
}
router.post("/alerts", async (req, res) => {
  const body = validateAlert(Z.CreateAlertBody.parse(req.body));
  const alert = { ...body, id: randomUUID(), lastTriggeredAt: null, armed: true };
  await changeState(s => { if (s.alerts.length >= 100) throw new HttpError(400, "Maximum 100 alerts"); s.alerts.push(alert); });
  res.json(alert);
});
router.put("/alerts/:id", async (req, res) => {
  const body = validateAlert(Z.UpdateAlertBody.parse(req.body));
  const result = await changeState(s => {
    const a = s.alerts.find(x => x.id === req.params.id);
    if (!a) throw new HttpError(404, "Alert not found");
    Object.assign(a, body, { armed: true }); return a;
  });
  res.json(result);
});
router.delete("/alerts/:id", async (req, res) => {
  await changeState(s => { s.alerts = s.alerts.filter(a => a.id !== req.params.id); });
  res.json({ ok: true, message: "Alert deleted" });
});
router.get("/notifications", async (_req, res) => res.json((await readState()).notifications.slice().reverse()));
router.post("/notifications/:id/read", async (req, res) => {
  await changeState(s => { const n = s.notifications.find(n => n.id === req.params.id); if (n) n.read = true; });
  res.json({ ok: true, message: "Notification marked read" });
});
router.get("/explorer", async (req, res) => {
  const { query } = Z.ExploreVaultQueryParams.parse(req.query);
  if (query.length > 128 || query.length < 10) throw new HttpError(400, "Enter a Bitcoin address or transaction ID");
  res.json(Z.ExploreVaultResponse.parse(await engine(`/explorer?query=${encodeURIComponent(query)}`)));
});
router.post("/payments/review", async (req, res) => res.json(Z.ReviewPaymentResponse.parse(await engine("/payments/review", Z.ReviewPaymentBody.parse(req.body)))));
router.post("/payments/send", async (req, res) => {
  const body = Z.SendPaymentBody.parse(req.body);
  if (!body.confirmed) throw new HttpError(400, "Explicit payment approval required");
  res.json(Z.SendPaymentResponse.parse(await engine("/payments/send", body)));
});
export default router;

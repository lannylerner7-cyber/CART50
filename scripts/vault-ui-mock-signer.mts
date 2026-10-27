// LOCAL ACCEPTANCE ONLY. No private keys, signing, RPC or blockchain connection.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

export async function startMockSigner(token: string) {
  const state = { online: true, lookupError: false, shortReview: false };
  const address = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
  const now = () => new Date().toISOString();
  const wallets = ["vault-reserve", "vault-spending"].map((id, i) => ({
    id, label: i ? "Spending" : "Main wallet", address,
    kind: i ? "spending" : "reserve", createdAt: now(), expiresAt: null,
    status: "active", destructionStatus: "disabled", confirmedSats: "1000000",
    unconfirmedSats: "0", availableSats: "1000000", totalReceivedSats: "1000000",
    totalSweptSats: "0", lastSync: now(),
  }));
  const transactions: Record<string, unknown>[] = [];
  const reviews = new Map<string, Record<string, any>>();
  const submitted = new Map<string, Record<string, unknown>>();
  let settings = { sweepsPaused: true, feeRateCeiling: "10", totalFeeCeilingSats: "10000", hotExposureLimitSats: "1000000" };
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401).end("{}"); return; }
    let raw = ""; for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    const path = req.url ?? "";
    const send = (data: unknown, status = 200) => { res.writeHead(status).end(JSON.stringify(data)); };
    if (path === "/status") return send({
      connected: state.online, network: "main", blocks: 100, headers: 100,
      syncProgress: 1, peers: state.online ? 4 : 0, lastSync: now(),
      message: "Disposable local acceptance fixture; no blockchain connection.",
      recoveryStatus: state.online ? "ready" : "waiting_for_connection",
    });
    if (path === "/sync") return send({ available: state.online, network: "main", message: "Local acceptance observation only.",
      observedAt: now(), blocks: 100, headers: 100, verificationProgress: 1, initialBlockDownload: false });
    if (!state.online) return send({error: "Disposable node unavailable"}, 503);
    if (path === "/settings") { if (req.method === "POST") settings = body; return send(settings); }
    if (path === "/wallets") return send(wallets.map(w => ({...w, lastSync: now()})));
    if (path === "/transactions") return send(transactions);
    const walletMatch = path.match(/^\/wallets\/([^/]+)(\/receive)?$/);
    if (walletMatch) return send(wallets.find(w => w.id === walletMatch[1]) ?? {error:"not found"}, wallets.some(w => w.id === walletMatch[1]) ? 200 : 404);
    if (path === "/payments/review") {
      const r = { ...body, id: randomUUID(), network: "main", feeSats: "100",
        totalSats: (BigInt(body.amountSats) + 100n).toString(),
        expiresAt: new Date(Date.now() + (state.shortReview ? 1500 : 300000)).toISOString() };
      reviews.set(r.id, r); return send(r);
    }
    if (path === "/payments/send") {
      if (submitted.has(body.reviewId)) return send(submitted.get(body.reviewId));
      const r = reviews.get(body.reviewId);
      if (!body.confirmed || !r || Date.parse(r.expiresAt) <= Date.now()) return send({error:"Review expired or missing"},409);
      const tx = { txid: randomUUID().replaceAll("-","").repeat(2), walletId: r.walletId, direction: "sent",
        amountSats: r.amountSats, feeSats: r.feeSats, firstSeen: now(), confirmations: 0,
        status: "pending", address: r.address, replacedBy: null };
      submitted.set(r.id, tx); transactions.unshift(tx); return send(tx);
    }
    return send({error:"Not implemented in disposable fixture"}, 503);
  }).listen(0,"127.0.0.1");
  await new Promise<void>(resolve => server.once("listening",resolve));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (!url.startsWith("https://mempool.space/api/address/")) return originalFetch(input, init);
    await new Promise(r => setTimeout(r, 750));
    if (state.lookupError) return new Response("fixture unavailable", {status:503});
    if (url.endsWith("/txs")) return Response.json([]);
    return Response.json({address: decodeURIComponent(url.split("/").at(-1)!),
      chain_stats: {funded_txo_sum: 123456, spent_txo_sum: 0, tx_count: 0},
      mempool_stats: {funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0}});
  };
  return { state, server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

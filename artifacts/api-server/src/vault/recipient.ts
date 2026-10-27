import { address as bitcoinAddress, networks } from "bitcoinjs-lib";
import { z } from "zod";
import { HttpError } from "./auth";
import { GetRecipientResponse } from "@workspace/api-zod";

const sats = z.number().int().min(0).max(2100000000000000);
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const stats = z.object({ funded_txo_sum: sats, spent_txo_sum: sats, tx_count: count });
const summarySchema = z.object({ address: z.string(), chain_stats: stats, mempool_stats: stats });
const output = z.object({ scriptpubkey_address: z.string().optional(), value: sats });
const historySchema = z.array(z.object({
  txid: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.object({ confirmed: z.boolean(), block_time: count.optional() }),
  vin: z.array(z.object({ prevout: output.nullable().optional() })).max(10000),
  vout: z.array(output).max(10000),
})).max(100);

export function mainnetAddress(input: string) {
  const normalized = input.startsWith("BC1") && input === input.toUpperCase() ? input.toLowerCase() : input;
  if (normalized.length < 14 || normalized.length > 90) throw new HttpError(400, "Enter a Bitcoin mainnet address.");
  try { bitcoinAddress.toOutputScript(normalized, networks.bitcoin); }
  catch { throw new HttpError(400, "Invalid Bitcoin mainnet address. Test-network addresses and payment URLs are not accepted here."); }
  return normalized;
}

async function boundedJson(response: Response) {
  if (!response.ok) throw new HttpError(503, "Address indexer unavailable. No balance is assumed; try again later.");
  if (!response.body) throw new Error("Missing indexer body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.length;
      if (size > 2 * 1024 * 1024) throw new Error("Indexer response too large");
      chunks.push(result.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { await reader.cancel().catch(() => undefined); }
}

// Injected fetch is for deterministic tests only. Runtime always uses the pinned
// public mainnet indexer; no caller-controlled URL or Core RPC is involved.
export async function observeRecipient(input: string, request: typeof fetch = fetch) {
  const address = mainnetAddress(input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const base = `https://mempool.space/api/address/${encodeURIComponent(address)}`;
    const read = async (url: string) => boundedJson(await request(url, {
      signal: controller.signal, redirect: "error", headers: { Accept: "application/json" },
    }));
    const [summaryRaw, historyRaw] = await Promise.all([read(base), read(`${base}/txs`)]);
    const summary = summarySchema.parse(summaryRaw);
    const history = historySchema.parse(historyRaw);
    if (summary.address !== address) throw new Error("Address mismatch");
    const confirmed = BigInt(summary.chain_stats.funded_txo_sum) - BigInt(summary.chain_stats.spent_txo_sum);
    if (confirmed < 0n) throw new Error("Invalid confirmed balance");
    const transactionCount = summary.chain_stats.tx_count + summary.mempool_stats.tx_count;
    if (!Number.isSafeInteger(transactionCount)) throw new Error("Invalid transaction count");
    const transactions = history.slice(0, 10).map(tx => ({
      txid: tx.txid, confirmed: tx.status.confirmed,
      blockTime: tx.status.block_time ?? null,
      netSats: (
        tx.vout.reduce((n, out) => n + (out.scriptpubkey_address === address ? BigInt(out.value) : 0n), 0n) -
        tx.vin.reduce((n, vin) => n + (vin.prevout?.scriptpubkey_address === address ? BigInt(vin.prevout.value) : 0n), 0n)
      ).toString(),
    }));
    return GetRecipientResponse.parse({
      address, network: "main", provider: "mempool.space", observedAt: new Date().toISOString(),
      confirmedSats: confirmed.toString(),
      unconfirmedSats: (BigInt(summary.mempool_stats.funded_txo_sum) - BigInt(summary.mempool_stats.spent_txo_sum)).toString(),
      transactionCount, transactions, historyLimited: transactionCount > transactions.length,
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, "Address observation could not be verified. No balance is assumed; retry the lookup.");
  } finally { clearTimeout(timer); controller.abort(); }
}

const reads = new Map<string, ReturnType<typeof observeRecipient>>();
export function recipientObservation(input: string) {
  const address = mainnetAddress(input);
  const existing = reads.get(address);
  if (existing) return existing;
  if (reads.size >= 4) throw new HttpError(503, "Address lookup busy. Please try again shortly.");
  const pending = observeRecipient(address).finally(() => reads.delete(address));
  reads.set(address, pending);
  return pending;
}

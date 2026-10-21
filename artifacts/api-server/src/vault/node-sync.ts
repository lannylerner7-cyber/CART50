import { GetNodeSyncResponse } from "@workspace/api-zod";
import { ReadFlight } from "./read-flight";

const flight = new ReadFlight<ReturnType<typeof GetNodeSyncResponse.parse>>();
const unavailable = (message: string) => GetNodeSyncResponse.parse({
  available: false, message, network: "main", observedAt: null,
  blocks: null, headers: null, verificationProgress: null, initialBlockDownload: null,
});

// Never use this connection for wallet operations. The wallet's network stays pinned.
export function mainnetSync() {
  return flight.read(async () => {
    const walletIsMainnet = process.env.BITCOIN_NETWORK === "main";
    const url = process.env.MAINNET_MONITOR_URL || (walletIsMainnet ? process.env.VAULT_ENGINE_URL : undefined);
    const token = process.env.MAINNET_MONITOR_TOKEN || (walletIsMainnet && !process.env.MAINNET_MONITOR_URL ? process.env.VAULT_ENGINE_TOKEN : undefined);
    if (!url || !token) return unavailable("Mainnet monitoring is not connected. Configure the private read-only monitor connection; wallet settings remain unchanged.");
    try {
      const base = new URL(url);
      if (base.username || base.password || (base.protocol !== "https:" &&
        !(base.protocol === "http:" && ["vault-mainnet-engine", "localhost", "127.0.0.1"].includes(base.hostname)))) {
        return unavailable("Mainnet monitor URL must use HTTPS or the private mainnet service.");
      }
      const response = await fetch(new URL("/sync", base), {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) return unavailable("Mainnet monitor unavailable. Check the connection and that the engine includes sync monitoring.");
      const data = GetNodeSyncResponse.parse(await response.json());
      const observed = Date.parse(data.observedAt ?? "");
      if (!data.available || data.network !== "main" || !Number.isFinite(observed) ||
        Date.now() - observed > 60000 || observed - Date.now() > 30000 ||
        data.blocks == null || data.blocks < 0 || data.headers == null || data.headers < data.blocks ||
        data.verificationProgress == null || data.verificationProgress < 0 || data.verificationProgress > 1 ||
        data.initialBlockDownload == null) {
        return unavailable("Mainnet monitor returned stale or invalid data. No progress is assumed.");
      }
      return data;
    } catch {
      return unavailable("Cannot reach the mainnet sync monitor. No progress is assumed.");
    }
  });
}

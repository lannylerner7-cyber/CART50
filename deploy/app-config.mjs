// Never report values: only variable names may appear in deployment errors.
import { isIP } from "node:net";

export function validateConfig(env) {
  const errors = [];
  if (env.NODE_ENV !== "production") errors.push("NODE_ENV must be production");
  if (!["main", "signet", "regtest"].includes(env.BITCOIN_NETWORK)) errors.push("BITCOIN_NETWORK must be main, signet or regtest");
  if (env.BITCOIN_NETWORK === "main" && env.ALLOW_MAINNET !== "true") errors.push("ALLOW_MAINNET=true is required for explicit mainnet operation");
  if (env.BITCOIN_NETWORK === "main" && (!env.VAULT_ENGINE_URL || !env.VAULT_ENGINE_TOKEN)) errors.push("VAULT_ENGINE_URL and VAULT_ENGINE_TOKEN are required for mainnet");
  const port = Number(env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push("PORT must be 1–65535");
  try {
    const url = new URL(env.PUBLIC_ORIGIN);
    if (url.protocol !== "https:" || url.origin !== env.PUBLIC_ORIGIN) throw new Error();
  } catch { errors.push("PUBLIC_ORIGIN must be an exact HTTPS origin without a trailing slash"); }
  if (!/^[a-f0-9]{64}$/.test(env.VAULT_OWNER_VERIFIER ?? "")) errors.push("VAULT_OWNER_VERIFIER must be a SHA-256 verifier, not the login key");
  if (!/^[a-f0-9]{32}$/.test(env.CF_ACCOUNT_ID ?? "")) errors.push("CF_ACCOUNT_ID is required");
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(env.CF_D1_DATABASE_ID ?? "")) errors.push("CF_D1_DATABASE_ID must be a database UUID");
  if (!env.CF_API_TOKEN?.trim()) errors.push("CF_API_TOKEN is required; production cannot fall back to SQLite");
  if (env.VAULT_ENGINE_URL || env.VAULT_ENGINE_TOKEN) {
    try {
      const url = new URL(env.VAULT_ENGINE_URL);
      if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error();
      if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost", "vault-engine", "vault-mainnet-engine"].includes(url.hostname))) throw new Error();
    } catch { errors.push("VAULT_ENGINE_URL must use HTTPS or the local private vault-engine service"); }
    if ((env.VAULT_ENGINE_TOKEN?.length ?? 0) < 32) errors.push("VAULT_ENGINE_TOKEN must contain at least 32 characters");
  }
  if (env.MARKET_WORKER_URL) {
    try {
      const url = new URL(env.MARKET_WORKER_URL);
      if (url.protocol !== "https:" || url.username || url.password) throw new Error();
    } catch { errors.push("MARKET_WORKER_URL must use HTTPS without embedded credentials"); }
  }
  if (!env.VAULT_STATIC_DIR) errors.push("VAULT_STATIC_DIR is required");
  // Alerts are a required part of this operator's deployment, not an optional
  // integration that can silently remain disconnected until the first incident.
  if ((env.SMTP_HOST || "smtp.mx.cloudflare.net") !== "smtp.mx.cloudflare.net") errors.push("SMTP_HOST must be the Cloudflare SMTP host");
  if (Number(env.SMTP_PORT || "465") !== 465) errors.push("SMTP_PORT must be 465; implicit TLS is required");
  if ((env.SMTP_USER || "api_token") !== "api_token") errors.push("SMTP_USER must be api_token");
  if (!env.SMTP_PASSWORD?.trim()) errors.push("SMTP_PASSWORD is required");
  const email = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
  for (const key of ["SECURITY_ALERT_FROM", "SECURITY_ALERT_TO"]) {
    if (!email.test(env[key] ?? "") || env[key].length > 254) errors.push(`${key} must be a single email address`);
  }
  if ((env.TRUSTED_PROXY_IPS ?? "").split(",").map(ip => ip.trim()).filter(Boolean).some(ip => !isIP(ip))) {
    errors.push("TRUSTED_PROXY_IPS must contain exact proxy IP addresses only");
  }
  return errors;
}

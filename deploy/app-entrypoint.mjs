import { access } from "node:fs/promises";
import path from "node:path";
import { validateConfig } from "./app-config.mjs";

const errors = validateConfig(process.env);
if (errors.length) {
  console.error("Vault deployment configuration rejected:\n" + errors.join("\n"));
  process.exit(1);
}
try {
  await access(path.join(process.env.VAULT_STATIC_DIR, "index.html"));
} catch {
  console.error("Built dashboard is missing from VAULT_STATIC_DIR");
  process.exit(1);
}
// Read-only dependency check: never migrate or initialize a remote database here.
try {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/d1/database/${process.env.CF_D1_DATABASE_ID}/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CF_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sql: "SELECT id,version,data FROM vault_state LIMIT 0", params: [] }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json();
  if (!response.ok || !data.success || !data.result?.[0]?.success) throw new Error();
} catch {
  console.error("D1 startup check failed. Verify the database, token permissions and applied migration; no local fallback is permitted.");
  process.exit(1);
}
await import("./dist/index.mjs");

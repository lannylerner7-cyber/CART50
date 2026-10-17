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
// The bundled server verifies and additively initializes its code-owned D1 schema
// before listening. It fails closed on unsafe drift or missing permissions.
await import("./dist/index.mjs");

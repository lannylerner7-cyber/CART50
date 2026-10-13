// Public, read-only commissioning probe. Never accepts credentials or disables TLS.
import { pathToFileURL } from "node:url";

export function validateOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Supply an HTTPS origin only, without credentials, path, query or fragment.");
  }
  return url.origin;
}

async function smallJson(response) {
  if (!response.body) throw new Error("Missing body");
  const reader = response.body.getReader();
  let text = "", bytes = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 16384) throw new Error("Response too large");
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    await reader.cancel();
  }
}

export async function probe(origin, fetcher = fetch) {
  const base = validateOrigin(origin);
  const cases = [
    { name: "public-health", path: "/api/healthz", status: 200, health: true },
    { name: "owner-gate", path: "/api/vault/dashboard", status: 401 },
    { name: "api-not-found", path: "/api/commissioning-route-does-not-exist", status: 404 },
  ];
  const results = [];
  // Serial and bounded: three unauthenticated GETs, no login attempts.
  for (const check of cases) {
    try {
      const response = await fetcher(base + check.path, {
        method: "GET", redirect: "manual", credentials: "omit",
        signal: AbortSignal.timeout(10000), headers: { Accept: "application/json" },
      });
      let passed = response.status === check.status &&
        (response.headers.get("content-type") || "").includes("application/json");
      if (passed && check.health) passed = (await smallJson(response)).status === "ok";
      else await response.body?.cancel();
      results.push({ name: check.name, expectedStatus: check.status, observedStatus: response.status, passed });
    } catch {
      // Deliberately exclude server bodies, URLs and provider exception strings.
      results.push({ name: check.name, passed: false, error: "TLS, network, timeout or response validation failed" });
    }
  }
  return { scope: "public read-only checks; not D1/Core/SMTP/recovery readiness",
    origin: base, results, passed: results.every(r => r.passed) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new Error("Usage: node scripts/vault-live-probe.mjs https://your-vault-host");
    const result = await probe(process.argv[2]);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.passed ? 0 : 1;
  } catch {
    console.error("Invalid invocation: supply one HTTPS origin without credentials, path, query or fragment.");
    process.exitCode = 2;
  }
}

# API guide and security review — 2026-11-05

## Delivered

The existing public Resources documentation anchor now contains an eight-part
integration guide: onboarding, API/return/webhook URL differences, DNS, credentials,
curl/Node/Python requests, schema constraints, status, idempotency, signed raw-body
webhook verification, atomic deduplication, rotation, retries, errors and acceptance.
Examples describe the implemented checkout service, not future live wallet APIs.

## Code hardening

- Public developer console, checkout, v1 and developer-wallet paths now share a
  bounded pre-parser admission pool, separate from owner admission. Previously only
  the developer onboarding prefix had that protection.
- Reject compressed JSON before decompression; retain a 64 KB JSON limit.
- Explicit 413 oversized-body and 415 unsupported-encoding responses.
- Updated compatible dependencies and transitive security patches. Express's latest
  parent still resolved body-parser 2.3.0; a 2.4.0 override addresses its reported
  compressed-body denial of service, with inflate disabled as defense in depth.

## Evidence, not a blanket security certification

Initial dependency scanner: 0 critical, 5 high, 11 moderate, 4 low.
Final dependency scanner after updates: 0 critical, 1 high, 0 moderate, 0 low.
The remaining finding at that point was GHSA-mrhx-c7xc-m3w5, Zod 3.25.76
oversized collection validation. It has now been resolved by the Zod 4 migration
below. The 64 KB parser cap and admission limit remain defense in depth.

### Zod 4 migration verification — 2026-11-05

- Pinned the workspace catalog to Zod 4.6.7 and Orval's Zod target to version 4;
  regenerated only the Zod project. OpenAPI and React client contracts are unchanged.
  All workspace consumers now resolve the patched version, with no Zod 3 lock entry.
- Generated integers use Zod 4 safe-integer validation. Valid amounts, counters,
  query coercion, nullable fields and arbitrary-key records retain their contracts.
  Orval now correctly emits `looseObject` for `DeveloperActionResult`, whose
  OpenAPI contract explicitly allows additional properties (the prior generator
  stripped them). Server action responses are sent directly, not parsed by that
  generated response schema, so this does not change route behavior.
- Kept strict server request validation, amount limits and normalization. Shared
  key-scope validation now derives from the generated schema and adds `.strict()`;
  checkout input schemas are isolated for direct regression tests.
- Deterministic oversized-array regressions use a throwing entry getter to prove
  no element is read for generated scopes, server scopes or return URLs. Additional
  array/set/map tests prove oversized input never invokes element refinements in
  synchronous or asynchronous parsing. Boundary and normal requests still succeed.
- `pnpm run typecheck` passed across libraries and all leaf packages.
  All 73 API-server tests passed in a subprocess without inherited service
  credentials, including request-size rejection, checkout, credential rotation,
  tenant isolation and recovery checks.
- Fresh dependency scan: **0 critical, 0 high, 0 moderate, 0 low, 0 info**.
  This closes the dependency finding, not the separate hosted release gates below.

No hosted storage migration, deployment or real-money operation was performed.

SAST completed with zero reported results; privacy/dataflow scan completed with
zero vulnerabilities. Scans do not prove absence of backdoors or vulnerabilities.

Disposable local regression checks cover body rejection and subsequent availability,
checkout/admin boundaries, tenant denial, duplicate simulation, webhook leases,
atomic shared quotas and fail-closed behavior, login lockout/trusted proxy handling.
Frontend/backend typechecks and frontend production build pass. Managed API build
and all workflows start cleanly. Public documentation screenshot at 390px is readable.
No signed-in payment browser journey was changed or claimed as tested here.

## Existing protections reviewed

Tenant-owned bearer lookup, scoped/revocable keys, exact return URL allowlists,
same-origin gates on cookie-authenticated writes, recent-passkey administrative
authorization, idempotent checkout writes and public status-only operations.
Webhook delivery resolves and pins public IPv4, rejects private destinations,
retains TLS hostname checks, forbids redirects, has a timeout and signs exact bytes.
Shared budgets use database-clock windows and deny requests on storage failure.
Developer quotas do not block emergency owner administration.

## DDoS and hosted release gates

This is source/local evidence, not a production traffic or penetration test.
No flood was sent to a public server.

Before public scale, verify through separately authorized read-only access:
1. Cloud edge proxy/WAF/bot and rate-limit coverage on the actual API hostname.
2. Origin firewall prevents bypass of that edge; only expected proxy sources
   reach application ports. Keep SSH/admin access controlled and Core RPC private.
3. Explicit trusted proxy CIDRs match deployment topology; forwarded headers from
   arbitrary callers must not establish client identity.
4. Reverse proxy header/body/read timeouts, connection caps, request size limits,
   TLS, monitoring and recovery behavior; application admission does not stop
   network saturation or slow connections before Express sees a request.
5. Shared limiter binding/migration is actually active across replicas and
   remains fail-closed during storage outages.
6. Capacity tests in an isolated environment with agreed ceilings. Current global
   quotas can intentionally deny legitimate developer traffic during a flood;
   edge filtering and measured capacity work remain necessary.
7. Hosted webhook signature/replay/timeout tests, secret recovery, and database
   restore evidence. Local injected delivery is not hosted acceptance.

No deployment, D1 migration, namespace change, real transfer, mainnet storage
change, or Signet restart occurred. Nothing was pushed to GitHub.

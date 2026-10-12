# Personal Bitcoin Vault

Single-owner Bitcoin control room. **Test networks only; not ready for real funds.**
See `docs/vault-operations.md` for setup, deployment boundaries, verification and
the explicitly unfinished production safeguards.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `cd services/vault-engine && VAULT_REGTEST=1 go test -v ./...` — isolated Bitcoin Core checks
- Vault setup uses `VAULT_OWNER_VERIFIER` and `PUBLIC_ORIGIN`; see operating guide.
- The unused Postgres starter is not the vault's data store. Do not run its schema push for this product.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- Metadata: local SQLite in development, Cloudflare D1 adapter in production.
- Bitcoin: independent Go engine beside Core on AWS/Coolify; never a public RPC.
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/bitcoin-vault`: React UI; `public/offline-keygen.html`: offline credential generator.
- `artifacts/api-server/src/vault`: access, sessions, metadata and alerts.
- `services/vault-engine`: Core RPC, wallet tracking, signed-intent journal and regtest checks.
- `lib/api-spec/openapi.yaml`: authoritative API contract; regenerate clients with codegen.
- `lib/vault-cloudflare`: Worker, D1 migration and replication/backup endpoint scaffolding.
- `scripts/vault-backup.mjs`: offline, independently keyed encrypted export.

## Architecture decisions

- Keep the user's explicit secret-based owner access; do not replace it with username/password.
- Metadata availability must not control Bitcoin signing correctness; one local signer is authoritative.
- Expiration is not destruction. Unsettled-fund policy and verifiable storage erasure need owner approval before destructive scheduling.
- No fake balances, fake transactions or preview infrastructure presented as live production.

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

#!/usr/bin/env bash
# Local verification only. Does not commission infrastructure or use real funds.
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/update-roadmap.mjs --check
node --test scripts/update-roadmap.test.mjs
pnpm run typecheck
pnpm --filter @workspace/vault-cloudflare run typecheck
pnpm --filter @workspace/api-server exec tsx --test src/vault/*.test.ts src/static.test.ts
pnpm --filter @workspace/api-server exec tsx --test ../bitcoin-vault/src/lib/session-lock.test.ts
node --test deploy/app-config.test.mjs deploy/coolify-bitcoin.test.mjs scripts/vault-backup.test.mjs lib/vault-cloudflare/src/index.test.mjs
node --test scripts/signet-setup-generator.test.mjs scripts/signet-generator-browser.test.mjs
pnpm --filter @workspace/api-server run build
NODE_ENV=production PORT=3000 BASE_PATH=/ pnpm --filter @workspace/bitcoin-vault run build
node --test scripts/vault-package.test.mjs scripts/vault-live-probe.test.mjs scripts/mockup-discovery.test.mjs
(cd services/vault-engine && go test -race ./... && go vet ./...)
git diff --check

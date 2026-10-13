#!/usr/bin/env bash
# Build/export only. No push, registry upload, deploy, runtime secrets or wallets.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
for cmd in docker node git gzip sha256sum; do command -v "$cmd" >/dev/null; done
revision=$(git rev-parse HEAD)
stamp=$(date -u +%Y%m%dT%H%M%SZ)
out="generated-artifacts/vault-release-$stamp-$$"
mkdir -p "$out"
app="personal-vault-app:commission-$stamp-$$"
engine="personal-vault-engine:commission-$stamp-$$"
echo "Building isolated deployment images. Output: $out"
# Fingerprint the non-ignored source files, including uncommitted task changes.
git ls-files --cached --others --exclude-standard -z |
  sort -zu | xargs -0 sha256sum > "$out/source-files.sha256"
docker build --platform linux/amd64 --label "org.opencontainers.image.revision=$revision" -t "$app" -f Dockerfile .
docker build --platform linux/amd64 --label "org.opencontainers.image.revision=$revision" -t "$engine" -f deploy/vault-engine.Dockerfile .
node scripts/vault-docker-verify.mjs "$app" "$engine" > "$out/container-checks.txt"
app_id=$(docker image inspect --format '{{.Id}}' "$app")
engine_id=$(docker image inspect --format '{{.Id}}' "$engine")
# Export by immutable ID, so a concurrent retag cannot change the delivered image.
docker image save "$app_id" "$engine_id" | gzip -1 > "$out/vault-images.tar.gz"
cp deploy/coolify.env.example "$out/app.env.example"
cp deploy/coolify-signer.env.example "$out/signer.env.example"
cp docs/vault-offline-handoff.md "$out/README.md"
node --input-type=module - "$revision" "$app_id" "$engine_id" "$out" <<'NODE'
import { writeFileSync } from "node:fs";
const [revision, appImageId, signerImageId, out] = process.argv.slice(2);
writeFileSync(`${out}/manifest.json`, JSON.stringify({
  schema: 1, revision, builtAt: new Date().toISOString(),
  sourceFingerprintFile: "source-files.sha256",
  sourceNote: "Fingerprint includes uncommitted non-ignored source files; revision alone is not the source fingerprint.",
  platform: "linux/amd64", network: "signet", appImageId, signerImageId,
  commissioned: false, realFundsApproved: false
}, null, 2) + "\n", { mode: 0o600 });
NODE
(cd "$out"; sha256sum vault-images.tar.gz manifest.json source-files.sha256 container-checks.txt app.env.example signer.env.example README.md > SHA256SUMS)
echo "COMPLETE: $out"
echo "Private local package only. Not transferred, deployed, or approved for real funds."

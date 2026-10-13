# Commissioning tools built — 2026-10-13

**Partial completion only. GitHub remains unpushed. No deployment or outage test
was started. No real-funds approval.**

## Delivered locally

- `scripts/vault-release.sh`: rebuilds both amd64 images, checks their isolated
  runtime behavior, and exports by immutable image ID with a manifest, source
  fingerprints, safe variable templates, handoff instructions and SHA-256 sums.
- `scripts/vault-live-probe.mjs`: strict HTTPS, no redirects/credentials, three
  read-only public checks, bounded requests/body size, sanitized results.
- `docs/vault-offline-handoff.md`: private operator transfer/import and runtime
  configuration instructions, without GitHub or a public registry.
- Replaced design preview's fast-glob dependency with native Node discovery.

## Evidence

- Consolidated verification passed: typechecks, 25 Node tests, Go race/vet, app
  production build, isolated package checks.
- Fresh images passed offline runtime checks and archive checksums verified.
- Current release:
  `generated-artifacts/vault-release-20261013T060504Z-4895/`
  (approximately 94 MiB compressed image archive). It stays private and ignored
  by Git/deployment. Earlier exports are superseded; use this release.
- Dependency audit: 0 critical, 0 high, 43 moderate. Static/privacy scans had
  no findings before the small discovery replacement; no independent audit claimed.
- Extracted signer reports Go 1.26.9. Binary-mode govulncheck v1.1.4 found no
  vulnerabilities. This does not substitute for image/OS vulnerability analysis.
- Preview workflow restarted cleanly; public preview screenshot rendered.
- Live public probe returned 503 on all three routes, correctly failing.
- Authenticated Cloudflare readback: D1 and R2 exist; primary Queue exists with
  zero producers and zero consumers; Worker settings read returns 404.

## What is blocked

The operator has not transferred/imported the images or started the test server.
Live D1 authentication, SMTP inbox delivery, owner-key/proxy/lockout checks,
synced signet Core/private signer, encrypted admin access, Worker bindings,
replication/outage/recovery exercises remain unverified.

Worker upload still needs an approved successful deployment path. The existing
resource readback is not permission to claim the Worker or its consumers exist.
Use the established operator handoff if the connector upload challenge persists.

Next operator action: transfer/import the private release through the existing
authenticated SSH/SFTP channel, configure runtime settings and private networks,
and start the isolated signet deployment. Then execute stages D–J of
`docs/vault-completion-plan.md`. Do not paste secrets into chat or expose the
package through a public download link.

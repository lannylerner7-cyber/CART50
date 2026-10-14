# Private test-image handoff — no GitHub push

This package contains app and signer images, not Bitcoin Core, secrets, databases,
wallets, a deployed Worker, or a commissioned vault. Signet only. Do not expose
Core RPC 38332 or signer 9090. Never run overlapping signers.

## Build in the workspace

Run `bash scripts/vault-release.sh`. The script builds both amd64 images, runs
isolated container checks and exports them under an ignored
`generated-artifacts/vault-release-*` directory. Files are owner-readable only.
It never pushes to GitHub, uploads to a registry, or deploys a service.
An interrupted build leaves an incomplete directory; only an exit-zero run with
all SHA256SUMS entries present is a complete package.

Keep the package private. Do not publish it as a public download. Images contain
application code. Check free disk before exporting or transferring them.

## Operator transfer and verification

Use your existing authenticated SSH/SFTP channel to copy the complete directory
to the intended amd64 server. Verify the server's SSH host fingerprint through a
trusted source first. Never disable host-key checking to make transfer work.
No SSH password or private key needs to be shared with the agent.

On the server, inside the received directory:

```sh
sha256sum -c SHA256SUMS
docker image load --input vault-images.tar.gz
```

Stop if verification fails. Checksums detect corruption; authenticity comes from
the trusted transfer channel and trusted source of the checksum manifest.

Read the two exact `sha256:...` IDs in `manifest.json`. Inspect them with
`docker image inspect <IMAGE_ID>` and verify amd64/non-root configuration.
Use those IDs when creating the services, or explicitly tag those IDs locally.
The archive is exported by immutable ID; do not assume named tags are imported.
Do not accidentally pull a similarly named image from a public registry.

## Test-service setup

Use the operator's Coolify **existing Docker image** option only after confirming
the installed version supports these locally loaded images without a registry
pull. Otherwise use an isolated operator-run Docker test setup; agree its
private networking and HTTPS routing before starting it.

- App: copy `app.env.example` into the runtime settings, preserving already
  saved secrets. Fill verifier, D1 API token and SMTP password privately.
  Port 3000, no public host mapping; proxy only through the verified HTTPS host.
- Health: HTTP localhost port 3000, GET `/api/healthz`, expected 200.
  Interval 30s, timeout 5s, start period 30s, retries 3.
- Signer: separate `signer.env.example`, private port 9090, no public domain,
  persistent `/var/lib/personal-vault` owned by 10001:10001.
  Privately mount Core's cookie parent directory read-only with correct permissions.
- Drop unnecessary capabilities, prohibit privilege escalation/core dumps, and
  use bounded restart policies. Preserve operational volumes across restarts.
- Provide separately verified signet Core; synchronize it and verify chain
  identity before testing signing.
- The app requires outbound HTTPS to D1 and outbound TLS SMTP 465. Signer cloud
  replication, once enabled, uses outbound HTTPS only. Do not confuse private
  inbound isolation with blocking necessary outbound connections.
- Keep market data disabled; do not enable replica settings until Worker
  deployment and authentication have actually been verified.

## Non-destructive initial checks

From the workspace:

```sh
node scripts/vault-live-probe.mjs https://coin.scousgiftcardexchange.com
```

This performs three public unauthenticated GETs, with strict TLS and no redirects.
It reports no cookies or response bodies. It does not test a login key or prove
D1, SMTP, Core, replication, port isolation, or recovery.

From the app container's operator console, without putting credentials in commands:

```sh
node /app/dist/smtp-check.mjs --check-config
node /app/dist/smtp-check.mjs --verify
```

After explicit operator approval, `--send-test` sends one email; verify arrival
in the recipient's inbox. Never print the container environment as evidence.

Complete stages D–J in `docs/vault-completion-plan.md` in the source workspace.
Record sanitized timestamped PASS/FAIL/BLOCKED results and exact image IDs.
Fault tests require a separate supervised window and a verified recovery copy.
This package does not automatically start outage tests or alter server firewalls.

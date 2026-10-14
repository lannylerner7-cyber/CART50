# Add the missing private Bitcoin services

This is a **Signet test-coin setup**, not mainnet commissioning. The existing
website stays as a separate Coolify resource. No owner-key change, Cloudflare
migration, production wallet deletion or automatic deploy is part of this setup.

## Before deploying

- Confirm the server architecture is **linux/amd64** and there is sufficient free
  disk/RAM for Core, Coolify and the website. Pruning limits retained blocks, not
  all database/wallet/log storage. Do not fill the server's root disk.
- Have a backed-up **Signet-compatible cold wallet** whose recovery you control.
  Export a checksummed ranged public receive descriptor. It contains no private
  key but exposes wallet address linkage, so treat it as private configuration.
  Never export a seed, xprv or private descriptor to this server or chat.
- Verify a derived receiving address against that offline wallet before pinning
  the exact descriptor bytes with SHA-256. A descriptor checksum and SHA-256 pin
  detect different errors; do not substitute one for the other.
- Review the pinned Core 29.0 test baseline and upstream security releases before
  deployment. Its archive checksum is pinned from the official HTTPS manifest;
  this is not a claim that release signatures were independently verified.
- The new files must reach the repository first, following explicit release
  approval. Nothing in this document means that a push/deploy already happened.

## Coolify resource

For a disposable Signet test wallet only, `node scripts/build-signet-generator.mjs`
builds a self-contained offline HTML generator in
`generated-artifacts/signet-setup.html`. Download it, disconnect and open locally
on a computer. It generates a separate signer token, public ranged descriptor,
its SHA-256 fingerprint, and an **unencrypted private test-wallet backup** kept
only on the operator's device. Save that backup offline and never upload it to
Coolify. This is not a production cold-wallet setup. Enter the actual website
Docker network name; the generator cannot discover a remote server's network.
Only public deterministic test vectors were used to verify its descriptors with
Bitcoin Core; the operator must still verify their own recovery.

1. Add a **new Git-based Docker Compose application** using the existing repo.
   Base directory: repository root. Compose file:
   `/deploy/coolify-bitcoin.compose.yaml`.
2. Keep domains and host port mappings **empty for both services**. Do not select
   a generated public URL. Review Coolify's rendered compose before deployment:
   Core must remain off the website's shared network, and neither RPC 38332 nor
   signer 9090 may be published to the host.
3. Identify the existing Docker network used by the website. Set
   `COOLIFY_NETWORK` to its exact name; the stack requires an existing network
   rather than silently creating the wrong one. Only the signer joins it.
   Ensure there is exactly one `vault-engine` hostname on this network.
4. In the new resource's runtime variables, set:
   - `VAULT_ENGINE_TOKEN`: a newly generated random token of at least 32 characters,
     distinct from the owner key. Save it in Coolify's secret settings.
   - `COLD_DESCRIPTOR`: the verified public receive descriptor.
   - `COLD_DESCRIPTOR_SHA256`: SHA-256 of that exact string, without a trailing
     newline.
   - `COOLIFY_NETWORK`: the verified shared network name.
5. Review persistent storage. New named volumes initialize with UID/GID 10001.
   Core and signer must read the same cookie volume; the signer gets it read-only.
   Never delete volumes to troubleshoot. Never run two signers on the same
   journal or clone this stack against a live wallet volume.
6. Deploy only after these prerequisites are satisfied. Core's health check means
   its RPC answers, **not** that synchronization or wallet reconciliation is done.
   Signer requests require authentication; an unauthenticated `/status` 401 is
   expected and must not be treated as a reason to remove authentication.

## Connect the existing website afterward

Only after private networking is verified, set these runtime variables on the
**existing website** and redeploy it:

```text
VAULT_ENGINE_URL=http://vault-engine:9090
VAULT_ENGINE_TOKEN=<same private token as the signer>
```

Do not change `VAULT_OWNER_VERIFIER`, D1 settings or `PUBLIC_ORIGIN`. Do not put the
Core cookie, cold wallet seed or descriptor in frontend build variables.

## Acceptance checks on the host

- Confirm Core is on Signet, outside initial block download, and synced.
- Confirm the signer is authenticated, reconciled and reporting real wallets.
- Confirm wrong/missing signer tokens fail, and neither private port is exposed
  publicly. Inspect Coolify's final networking, not just the source compose.
- Confirm the main wallet address matches the offline cold wallet, and verify QR
  decoding before transferring **test coins only**.
- Exercise incoming pending/confirmed balances, spending and three-confirmation
  tracking, restart/outage recovery, and a separate restored-wallet rehearsal.
- Back up Core wallet material and the signer journal safely; backing up only the
  website/D1 metadata cannot recover private Bitcoin wallet keys.

Cold-vault keys are intentionally not held by this signer; spending from that
vault requires the owner's offline signing workflow. Market Worker deployment is
separate and still subject to the documented data-source permission requirement.
Actual key erasure remains blocked; five-day expiry does not remove that gate.

Reference checked: https://coolify.io/docs/applications/builds/docker-compose

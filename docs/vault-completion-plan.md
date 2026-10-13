# Remaining vault commissioning plan

## Rules and current position

This is a draft execution plan, not a completion certificate. No deployment,
outage simulation, GitHub push, secret change, or background job is started by
creating this document.

- **No GitHub push until the agreed commissioning gates below pass.**
- Signet only; no mainnet, real funds, destructive wallet erasure, or market feed.
- The owner remains the server operator. Do not request server credentials in chat.
- Preserve existing GitHub history, D1 data, signer state, and access paths.
- Install secrets only in the relevant runtime secret manager. Never in source,
  image layers, command arguments, build logs, this plan, or evidence files.
- Stop on unexpected behavior. A failing dependency must show disconnected,
  stale, unavailable, or blocked—not fabricated healthy data.
- Existing local checks passed: typechecks, 20 Node tests, Go race/vet,
  amd64 image builds, and offline container checks. Re-run only checks affected
  by subsequent changes.
- Last live public health observation: HTTP 503. GitHub SSH reads work; no
  source push has occurred. Live server and cloud commissioning remain incomplete.

## Dependency diagram

```text
                  NO-PUSH / SIGNET-ONLY GATE
                              |
               +--------------+---------------+
               |                              |
     A. Workspace preparation       B. Operator access preparation
     code, security, runbooks       encrypted administration, host
               |                              |
               +--------------+---------------+
                              |
                 C. Transfer images privately
                 WITHOUT GitHub or public registry
                              |
          +-------------------+---------------------+
          |                   |                     |
 D. App + HTTPS + D1    E. Private Core/signer   F. Cloudflare Worker
          |                   |                     |
 G. Login + SMTP              +----------+----------+
          |                              |
          |                    H. Live replication
          +-------------------+----------+
                              |
                 I. Outage and recovery exercises
                              |
                 J. Evidence and completion gate
                              |
              GitHub push only after gate passes
              Real-funds approval is NOT implied
```

## A. Workspace preparation — agent; may run in bounded parallel jobs

1. Check the code and configuration against this plan and
   `docs/github-readiness.md`. Keep a list of missing behavior, not just tests.
2. Resolve or explicitly assess the outstanding dependency findings:
   - Investigate the reported high-severity mockup dependency. Remove/replace
     unused tooling or apply a verified compatible fix; do not silently force
     an untested transitive major upgrade.
   - Verify the actual Go binary toolchain and run binary-aware vulnerability
     analysis. Do not dismiss advisories solely because module metadata differs.
   - Assess the CSS build dependency, base-image/OS packages, and mutable image
     tags. Record package versions, reachable exposure, and disposition.
   - No unexplained critical/high issue in a deployed path may pass the gate.
     Any retained finding needs evidence and explicit owner acceptance; absence
     of a patch is not evidence of safety.
3. Prepare repeatable commissioning probes for the stages below, with safe
   defaults, timeouts, sanitized output, and isolated disposable test data.
4. Validate the app/signer templates separately and confirm no runtime secret,
   wallet state, private key, or backup is tracked or included in build context.
5. After actual code changes, run the affected checks; run one consolidated
   verification pass when the coherent changes are complete.

**Evidence:** check results, package/image identifiers, sanitized issue assessment,
configuration inventory, and identified external blockers.

**Boundary:** local fixtures cannot establish live mail delivery, D1 access,
Core sync, private networking, or cloud replay.

## B. Secure server administration — operator; agent provides instructions

1. Confirm the host is amd64, has enough disk for signet plus recovery space,
   and has working time synchronization and restricted operator access.
2. Establish an authenticated SSH tunnel or valid HTTPS administration path.
   Verify SSH host identity through a trusted source.
3. Test that alternative access before restricting any existing admin route.
   Do not send Coolify credentials over public HTTP.
4. Confirm firewall policy: only intended web/admin access is reachable;
   Core RPC 38332 and signer 9090 are never public.
5. Record storage ownership, mounts, available disk, restart policy, and a
   rollback procedure that preserves state and monotonic replication sequence.

**Pass:** the operator demonstrates encrypted administration and sanitized
network configuration without sharing credentials.

## C. Test deployment without a GitHub push — operator-assisted

This removes the ordering conflict: live checks need a server, but source
publication is paused until those checks pass.

1. Build the reviewed amd64 app and signer images after stage A changes.
2. Record immutable image IDs, source commit, and SHA-256 checksums.
3. Export images to a dedicated ignored output directory, with no runtime
   credentials or data embedded. Treat exported images as private source assets.
4. Transfer through the operator's authenticated encrypted channel to the
   intended server; verify checksums and load images there.
5. Verify the installed Coolify version can use locally available images
   without pulling from a public registry. If not, use an operator-run private
   Docker test deployment; agree on routing before issuing deployment commands.
   Do not silently switch to GitHub or a public registry.
6. Install runtime variables through the operator's secret manager. Use separate
   app and signer settings. Persist signer state; never overlap signer instances.

**Pass:** server starts the exact reviewed images with safe mounts and no
unintended public ports. Transfer must not copy the owner's login key.

## D. App, D1 and HTTPS — requires B and C

1. Resolve DNS Read permissions through the existing Cloudflare connection,
   without asking for keys in chat or creating a replacement account.
2. Verify DNS, certificate validity, hostname, and origin routing. If proxied
   by Cloudflare, use Full (strict); never disable TLS checks.
3. Configure app port **3000**, with no host port mapping. Health:
   HTTP `GET /api/healthz`, localhost port 3000, expected 200;
   interval 30s, timeout 5s, start period 30s, retries 3.
4. Verify production startup authenticates to the intended D1 database and
   schema. Confirm no SQLite fallback. Do not replace an existing database.
5. Test authenticated test-setting persistence across an app restart, preserving
   and restoring the prior value. Verify public/unknown API route behavior.
6. Install only the offline-generated owner verifier. Keep the owner key offline
   until valid public HTTPS has been independently verified.

**Pass:** correct public HTTPS, expected liveness response, actual D1 access,
safe owner setup, and persistence after restart.

**Caution:** `/api/healthz` alone is not D1, Core, mail, or recovery readiness.

## E. Private signet Core and signer — requires B and C

1. Provision a verified Bitcoin Core release in signet mode with persistent
   storage. Document version provenance and the operator's pruning/storage choice.
2. Isolate Core RPC and signer from public proxy networks. The app may reach
   the signer only through the intended private network.
3. Mount Core's RPC-cookie **parent directory** read-only so cookie rotation
   remains visible. Verify permissions without making the cookie world-readable.
4. Set the independent engine token; verify missing/wrong tokens fail.
   Verify the public cold descriptor and its fingerprint offline; no cold seed
   belongs in the signer or app.
5. Run exactly one signer. Confirm signet chain identity, synchronization,
   reconciliation state, and restart persistence.
6. Confirm unavailable Core blocks unsafe operations, and restored connectivity
   requires successful reconciliation before normal operation.
7. Any transaction test uses signet coins and an operator-approved destination
   and amount. Never substitute a mainnet test.

**Pass:** actual synced signet Core, authenticated private signer, persistent
state, safe disconnection behavior, and no externally reachable RPC/signer ports.

## F. Cloudflare services and Worker — can progress alongside D/E

1. Read back the existing dedicated D1, private R2 bucket, primary Queue, and
   DLQ. Check permissions, intended account, schema, and binding identities.
2. Resolve Worker deployment through an approved authenticated path.
   The previously observed upload HTML challenge is distinct from DNS's JSON
   permission denial; do not repeatedly rotate a token as a guessed fix.
3. If connector upload remains blocked, use the operator's authenticated
   Cloudflare dashboard or authorized Wrangler session.
4. Deploy the Worker, install the independent replication secret, and verify
   its actual D1/R2/producer/consumer/DLQ bindings by readback and test exercise.
5. Confirm R2 is not public; write/read/delete only a dedicated disposable
   encrypted test object without touching existing backups.
6. Verify absent/wrong replica tokens fail and credentials are not logged.
7. Keep `MARKET_ENABLED=false`. If market data is later requested, separately
   establish applicable Kraken terms and permissions for display, caching and
   redistribution. Public API access is not permission to redistribute.

**Pass:** real deployed Worker and exercised bindings, private storage, correct
authentication, and market endpoint disabled.

## G. Owner access, proxy controls and email — requires D

1. Verify the actual proxy chain and direct-container isolation before setting
   exact `TRUSTED_PROXY_IPS`. Test spoofed forwarding headers are not trusted.
2. The operator tests the real owner key locally over HTTPS; no key is supplied
   to the agent or captured in screenshots, logs, or test evidence.
3. From an operator-approved test IP, send three invalid login attempts.
   Verify the one-hour server-enforced block, countdown/Retry-After behavior,
   restart persistence, and retry eligibility after the real hour expires.
   Do not shorten the production cooldown or bypass it for a green result.
4. Test the global rate limit with controlled test traffic as well as per-IP
   enforcement. A VPN user's hidden original IP cannot reliably be recovered.
5. Verify session cookies, origin/CSRF rejection, logout and revocation.
   Protect the owner's current access while testing; keep a recovery route.
6. Run SMTP configuration and authenticated connectivity checks, then send
   one explicit test email and one controlled invalid-key alert.
   Confirm delivery in the actual recipient inbox, not just SMTP acceptance.
7. Simulate mail-provider failure only for the test service. Confirm login
   remains responsive, queued alerts retry within their defined bounds, and
   mail never includes keys, tokens, cookies, or wallet data.

**Pass:** real key works, defined rate limits hold, spoofed headers fail,
sessions revoke, and security mail arrives with safe contents.

## H. Bounded live health replication — requires E and F

1. Enable HTTPS replica URL and independent token only after Worker verification.
2. Verify outbound payload contains only the documented health whitelist:
   network, last reconciled block count, fixed recovery status, last sync time.
   No wallets, addresses, balances, transactions, keys, or RPC cookies.
3. Observe the real producer, Queue consumer and D1 sequence acknowledgement.
   Queue acceptance alone must not clear the local pending journal.
4. Check duplicate/out-of-order snapshots cannot decrease stored sequence.
5. Confirm at most the oldest unacknowledged plus newest coalesced snapshot
   are retained locally; this is not an event audit log.

**Pass:** real cloud acknowledgement, correct monotonic sequence and bounded,
privacy-preserving sender behavior.

## I. Controlled outage and recovery — requires D–H

Before each exercise: operator approval, signet-only state, paused spending,
one signer, a validated encrypted recovery copy, recovery access, and a bounded
test window. Never disable shared accounts, delete production resources, or
interrupt unrelated workloads.

| Exercise | Required result |
|---|---|
| Stop app, restart same image | Session/rate-limit metadata persists; no owner reinitialization |
| Interrupt test Core RPC | Signer reports unavailable and blocks unsafe actions; reconciles on return |
| Deny test app access to D1 | Explicit failure, no SQLite fallback or false successful persistence |
| Deny signer access to Worker | Local operations remain responsive; pending journal stays bounded |
| Restart signer during replica outage | Pending snapshots and sequence survive; no overlapping signer |
| Restore replica connectivity | Consumer persists state; D1 acknowledgement advances; replay completes |
| Consumer failure / poison test message | Document retry/DLQ behavior; no false durable acknowledgement |
| Replay stale/duplicate snapshot | D1 high-water mark never decreases |
| Restore older journal in isolated copy | Rollback detected; no bypass by lowering cloud sequence |
| SMTP outage then restoration | Bounded alert retry; no secrets in messages; delivery behavior documented |
| Restore encrypted backup in isolated location | Contents validate and recovery succeeds without overwriting the original |

Never attach a recovered signer to the live state/network while the original
signer is active. Recovery cannot claim destroyed temporary keys are recoverable.
Destructive wallet erasure remains blocked pending its separate proof.

**Pass:** evidence for each exercise plus restored normal test service health.
The broader real-funds recovery/security approval remains separate.

## J. Evidence, completion and GitHub gate

Record for each check: timestamp, tested source/image, environment, expected
result, observed result, sanitized evidence, and PASS/FAIL/BLOCKED.

- All required commissioning stages pass; no known critical failure is hidden
  behind a green liveness probe.
- Any retained security issue has an explicit disposition and owner acceptance.
- Actual configuration matches the documented app/signer/cloud boundaries.
- No real funds, mainnet, unauthorized market redistribution, or destructive
  wallet erasure is enabled.
- Git history/source has a fresh sensitive-content check if files changed.
  Confirm repository privacy and preserve existing remote changes.
- Only then push the complete source to CART50 and verify the remote commit.
  Do not force-push. Secrets, images, backups, and runtime volumes remain excluded.
- Report which gates passed and which separate real-funds restrictions remain.
  Do not describe a code push as production commissioning or fund-safety approval.

## Background execution schedule

These are proposed jobs, not jobs currently running.

| Lane | Can run here? | Proposed work | Stop condition |
|---|---|---|---|
| Workspace checks | Yes, bounded shell jobs | Affected type/tests, builds, dependency/image analysis | Exit with captured result; fix before rerun |
| Cloud readback | Yes, approved connection | Resource/binding/permission readback | Permission failure becomes a blocker, not a retry loop |
| Core sync | On operator server | Signet sync with disk/progress monitoring | Report stalled sync/disk pressure; no unsafe recovery |
| Replica delivery | On signer + Worker | Runtime retry and Queue consumer | Bounded retries/state; visible stale/blocked status |
| Security mail | On app server | Existing bounded outbox retry | Report provider failure; never infinite mail generation |
| Cooldown proof | On test deployment | One scheduled retry check after one hour | Record result once; no repeated login spam |
| Fault/recovery tests | Controlled test deployment only | Stage I, serially | Stop immediately on unsafe state; restore access |

Parallelize only independent work: A with B; D/E/F after their prerequisites.
Run destructive-looking fault exercises serially and never leave an induced
outage running unattended. Each launched background command must have a known
job ID, timeout/termination plan, sanitized log path, and reported exit result.
There is no promise of unattended progress after an operator-dependent blocker.

## First execution batch

1. Prepare missing probes and reassess security findings in the workspace.
2. Read back current Cloudflare resource/binding state through approved access.
3. Prepare the private image-transfer/operator instructions, without uploading
   images or changing server state yet.
4. Present the exact server-side actions and fault-test boundaries to the owner.
5. Begin live commissioning only when the operator test deployment is ready.

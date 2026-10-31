# Independent developer wallet acceptance — 2026-10-31

## Scope and provenance

Disposable loopback service, independent metadata/ledger SQLite files and fixture
credentials only. No owner credentials, hosted storage, Core RPC, real signing,
Signet restart, deployment or real transfer. Account passkey markers are fixture
data, not a new WebAuthn certification.

Browser navigation used the actual 127.0.0.1:4401 origin. Before entering a token,
the tester checked enabled session state and the matching non-secret per-run
fingerprint on fixture responses. No preview proxy bridge was needed.
The existing application still intentionally does not mount this service.

## Completed browser evidence

| Assertion | Result and limits |
|---|---|
| Explicit approval | Button disabled without acknowledgement; one 10,000-sat withdrawal plus 500-sat cap reserved exactly 10,500 from 100,000. |
| Review expiry | Only a new unapproved review's disposable DB expiry was forced into the past. Refresh removed its checkbox/approval button; balance unchanged. |
| Receipt contents | Inline receipt and actual nonempty downloaded text contained the same withdrawal identity, amount, total, status and txid. |
| Print action | Actual popup receipt contents checked and print called once using a browser stub. No physical printing or native dialog certification. |
| Responsive bounds | Document/body widths stayed within 390/768/1280 viewports. Wide data tables retain intentional horizontal scrolling inside their containers. |
| Post-commit approval response loss | Fixture committed approval, recorded status 200, then truncated its body. UI reported an uncertain result and retained original request inputs/key. |
| Changed-input blocking | Attempting approval of a different review while the first was unresolved was blocked locally; no alternate approval reached the server. |
| Same-key recovery | Exactly two original approval entries used the same idempotency key; only one reservation existed. |
| Unknown/broadcast identity | Persisted synthetic txid remained unchanged across these observations. |
| Confirmation/fee reconciliation | With actual fee 300 against cap 500, final balance was 89,700 available / zero reserved; alternate review was never approved. |
| Two developer contexts | B saw its own customer and no A wallets/withdrawals. Query/header tenant overrides stayed B-scoped; review of A's wallet returned 404. |
| Admin-only oversight | Assigned-A records and control form visible; spending/approval controls absent. Admin review POST returned 403. |
| Credential expiry/cache clearing | Only A's disposable wallet-key expiry was changed. Refresh returned 401 and cleared protected rows/token state without reload; B stayed authorized. This is bearer-profile expiry, not a new WebAuthn session-cookie test. |

The first receipt/expiry run preceded financial-fence implementation. The
post-commit approval-loss run used a fresh fixture with the current financial
credential fence enabled. The frontend source did not change between those runs.
Earlier browser interception attempts did not prove server completion and are
not included as passes; the fixture-side loss test supersedes that blocker.

## Completion and limits

The scoped foundation browser gate now has completed reports for each listed
assertion. One auxiliary case-sensitive role-label selector returned false; the
rendered admin role, absence of spending controls and explicit API denial were
independently verified. This was a selector mismatch, not counted as a passing
selector assertion or an unexamined authorization failure.

The tester closed the browser contexts and removed its copied receipt download.
Both disposable fixture processes were stopped and their temporary metadata,
ledger, credentials and fault-evidence directories removed. Git diff checking
passed. The ordinary API built/restarted cleanly; no GitHub push or deployment
was performed.

## Backend evidence

20 tests passed using:

```sh
pnpm --filter @workspace/api-server exec tsx --test src/developers/*.test.ts src/wallet-foundation/*.test.ts
```

API typecheck passed. Newly added evidence:

- Stale resolved principal cannot approve, replay or read after an independent
  process invalidates its ledger credential epoch.
- Interrupted changes stay disabled; stale activation cannot supersede a newer
  epoch. Financial scopes and independent emergency control are enforced.
- Exhausted ordinary shared-IP ingress does not block verified admin ingress;
  forged admin/forwarded headers do not gain priority.
- Online WAL snapshot restores exact synthetic artifact/txid, reservation and
  idempotency result. Old writer is fenced before restored writes.
- Old outbox lease acknowledgement fails after replacement; unknown funds cannot
  be prematurely released; fee-cap refund and immutable balanced postings survive.
- Restored credential grants are invalidated before exposing a restored service.

## Still not commissioned

Real observer/signer adapters and signer-side epoch checks, real signed-artifact
recovery, automatic fair multi-tenant webhook delivery, replay-safe HTTPS
receiver acceptance, shared D1 budgets, general metadata-suspension coordination,
full identity/secret restore and hosted failover. Dedicated transactional storage
and its reversible migration need separate decisions and authorization.

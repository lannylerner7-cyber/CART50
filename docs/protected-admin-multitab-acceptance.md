# Owner admin two-tab acceptance

Verified on 2026-11-07 against the built `artifacts/bitcoin-vault/src/pages/admin.tsx`
in the loopback-only disposable HTTPS fixture. No application changes were
needed. No hosted data, real owner credentials, signer, node, or custody was used.

## Boundary and authentication

Before login, the browser URL and API response origin were confirmed as
`https://localhost:4443`. Both fixture endpoints returned HTTP 200 and the same
per-run `X-Developer-Fixture` fingerprint; the admin endpoint reported disposable
mode. Two pages shared one browser context and cookie jar. Passkeys were enrolled
through Settings and step-up used real CTAP2 resident-key, user-verified WebAuthn,
not mocked verification responses. Each browser target had its own UI-enrolled
virtual authenticator.

## Results

| Check | UI and network evidence | Data outcome |
| --- | --- | --- |
| Session/CSRF rotation | A's passkey verification returned 200 and changed the cookie. B's cached CSRF differed from A's current token. B's prepared Freeze returned 403 with “Administrator confirmation required or expired. Confirm again, then retry.” Reason and dialog survived. | Approval account stayed active at 10,000 simulated sats with no audit entry. Real passkey recovery plus explicit retry returned 200, froze it, and added one entry. |
| Concurrent suspension/revocation | A's Revoke and B's Suspend targeted the same Suspension account concurrently through the UI; both returned 200. UI showed suspended, key none, and four merged security audit entries. | Sessions fell from one to zero, merchant API key was removed, balance remained 10,000, and no credentials were restored. Exactly two successful action requests were recorded. |
| Stale revocation | A stale Revoke against the separate Revocation account returned 403 and preserved its reason. | Account remained active at 10,000 with one session, its merchant key, and no audit entry. |
| Adjustment reconciliation across tabs | A's +250 committed but the fixture truncated the response. UI showed “Failed to fetch” and retained amount, reason, and request identity. B refreshed to 10,250, then applied a distinct +100 (200). A's unchanged retry returned 200 using its original request ID. | Attempts were 250/100/250; first and third identities matched and B's differed. Final balance was 10,350, with exactly two adjustment audit entries. Both refreshed tabs displayed 10,350. |
| Logout in another tab | B prepared a Freeze on Rejection. A logged out (200); the cross-tab lock event moved both pages to the unlock screen and removed B's dialog and submit control. No subsequent admin POST or automatic replay occurred. | Rejection remained active at 10,000 with one session, its merchant key, and no audit entry. |

Logout was verified through the actual locked-UI prevention path, not a forced
POST after logout. The test does not claim to cover a request already in flight
when logout occurs, disabled cross-tab storage, or two independent browser
profiles.

Developer sign-in keys are distinct from merchant API keys: the stored sign-in
key remains after suspension/revocation. Suspension blocks authentication through
account status. Emergency action audits are stored separately and merged into
the admin response, so the direct fixture merchant audit array alone is not
sufficient evidence.

## Evidence and repeatability

Use the setup in `docs/protected-admin-acceptance.md`, with
`VAULT_UI_FIXTURE_ADMIN=1`, and the owner route
`/mainvaultwallet/personal/admin/admin`, not the platform login shortcut `/admin`.
The fixture's `loseAdjustmentResponse` control supplies deterministic post-commit
response loss. Inspect request identity equality privately; do not publish
session cookies, CSRF tokens, or credentials.

Browser screenshot references from this run:

- `nlbeex`: fixture provenance.
- `qmjeoh`, `ic8993`: real UI passkey enrollment.
- `ug51tr`, `9nlozf`: stale rejection and explicit recovered retry.
- `ur29iu`, `sa3496`: suspension result and separate stale revocation denial.
- `i2o3rz`, `44l19r`: lost response and final 10,350 balance with two audit entries.
- `ggeljo`, `juhni4`: both tabs locked after logout.

These are session evidence references, not committed image files. Expected
node/signing-engine-unavailable responses occurred because the fixture has no
custody transport. A test-tool accessibility snapshot briefly exposed the
disposable owner input internally; the value is omitted from this report.
After testing, the fixture listener was confirmed stopped and its temporary
credential/database directory was confirmed removed.

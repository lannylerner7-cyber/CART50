# Protected admin browser acceptance

Verified the built `admin.tsx` UI against the loopback-only disposable HTTPS
runtime on 2026-11-07. No hosted data, real credentials, or funds were used.
The browser origin and per-run response fingerprint were checked before login.
Owner login used the generated fixture credential and Settings enrolled a
CTAP2 virtual resident-key authenticator with user verification. Step-up used
real WebAuthn verification, not a mocked successful response.

## Results

| Scenario | Observed result |
| --- | --- |
| Step-up | Writes disabled before confirmation; real passkey confirmation enabled them. |
| Reasons | Empty and short reasons kept Confirm disabled. |
| Typed confirmation | Missing/wrong email blocked suspension; exact email enabled it. |
| Applications | Separate pending accounts became approved and rejected through their dialogs; Live remained disabled. |
| Suspension | UI status became suspended, sessions cleared, merchant API key removed; expanded UI audit showed requested/applied entries and reason. |
| Revocation | Sessions cleared and merchant API key removed; account remained active; merged audit contained requested/applied entries. |
| Adjustment validation | Noninteger blocked; positive `250` accepted. Literal `+250` is not accepted by the existing input pattern. |
| Lost response and retry | Fixture truncated a successful response after commit. Error and inputs remained visible. Unchanged retry reused the request ID; balance went from 10,000 to 10,250 once, with one adjustment audit entry. |
| Server expiry | Expired step-up produced actual HTTP 403, preserved dialog and reason, and exposed Passkey recovery. Real re-confirmation and retry succeeded. |
| Client expiry | Advancing browser time 301 seconds disabled Confirm while the server session remained authenticated. |

Developer sign-in keys are distinct from merchant API keys. Suspension blocks
developer authentication through account status; suspension/revocation remove
merchant keys and sessions, not the stored developer sign-in key. Security
audit entries live separately and are merged into the admin API; inspecting
only merchant audit arrays would incorrectly report missing security history.

## Repeat setup

```sh
PORT=5173 BASE_PATH=/ NODE_ENV=production pnpm --filter @workspace/bitcoin-vault build
VAULT_UI_FIXTURE=1 VAULT_UI_FIXTURE_HTTPS=1 VAULT_UI_FIXTURE_ADMIN=1 \
  pnpm --filter @workspace/scripts exec tsx developer-ui-fixture.mts
```

The fixture discards inherited environment credentials, generates its own owner
credential and temporary database, and binds only to loopback. It does not
connect to a Bitcoin signer or node. Use a browser that accepts its self-signed
certificate at `https://localhost:4443`. Verify `/__admin-fixture` and the
`X-Developer-Fixture` header before authentication. Read only the disposable
credential file identified by `/__developer-fixture`; never print it.

Use `/mainvaultwallet/personal/admin/admin` for the owner-passkey console.
The separate `/admin` shortcut now leads to platform email/password sign-in,
not the owner console. To additionally test that separate principal, set
`VAULT_UI_ADMIN_FIXTURE=1` when starting the fixture; it generates disposable
platform credentials in `disposable-admin.json` in the fixture directory.

### Post-merge session-boundary check

A narrow follow-up against the rebuilt merged app verified the restored owner
route, real passkey enrollment/step-up, and an owner write returning HTTP 200.
Client-side navigation (without reloading the document) to the platform login
then verified a platform write and logout both returned HTTP 200. The outgoing
CSRF header matched the platform session rather than the retained owner token.
Returning to the owner route still returned authenticated admin data. This
confirms the explicit-header precedence fix in `customFetch`. The full matrix
above was not repeated; the follow-up covered only the merge-related route and
session changes. Sanitized details are in `merge-check.md` in the ignored run
evidence directory.

Admin mode seeds five dedicated accounts. Its local control endpoint accepts
`expireStepUp` and `loseAdjustmentResponse` flags. The latter truncates the next
successful adjustment response after commit; private `admin-evidence.jsonl`
and `lost-response.json` files in the fixture directory record the request IDs.
These controls are in the standalone script, not production routes.

Sanitized detailed run evidence and a suspension reproduction script were saved
under ignored `generated-artifacts/admin-acceptance/`. Browser screenshot
references include `k4b11d` (security audit), `tyre8f` (lost response), `gw0fa1`
(retry balance), `uqinbs` (403 recovery), and `a6qx6l` (local expiry). Image bytes
were not exportable from the browser tool; these are attached session evidence,
not committed screenshots. Stop the fixture after testing to remove its
temporary credential and database.

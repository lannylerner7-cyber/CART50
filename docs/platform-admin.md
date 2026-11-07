# Platform administrator access

Route: `/mainvaultwallet/vault-admin/admin`.

This console manages developer accounts. It is not an alternate login for personal
vault custody. Personal authentication and signing are unchanged.

## Runtime configuration

- `PLATFORM_ADMIN_EMAIL`: administrator login email.
- `PLATFORM_ADMIN_PASSWORD`: unique secret of 12–256 characters, entered through
  the hosting provider's secret settings. Never commit it or place it in frontend
  variables. Passwords previously posted in chat should not be reused.
- `PUBLIC_ORIGIN`: exact website origin, already used for same-origin write checks.

Replit settings do not update Coolify. Configure these runtime values on the
website application in Coolify and deploy/restart that application when authorized.
Do not restart Bitcoin Core or Signet. This work does not authorize deployment.

## Security behavior

The API uses a separate Secure, HttpOnly, SameSite=Strict host cookie. Platform
sessions cannot satisfy personal-owner authentication. Password comparisons use
salted scrypt derivation and constant-time comparison. Passwords are not returned,
logged, persisted in the database, or included in the build.

Sessions last 30 minutes. Sensitive admin writes require confirmation within five
minutes, plus CSRF, exact-origin checks and existing reasons/idempotency policies.
Re-entering credentials rotates the session. Logout revokes it server-side.
Changing either configured credential invalidates existing platform sessions.

Existing owner-authorized administrative API access is retained for compatibility;
the canonical dashboard uses the independent platform session. Administrative
audit entries identify platform-admin versus owner actors.

## Deployment limits

Sessions and login throttles are bounded and process-local. A restart logs
administrators out. Multiple replicas require a separately designed shared
session/revocation store and distributed login budget; this implementation does
not claim multi-instance readiness. Limits are five attempts per socket IP and
30 global attempts per minute per process. Client forwarding headers cannot
override that identity; a proxy can therefore share its budget across clients.

This is a single-administrator password login, not staff RBAC or MFA. Live
custody remains disabled and must not be enabled on the basis of this login.

## Local verification

`src/platform-admin/auth.test.ts` exercises denial without authentication,
cross-origin rejection, bad credentials, cookie attributes, owner isolation,
CSRF enforcement, logout, expiry, configuration rotation and throttling.
The existing checkout/admin regression suite checks retained owner behavior.

For browser acceptance use `scripts/developer-ui-fixture.mts` with
`VAULT_UI_FIXTURE=1 VAULT_UI_ADMIN_FIXTURE=1`. It removes real admin environment
values and generates disposable credentials in its temporary data directory.
Never snapshot a populated credential input. Stop and delete the fixture afterward.

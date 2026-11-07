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

## Verify the deployed route before sharing a login link

The intended live URL is
`https://mainvaultwallet.com/mainvaultwallet/vault-admin/admin`.
Changing DNS or adding a different URL does not install the admin feature.
Both the frontend and API must come from the current website build.

The read-only check on 2026-11-07 found the live frontend did not contain the
platform-admin route and `GET /api/platform-admin/session` returned
`404 {"error":"API route not found"}`. The HTML route returned HTTP 200 but
rendered the application's "Page not found" screen. `/api/healthz` returned 200:
that establishes process liveness only, not feature availability.

Website-only deployment checklist, subject to the operator's authorization:

1. Ensure the website's Git source or image actually contains the current
   platform-admin frontend and API. Restarting an old image is insufficient.
   For a source build, use the root `Dockerfile`, root build context and
   the existing website port 3000. Preserve the current network, database,
   engine, mounts, SMTP and other runtime configuration.
2. Set the website's runtime `PUBLIC_ORIGIN` to
   `https://mainvaultwallet.com` (no trailing slash). Set
   `PLATFORM_ADMIN_EMAIL` to the intended administrator address and enter a
   unique 12–256-character `PLATFORM_ADMIN_PASSWORD` in Coolify's secret field.
   Never paste the password into chat, commit it, or set it as a `VITE_` build
   variable. A Replit secret does not configure this separate Coolify service.
3. Rebuild/redeploy only the website application when authorized. Do not
   redeploy the Bitcoin Core, signer or Signet services for this login issue.
   Existing process-local administrator sessions are invalidated by restart.
4. Verify `GET /api/platform-admin/session` returns HTTP 200 JSON with
   `authenticated:false` and `configured:true` without signing in.
   A 404 means the API is still old/misrouted. `configured:false` means the
   serving process does not see a usable admin password. HTML at this endpoint
   means frontend/API routing is wrong. A Cloudflare error is a separate
   edge-access issue; do not disable protections to hide an application issue.
5. Open the intended URL in a browser: it must show **Administrator sign-in**,
   not merely return HTTP 200. Verify the session API request uses the same
   origin, then sign in through the UI. The dashboard's developer-management
   requests must succeed; the personal vault must remain locked.

Do not claim that the operator's password works from an isolated fixture test.
Do not claim the live path works from a successful workspace preview.

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

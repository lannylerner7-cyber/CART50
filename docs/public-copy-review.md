# User-facing copy review — 2026-10-31

## Changes

- API base help now explains the public MainVaultWallet API host, `VAULT_API_BASE`
  on the developer's hosting, and why merchant checkout/return/webhook URLs are
  different from the API host. The displayed address still comes from the current
  origin; no production URL or routing was changed.
- Removed Coolify-specific guidance from the console and generated starter README.
  Webhook help distinguishes an existing-domain path from an optional subdomain:
  only the latter needs a separate DNS record.
- Simplified homepage capability copy, CTA and footer. Kept one clear Sandbox /
  unavailable-Live disclosure rather than repeating it throughout marketing copy.
- Replaced internal rollout language in developer Live/application screens and
  proposed-fee notes in the independent wallet preview. Preview limitations remain
  explicit; no activation, billing or delivery capability was added.
- Simplified personal-vault unavailable/setup copy and market/Sandbox response
  messages. Draft legal notices, unavailable balances, approval requirements,
  simulation labels and signature-verification guidance remain visible.

## Evidence and limits

- Route/copy search covered the frontend page tree and shared components, including
  owner, admin, Sandbox, developer onboarding, checkout and wallet preview source.
  This is a source review, not a claim of authenticated browser visits to every route.
- Frontend and backend typechecks, frontend production build and diff whitespace
  check passed. Managed frontend/backend workflows restarted and served normally.
- Disposable HTTPS/SQLite browser evidence: homepage at 390/1280px; resources
  terms/documentation/integration/contact; application and draft-terms dialog;
  disposable verification/passkey/provisioning; checkout API-base and webhook help;
  locked Live screen.
- Sandbox initially required the disposable login-key step. After that step,
  home/wallet/send/activity/status were visited at 390/768px with no document
  horizontal overflow. No payment was submitted or simulated and no checkout API
  key was issued. No credential screenshots were taken.
- Send's apparently populated screenshot fields were placeholders: source binds
  the destination placeholder to the assigned identifier and amount placeholder
  to `25.00`; browser accessibility reported empty values and disabled controls.
- Owner/admin/independent wallet-preview routes received source-copy review only.
  The fixture backend used its pre-change Sandbox message; the revised backend
  message is source/typecheck evidence, not browser-verified wording.
- Replit preview mobile screenshot of resources/contact rendered without visible
  layout errors or browser errors.
- Disposable browser contexts closed; fixture process stopped and its temporary
  credentials, certificates and database deleted.

No hosted configuration, custody, network selection, terms approval, fees,
payment logic or authorization changed. No GitHub push or deployment performed.

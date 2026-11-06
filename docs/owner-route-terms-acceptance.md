# Personal route and terms acceptance — 2026-11-06

- Personal vault prefix: `/mainvaultwallet/personal/admin`. Authentication,
  storage, signer, wallet network and WebAuthn RP domain are unchanged.
- Browser preview: locked personal login passed; legacy concatenated 1–250
  URL redirected to the new prefix; root remained developer homepage.
- Terms at 390×844: checkbox disabled before scrolling, enabled at bottom;
  label and checkbox toggled acceptance; Continue reached empty registration.
- Terms at 1280×900: entire text fit; checkbox available without unnecessary
  scrolling. Footer visible at both sizes.
- Fixed an initial-layout measurement race found by the first browser pass;
  focused follow-up passed. Signup approval gates remain unchanged.
- Favicon: HTTP 200 SVG with the main_vault bracket mark, not the previous
  orange placeholder. Versioned favicon URL avoids the old cache entry.
- Frontend typecheck and production build passed. No credentials entered,
  registrations submitted, transfers made, or hosted deployments performed.
- This is preview evidence, not hosted acceptance. Production needs the updated
  frontend deployed; existing passkey and custody flows were not broadly retested.

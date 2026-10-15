---
name: Hosting scope
description: User clarification of the role of AWS and Coolify.
---
Use AWS only as the Linux server hosting Coolify for this project, not as an application integration with additional AWS managed services.

**Why:** The user explicitly corrected the hosting interpretation.

**How to apply:** Package the application for Coolify on that server; do not request AWS API credentials or add managed AWS services merely to deploy the vault.

Use `coolify.scousgiftcardexchange.com` as the dedicated HTTPS management hostname;
keep `coin.scousgiftcardexchange.com` for the vault.

**Why:** The owner selected the separate Coolify hostname for secure management.

**How to apply:** Configure and verify DNS/TLS before installing new production
credentials. Hostname selection alone does not mean it is configured or reachable.

Use the HTTPS management hostname for browser terminals, not the raw-IP HTTP
dashboard. Keep the validated SSH/server address separate from the dashboard DNS.

**Why:** The owner demonstrated a working server terminal through the HTTPS
dashboard after repeated raw-IP browser terminal failures. The precise transport
failure was not established; do not attribute it solely to a firewall rule.

**How to apply:** Do not replace a working server SSH target with the proxied
dashboard hostname or reopen ports just to restore the obsolete HTTP access path.

Use a separate encrypted wallet-data volume for mainnet; retain the existing
root disk rather than replacing it with an encrypted root copy.

**Why:** The owner explicitly chose the separate-volume option.

**How to apply:** Verify encryption, attachment and persistent mounting before
creating mainnet wallets. Explicitly bind wallet data and signer state to this
storage; default Docker named volumes on the unencrypted root are not sufficient.

The user wants the project pushed to GitHub before Coolify hosting, and wants
deployment variables managed in Coolify for this personal project.

**Why:** The user explicitly stated this deployment order and configuration goal.

**How to apply:** Keep source publication separate from runtime secret installation.

The owner authorizes pushing the source to GitHub before live commissioning so
they can perform the deployment manually.

**Why:** After initially withholding permission until completion, the owner
explicitly changed the order and requested a push for manual deployment.

**How to apply:** Push source and operator instructions only, excluding secrets
and operational data. Source delivery is not live commissioning or real-funds
approval; keep remaining checks explicitly incomplete.

Do not assume a deploy key generated outside the workspace survives into a later
task environment.

**Why:** The previously working deploy key under the runner's home SSH directory
was absent on a later push attempt, although the repository and known-hosts file
remained. GitHub's public key alone cannot authenticate a push.

**How to apply:** Check private-key existence without reading its contents before
promising SSH access. Use secure credential storage or a restricted, ignored
workspace location; never commit a private key or claim it is recoverable from
its public half.

The user explicitly chose to keep Cloudflare storage and manage app/signer
runtime variables in Coolify. Do not migrate the database or publish wallet data.

**Why:** The user confirmed the existing storage arrangement rather than migration.

Do not treat a reported active GitHub connection as proof that repository access
works in the workspace.

**Why:** Connection status reported healthy while CLI authentication was unavailable
and the connection/reconnection forms could not be opened.

**How to apply:** Verify remote access and repository visibility before publishing;
if the managed connection flow fails, ask the owner to connect through the Git pane
rather than requesting a token in chat.

Successful HTTPS reads do not establish GitHub write access.

**Why:** HTTPS `ls-remote` and fetch succeeded, but the subsequent push failed with
an invalid-credential response despite the managed connection reporting active.
Public repository reads may succeed without authentication.

**How to apply:** Do not describe fetch success as verified authentication or
write permission. Follow the connection reauthorization flow after push rejection.

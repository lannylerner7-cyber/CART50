---
name: Hosting scope
description: User clarification of the role of AWS and Coolify.
---
Use AWS only as the Linux server hosting Coolify for this project, not as an application integration with additional AWS managed services.

**Why:** The user explicitly corrected the hosting interpretation.

**How to apply:** Package the application for Coolify on that server; do not request AWS API credentials or add managed AWS services merely to deploy the vault.

The user wants the project pushed to GitHub before Coolify hosting, and wants
deployment variables managed in Coolify for this personal project.

**Why:** The user explicitly stated this deployment order and configuration goal.

**How to apply:** Keep source publication separate from runtime secret installation.

Do not push this vault to GitHub while the agreed plan remains incomplete.

**Why:** The user stopped the proposed push after learning that live commissioning
checks were still outstanding.

**How to apply:** Passing local tests is not permission to push an incomplete
deployment. Resolve the live-verification prerequisite with the owner rather than
silently relaxing this gate or claiming that local tests complete the plan.

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

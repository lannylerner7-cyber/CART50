---
name: Hosting scope
description: User clarification of the role of AWS and Coolify.
---
Use AWS only as the Linux server hosting Coolify for this project, not as an application integration with additional AWS managed services.

**Why:** The user explicitly corrected the hosting interpretation.

**How to apply:** Package the application for Coolify on that server; do not request AWS API credentials or add managed AWS services merely to deploy the vault.

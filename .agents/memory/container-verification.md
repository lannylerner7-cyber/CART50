---
name: Container verification constraints
description: Workspace-specific limits and isolation needed when checking deployment images.
---
Use self-contained `docker run` probes rather than relying on `docker exec`
for deployment verification in this workspace.

**Why:** Image builds and container startup worked, but exec failed with a
namespace-attachment error. A run-based probe then exposed a real packaging
fault that host tests had missed.

**How to apply:** Test packaged services in an isolated container without access
to the original build tree or workspace dependencies, with disposable state and
no external network. Include the runtime modes actually being claimed as tested;
successful host tests do not prove a relocated image runs.

Match Coolify's repository-root `--project-directory` when testing nested Compose files.

**Why:** A Compose check using only `-f deploy/...` resolved paths relative to the
file's directory and passed, while Coolify resolved them from the repository root
and failed before building. These are different execution environments.

**How to apply:** Validate build contexts and Dockerfile existence with the exact
project-directory convention used by the deployment host.

Treat a failed toolchain-install callback as potentially state-changing.

**Why:** The Go package installer rejected its language argument but still added
a Go module to project configuration. Failure did not mean no changes occurred.

**How to apply:** Inspect configuration changes after a failed install and restore
unintended changes through the configuration-validation tool, not direct edits.

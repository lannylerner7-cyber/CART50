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

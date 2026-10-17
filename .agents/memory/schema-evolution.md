---
name: Explicit automatic schema evolution
description: User wants missing database structure handled automatically without guessing from incoming data.
---
Automatically initialize the application's defined database tables and safely add missing columns at startup. Do not infer columns or types from arbitrary data or uploaded files.

**Why:** The user asked for automatic missing-column creation and a codebase audit. This supersedes the earlier deployment choice to perform only a read-only schema probe.

**How to apply:** Use explicit schema definitions and repeatable migrations, preserve existing records, and reject repairs needing invented payloads or destructive changes. JSON property evolution is distinct from SQL columns. Keep D1 in production and do not migrate the project to the unused PostgreSQL scaffold.

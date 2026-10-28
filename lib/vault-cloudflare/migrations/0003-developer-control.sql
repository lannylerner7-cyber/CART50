-- Separate simulation circuit breaker; no changes to Core, signers or legacy objects.
CREATE TABLE IF NOT EXISTS developer_control (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL
);

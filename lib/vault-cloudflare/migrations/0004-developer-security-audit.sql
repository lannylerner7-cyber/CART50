-- Owner emergency records cannot share developer-controlled history capacity.
CREATE TABLE IF NOT EXISTS developer_security_audit (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS developer_security_audit_account_time
  ON developer_security_audit(account_id, created_at);

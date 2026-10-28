CREATE TABLE IF NOT EXISTS developer_rate_limits (
  id TEXT PRIMARY KEY,
  window INTEGER NOT NULL,
  hits INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS developer_rate_limits_window ON developer_rate_limits(window);

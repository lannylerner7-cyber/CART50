-- Additive developer namespace. Does not move or rewrite owner/replica records.
CREATE TABLE IF NOT EXISTS developer_accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  version INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS developer_accounts_email_unique ON developer_accounts(email);
CREATE TABLE IF NOT EXISTS developer_challenges (
  id TEXT PRIMARY KEY,
  expires INTEGER NOT NULL,
  data TEXT NOT NULL
);
-- The API records version 2 after checking the complete required schema.

CREATE TABLE IF NOT EXISTS developer_checkout_archive (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL, idem_hash TEXT NOT NULL,
 data TEXT NOT NULL, checksum TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS developer_archive_idem
 ON developer_checkout_archive(account_id,idem_hash);

export type LedgerLike = { txid: string; walletId: string; direction: string; amountSats: string; address: string | null };

/**
 * Assigns a stable, unique key to every ledger entry. Entries sharing txid+wallet
 * (e.g. several outputs of one transaction to the same wallet) are NOT collapsed:
 * they are distinguished by direction, address and amount, and true duplicates of
 * all of those get an ordinal in server order. The ordinal is only as stable as
 * the server's ordering of otherwise identical entries.
 */
export function keyLedger<T extends LedgerLike>(rows: readonly T[]): { row: T; key: string }[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const base = [row.txid, row.walletId, row.direction, row.address ?? '-', row.amountSats].join(':');
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { row, key: n === 0 ? base : base + '#' + n };
  });
}

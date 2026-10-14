import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { ListTree } from 'lucide-react';
import { useListTransactions, getListTransactionsQueryKey, type Transaction } from '@workspace/api-client-react';
import { DataTable, type Column } from '@/components/data-table';
import { Btc, CopyText, Empty, ErrorPanel, PageHeader, Pill, SkelRows, statusTone } from '@/components/kit';
import { POLL_MS, short, stamp, toBig } from '@/lib/vault';

export default function Transactions() {
  const q = useListTransactions({ query: { queryKey: getListTransactionsQueryKey(), refetchInterval: POLL_MS } });
  const [dir, setDir] = useState('all');
  const [status, setStatus] = useState('all');
  const data = q.data ?? [];
  const dirs = useMemo(() => Array.from(new Set(data.map((t) => t.direction))), [data]);
  const statuses = useMemo(() => Array.from(new Set(data.map((t) => t.status))), [data]);
  const rows = useMemo(() => data.filter((t) => (dir === 'all' || t.direction === dir) && (status === 'all' || t.status === status)), [data, dir, status]);

  const cols: Column<Transaction>[] = [
    { key: 'txid', label: 'Txid', render: (t) => <CopyText value={t.txid} display={short(t.txid, 10)} />, sort: (t) => t.txid },
    { key: 'direction', label: 'Dir', render: (t) => <Pill tone={/in/.test(t.direction) ? 'ok' : 'ember'}>{t.direction}</Pill>, sort: (t) => t.direction },
    { key: 'amount', label: 'Amount', align: 'right', render: (t) => <Btc sats={t.amountSats} size="sm" />, sort: (t) => toBig(t.amountSats) },
    { key: 'fee', label: 'Fee', align: 'right', render: (t) => (t.feeSats ? <Btc sats={t.feeSats} size="sm" className="text-muted-foreground" /> : '—'), sort: (t) => toBig(t.feeSats), hidden: true },
    { key: 'conf', label: 'Conf', align: 'right', render: (t) => <span className="font-mono text-xs">{t.confirmations}</span>, sort: (t) => t.confirmations },
    { key: 'status', label: 'Status', render: (t) => <Pill tone={statusTone(t.status)}>{t.status}</Pill>, sort: (t) => t.status },
    { key: 'wallet', label: 'Wallet', render: (t) => <Link href={`/wallets/${t.walletId}`} className="font-mono text-xs hover:text-primary" data-testid={`link-wallet-${t.walletId}`}>{short(t.walletId, 6)}</Link>, sort: (t) => t.walletId },
    { key: 'address', label: 'Address', render: (t) => (t.address ? <CopyText value={t.address} display={short(t.address, 8)} /> : '—'), hidden: true },
    { key: 'replaced', label: 'Replaced by', render: (t) => (t.replacedBy ? <CopyText value={t.replacedBy} display={short(t.replacedBy, 6)} /> : '—'), hidden: true },
    { key: 'seen', label: 'First seen', render: (t) => <span className="font-mono text-xs text-muted-foreground">{stamp(t.firstSeen)}</span>, sort: (t) => t.firstSeen },
  ];
  const sel = 'h-9 rounded-md border border-input bg-card px-2 font-mono text-[11px] uppercase';

  return (
    <div className="space-y-6">
      <PageHeader kicker="Ledger" title="Transactions" desc="Every movement your node has observed for vault wallets, including replaced and unconfirmed spends." />
      {q.isError && <ErrorPanel error={q.error} onRetry={() => q.refetch()} />}
      {q.isLoading ? <SkelRows rows={10} /> : q.data && (
        <DataTable testId="transactions" rows={rows} columns={cols} rowKey={(t) => `${t.txid}-${t.walletId}`} search={(t) => `${t.txid} ${t.walletId} ${t.address ?? ''}`}
          placeholder="Search txid, wallet, address" initialSort={{ key: 'seen', dir: 'desc' }}
          toolbar={<>
            <select className={sel} value={dir} onChange={(e) => setDir(e.target.value)} data-testid="select-direction"><option value="all">all directions</option>{dirs.map((d) => <option key={d} value={d}>{d}</option>)}</select>
            <select className={sel} value={status} onChange={(e) => setStatus(e.target.value)} data-testid="select-tx-status"><option value="all">all status</option>{statuses.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          </>}
          empty={<Empty icon={<ListTree className="h-5 w-5" />} title={data.length ? 'No matches' : 'Ledger is empty'} body={data.length ? 'Adjust search or filters.' : 'Transactions appear here once your node sees them.'} />} />
      )}
    </div>
  );
}

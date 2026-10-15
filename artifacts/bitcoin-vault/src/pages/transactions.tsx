import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { ListTree, Pause, Play, RefreshCw } from 'lucide-react';
import { useListTransactions, getListTransactionsQueryKey, type Transaction } from '@workspace/api-client-react';
import { DataTable, type Column } from '@/components/data-table';
import { Btc, CopyText, Empty, ErrorPanel, PageHeader, Pill, SkelRows, statusTone } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { POLL_MS, short, stamp, toBig, ago } from '@/lib/vault';
import { keyLedger } from '@/lib/ledger-keys';
import { transferDelay } from '@/lib/transfer-delay';
import { createContext, useContext, useEffect } from 'react';

const DelayContext = createContext({ now: 0, minutes: 60 });
function DelaySignal({ transaction }: { transaction: Transaction }) {
  const { now, minutes } = useContext(DelayContext);
  return <span className="block max-w-sm text-xs text-muted-foreground">{transferDelay(transaction, now, minutes)}</span>;
}

type Row = { row: Transaction; key: string };

const statusLabel = (s: string) => (s === 'confirmed' ? 'Complete' : s === 'confirming' ? 'Processing' : s === 'pending' ? 'Unconfirmed' : s);
const confText = (n: number) => (n < 0 ? 'Conflicted' : `${Math.min(n, 3)} / 3`);
const dirTone = (d: string) => (/in/.test(d) ? 'ok' : 'ember') as 'ok' | 'ember';

const COLS: Column<Row>[] = [
  { key: 'delay', label: 'Transfer signal', render: ({ row }) => <DelaySignal transaction={row} /> },
  { key: 'txid', label: 'Txid', render: ({ row: t }) => <CopyText value={t.txid} display={short(t.txid, 10)} />, sort: ({ row: t }) => t.txid },
  { key: 'direction', label: 'Dir', render: ({ row: t }) => <Pill tone={dirTone(t.direction)}>{t.direction}</Pill>, sort: ({ row: t }) => t.direction },
  { key: 'amount', label: 'Amount', align: 'right', render: ({ row: t }) => <Btc sats={t.amountSats} size="sm" />, sort: ({ row: t }) => toBig(t.amountSats) },
  { key: 'fee', label: 'Fee', align: 'right', render: ({ row: t }) => (t.feeSats ? <Btc sats={t.feeSats} size="sm" className="text-muted-foreground" /> : '—'), sort: ({ row: t }) => toBig(t.feeSats), hidden: true },
  { key: 'conf', label: 'Confirmations', align: 'right', render: ({ row: t }) => <span className="font-mono text-xs">{confText(t.confirmations)}{t.confirmations > 3 && <span className="block text-muted-foreground">{t.confirmations} total</span>}</span>, sort: ({ row: t }) => t.confirmations },
  { key: 'status', label: 'Status', render: ({ row: t }) => <Pill tone={statusTone(t.status)}>{statusLabel(t.status)}</Pill>, sort: ({ row: t }) => t.status },
  { key: 'wallet', label: 'Wallet', render: ({ row: t }) => <Link href={`/wallets/${t.walletId}`} className="inline-flex min-h-11 items-center font-mono text-xs hover:text-primary" data-testid={`link-wallet-${t.walletId}`}>{short(t.walletId, 6)}</Link>, sort: ({ row: t }) => t.walletId },
  { key: 'address', label: 'Address', render: ({ row: t }) => (t.address ? <CopyText value={t.address} display={short(t.address, 8)} /> : '—'), hidden: true },
  { key: 'replaced', label: 'Replaced by', render: ({ row: t }) => (t.replacedBy ? <CopyText value={t.replacedBy} display={short(t.replacedBy, 6)} /> : '—'), hidden: true },
  { key: 'seen', label: 'First seen', render: ({ row: t }) => <span className="font-mono text-xs text-muted-foreground">{stamp(t.firstSeen)}</span>, sort: ({ row: t }) => t.firstSeen },
];

const rowKey = (r: Row) => r.key;
const searchText = ({ row: t }: Row) => `${t.txid} ${t.walletId} ${t.address ?? ''} ${t.replacedBy ?? ''}`;

function MobileCard({ row: t }: Row) {
  return (
    <div className="min-w-0 space-y-2 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill tone={dirTone(t.direction)}>{t.direction}</Pill>
          <Pill tone={statusTone(t.status)}>{statusLabel(t.status)}</Pill>
        </div>
        <div className="shrink-0 text-right"><Btc sats={t.amountSats} size="sm" /></div>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 font-mono text-xs">
        <dt className="text-muted-foreground">Confirmations</dt>
        <dd className="text-right">{confText(t.confirmations)}{t.confirmations > 3 && <span className="text-muted-foreground"> ({t.confirmations} total)</span>}</dd>
        <dt className="text-muted-foreground">First seen</dt>
        <dd className="text-right text-muted-foreground">{stamp(t.firstSeen)}</dd>
        {t.feeSats && <><dt className="text-muted-foreground">Fee</dt><dd className="text-right"><Btc sats={t.feeSats} size="sm" className="text-muted-foreground" /></dd></>}
        <dt className="self-center text-muted-foreground">Txid</dt>
        <dd className="min-w-0 truncate text-right"><CopyText value={t.txid} display={short(t.txid, 8)} /></dd>
        {t.address && <><dt className="self-center text-muted-foreground">Address</dt><dd className="min-w-0 truncate text-right"><CopyText value={t.address} display={short(t.address, 8)} /></dd></>}
        {t.replacedBy && <><dt className="self-center text-muted-foreground">Replaced by</dt><dd className="min-w-0 truncate text-right"><CopyText value={t.replacedBy} display={short(t.replacedBy, 6)} /></dd></>}
        <dt className="self-center text-muted-foreground">Wallet</dt>
        <dd className="text-right"><Link href={`/wallets/${t.walletId}`} className="inline-flex min-h-11 items-center hover:text-primary" data-testid={`link-wallet-card-${t.walletId}`}>{short(t.walletId, 6)}</Link></dd>
      </dl>
    </div>
  );
}
const mobileCard = (r: Row) => <><MobileCard {...r} /><div className="px-4 pb-3"><DelaySignal transaction={r.row} /></div></>;

export default function Transactions() {
  const [minutes, setMinutes] = useState(() => {
    try { const n = Number(localStorage.getItem('vault-delay-minutes')); return [30, 60, 120].includes(n) ? n : 60; } catch { return 60; }
  });
  const [clock, setClock] = useState(Date.now);
  const [storageWarning, setStorageWarning] = useState(false);
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 15000); return () => clearInterval(timer); }, []);
  const [live, setLive] = useState(true);
  const [snapshot, setSnapshot] = useState<{ data: Transaction[]; updated: number } | null>(null);
  const q = useListTransactions({ query: { queryKey: getListTransactionsQueryKey(), enabled: live, refetchOnWindowFocus: live, refetchOnReconnect: live, refetchInterval: live ? POLL_MS : false } });
  const displayed = !live && snapshot ? snapshot.data : q.data;
  const refresh = async () => {
    const result = await q.refetch();
    if (result.data && !result.isError) setSnapshot({ data: result.data, updated: result.dataUpdatedAt });
  };
  const [dir, setDir] = useState('all');
  const [status, setStatus] = useState('all');
  const keyed = useMemo(() => keyLedger(displayed ?? []), [displayed]);
  const dirs = useMemo(() => Array.from(new Set(keyed.map((k) => k.row.direction))), [keyed]);
  const statuses = useMemo(() => Array.from(new Set(keyed.map((k) => k.row.status))), [keyed]);
  const rows = useMemo(() => keyed.filter(({ row: t }) => (dir === 'all' || t.direction === dir) && (status === 'all' || t.status === status)), [keyed, dir, status]);

  const sel = 'h-11 rounded-md border border-input bg-card px-2 font-mono text-[11px] uppercase md:h-9';
  const updatedAt = !live && snapshot ? snapshot.updated : q.dataUpdatedAt;
  const updated = updatedAt ? ago(new Date(updatedAt).toISOString()) : null;

  return (
    <DelayContext.Provider value={{ now: live ? clock : updatedAt, minutes }}>
    <div className="min-w-0 space-y-6">
      <PageHeader kicker="Ledger" title="Transactions" desc="Every movement your node has observed for vault wallets, including replaced and unconfirmed spends." />
      <section className="space-y-2 rounded-2xl border bg-card p-4">
        <label className="flex flex-wrap items-center gap-3 text-sm">
          Warn when fewer than 3 confirmations after
          <select className="h-11 rounded-lg border bg-card px-3" value={minutes} onChange={(e) => {
            const value = Number(e.target.value); setMinutes(value);
            try { localStorage.setItem('vault-delay-minutes', String(value)); setStorageWarning(false); } catch { setStorageWarning(true); }
          }}>{[30, 60, 120].map(n => <option key={n} value={n}>{n} minutes</option>)}</select>
        </label>
        <p className="text-xs text-muted-foreground">Measured from first seen, not time since the last block. This browser-only warning does not change fees or send notifications. Paused history uses its snapshot time. Stale data may show an outdated signal.</p>
        <p className="text-xs text-muted-foreground">Possible causes include low fees, mempool congestion, slow block arrival or a node still syncing. Elapsed time does not identify the cause. Check your node and transaction before reviewing a fee replacement; do not resend blindly.</p>
        {storageWarning && <p role="status" className="text-xs">Preference could not be saved. It applies to this page until reload.</p>}
      </section>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <p className="text-sm text-muted-foreground" role="status" data-testid="text-refresh-status">
          {q.isError
            ? (q.data ? `Live updates unavailable. Showing data last refreshed ${updated}; it may be out of date.` : 'Live updates unavailable.')
            : updated
              ? `Last refreshed ${updated}. ${live ? `Auto-refresh every ${POLL_MS / 1000} seconds.` : 'Auto-refresh paused; the list will not change until you refresh.'}`
              : 'Waiting for node transaction history.'}
          {' '}Complete means at least 3 confirmations—not irreversible finality. A chain reorganization can change the status.
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" className="h-11 gap-1.5 bg-card font-mono text-[11px] uppercase" aria-pressed={!live} onClick={() => { if (live) setSnapshot({ data: q.data ?? [], updated: q.dataUpdatedAt }); setLive((v) => !v); }} data-testid="button-toggle-autorefresh">
            {live ? <><Pause className="h-4 w-4" /> Pause updates</> : <><Play className="h-4 w-4" /> Resume updates</>}
          </Button>
          <Button variant="outline" className="h-11 gap-1.5 bg-card font-mono text-[11px] uppercase" disabled={q.isFetching} onClick={refresh} data-testid="button-refresh-transactions">
            <RefreshCw className={q.isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> {q.isFetching ? 'Refreshing' : 'Refresh'}
          </Button>
        </div>
      </div>
      {q.isError && <ErrorPanel error={q.error} onRetry={refresh} />}
      {q.isLoading ? <SkelRows rows={10} /> : q.data && (
        <DataTable testId="transactions" rows={rows} columns={COLS} rowKey={rowKey} search={searchText} mobileCard={mobileCard} resetKey={`${dir}|${status}`}
          placeholder="Search txid, wallet, address" initialSort={{ key: 'seen', dir: 'desc' }}
          toolbar={<>
            <select aria-label="Filter by direction" className={sel} value={dir} onChange={(e) => setDir(e.target.value)} data-testid="select-direction"><option value="all">all directions</option>{dirs.map((d) => <option key={d} value={d}>{d}</option>)}</select>
            <select aria-label="Filter by status" className={sel} value={status} onChange={(e) => setStatus(e.target.value)} data-testid="select-tx-status"><option value="all">all status</option>{statuses.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          </>}
          empty={<Empty icon={<ListTree className="h-5 w-5" />} title={keyed.length ? 'No matches' : 'Ledger is empty'} body={keyed.length ? 'Adjust search or filters.' : 'Transactions appear here once your node sees them.'} />} />
      )}
    </div>
    </DelayContext.Provider>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Link, useSearch } from 'wouter';
import { ArrowLeft, ChevronDown, ListTree, Pause, Play, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react';
import { useListTransactions, getListTransactionsQueryKey, type Transaction } from '@workspace/api-client-react';
import { Btc, CopyText, Empty, ErrorPanel, SkelRows } from '@/components/kit';
import { Sheet } from '@/components/sheet';
import { TxRow, txStatusLabel } from '@/components/tx-row';
import { POLL_MS, short, stamp, ago } from '@/lib/vault';
import { keyLedger } from '@/lib/ledger-keys';
import { transferDelay } from '@/lib/transfer-delay';
import { cn } from '@/lib/utils';

const PAGE = 50;
const monthKey = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? 'unknown' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const monthLabel = (k: string) => {
  if (k === 'unknown') return 'Unknown date';
  const [y, m] = k.split('-').map(Number); const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString(undefined, d.getFullYear() === new Date().getFullYear() ? { month: 'long' } : { month: 'long', year: 'numeric' });
};

function PillSelect({ label, value, onChange, options, testId }: { label: string; value: string; onChange: (v: string) => void; options: { v: string; l: string }[]; testId: string }) {
  const on = value !== 'all';
  return (
    <label className={cn('pill-btn relative shrink-0 cursor-pointer pr-9', on && 'border-foreground bg-foreground text-background hover:bg-foreground')}>
      <span>{on ? options.find((o) => o.v === value)?.l ?? label : label}</span>
      <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4" />
      <select aria-label={`Filter by ${label.toLowerCase()}`} className="absolute inset-0 cursor-pointer opacity-0" value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId}>
        <option value="all">All {label.toLowerCase()}</option>
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </label>
  );
}

function Detail({ t, now, minutes }: { t: Transaction; now: number; minutes: number }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{transferDelay(t, now, minutes)}</p>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 font-mono text-xs">
        <dt className="text-muted-foreground">Status</dt><dd className="text-right capitalize">{txStatusLabel(t.status)}</dd>
        <dt className="text-muted-foreground">Confirmations</dt><dd className="text-right">{t.confirmations < 0 ? 'Conflicted' : t.confirmations}</dd>
        <dt className="text-muted-foreground">First seen</dt><dd className="text-right text-muted-foreground">{stamp(t.firstSeen)}</dd>
        {t.feeSats && <><dt className="text-muted-foreground">Fee</dt><dd className="text-right"><Btc sats={t.feeSats} size="sm" className="text-muted-foreground" /></dd></>}
        <dt className="self-center text-muted-foreground">Txid</dt><dd className="min-w-0 truncate text-right"><CopyText value={t.txid} display={short(t.txid, 8)} /></dd>
        {t.address && <><dt className="self-center text-muted-foreground">Address</dt><dd className="min-w-0 truncate text-right"><CopyText value={t.address} display={short(t.address, 8)} /></dd></>}
        {t.replacedBy && <><dt className="self-center text-muted-foreground">Replaced by</dt><dd className="min-w-0 truncate text-right"><CopyText value={t.replacedBy} display={short(t.replacedBy, 6)} /></dd></>}
        <dt className="self-center text-muted-foreground">Wallet</dt>
        <dd className="text-right"><Link href={`/wallets/${t.walletId}`} className="inline-flex min-h-11 items-center hover:text-primary" data-testid={`link-wallet-${t.walletId}`}>{short(t.walletId, 6)}</Link></dd>
      </dl>
    </div>
  );
}

export default function Transactions() {
  const params = new URLSearchParams(useSearch());
  const [walletFilter, setWalletFilter] = useState(params.get('wallet') ?? '');
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
  const [month, setMonth] = useState('all');
  const [text, setText] = useState('');
  const [settings, setSettings] = useState(false);
  const keyed = useMemo(() => keyLedger(displayed ?? []), [displayed]);
  const dirs = useMemo(() => Array.from(new Set(keyed.map((k) => k.row.direction))), [keyed]);
  const statuses = useMemo(() => Array.from(new Set(keyed.map((k) => k.row.status))), [keyed]);
  const months = useMemo(() => Array.from(new Set(keyed.map((k) => monthKey(k.row.firstSeen)))).sort().reverse(), [keyed]);
  const filtered = useMemo(() => {
    const s = text.trim().toLowerCase();
    const rows = keyed
      .filter(({ row: t }) => (dir === 'all' || t.direction === dir) && (status === 'all' || t.status === status) && (month === 'all' || monthKey(t.firstSeen) === month) && (!walletFilter || t.walletId === walletFilter))
      .filter(({ row: t }) => !s || `${t.txid} ${t.walletId} ${t.address ?? ''} ${t.replacedBy ?? ''}`.toLowerCase().includes(s))
      .sort((a, b) => Date.parse(b.row.firstSeen) - Date.parse(a.row.firstSeen));
    return rows;
  }, [keyed, dir, status, month, text, walletFilter]);
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  useEffect(() => { setPage(0); }, [dir, status, month, text, walletFilter]);
  useEffect(() => { setPage((p) => Math.min(p, pages - 1)); }, [pages]);
  const cur = Math.min(page, pages - 1);
  const groups = useMemo(() => {
    const out: { k: string; rows: typeof filtered }[] = [];
    for (const r of filtered.slice(cur * PAGE, cur * PAGE + PAGE)) { const k = monthKey(r.row.firstSeen); const last = out[out.length - 1]; if (last?.k === k) last.rows.push(r); else out.push({ k, rows: [r] }); }
    return out;
  }, [filtered, cur]);

  const updatedAt = !live && snapshot ? snapshot.updated : q.dataUpdatedAt;
  const updated = updatedAt ? ago(new Date(updatedAt).toISOString()) : null;
  const now = live ? clock : updatedAt;

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/" className="circle-btn h-12 w-12" aria-label="Back to home" data-testid="link-back-home"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="flex gap-2">
          <button className="circle-btn h-12 w-12" aria-pressed={!live} aria-label={live ? 'Pause updates' : 'Resume updates'} onClick={() => { if (live) setSnapshot({ data: q.data ?? [], updated: q.dataUpdatedAt }); setLive((v) => !v); }} data-testid="button-toggle-autorefresh">
            {live ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button className="circle-btn h-12 w-12 disabled:opacity-40" disabled={q.isFetching} aria-label="Refresh" onClick={refresh} data-testid="button-refresh-transactions">
            <RefreshCw className={q.isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          </button>
        </div>
      </div>
      <h1 className="font-display rise text-[30px] font-semibold leading-tight md:text-[38px]" data-testid="text-page-title">BTC Transactions</h1>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        <button className="circle-btn h-11 w-14 shrink-0 bg-background" onClick={() => setSettings(true)} aria-label="Delay warning settings" data-testid="button-tx-settings"><SlidersHorizontal className="h-4 w-4" /></button>
        <PillSelect label="Direction" value={dir} onChange={setDir} options={dirs.map((d) => ({ v: d, l: d }))} testId="select-direction" />
        <PillSelect label="Status" value={status} onChange={setStatus} options={statuses.map((s) => ({ v: s, l: txStatusLabel(s) }))} testId="select-tx-status" />
        <PillSelect label="Date" value={month} onChange={setMonth} options={months.map((m) => ({ v: m, l: monthLabel(m) }))} testId="select-tx-month" />
        {walletFilter && <button className="pill-btn shrink-0 border-foreground" onClick={() => setWalletFilter('')} data-testid="button-clear-wallet-filter">Wallet {short(walletFilter, 4)} <X className="h-4 w-4" /></button>}
      </div>

      <label className="flex h-12 items-center gap-2 rounded-full border border-border bg-card px-4">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search txid, wallet, address" className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" data-testid="input-search-transactions" />
      </label>

      <p className="text-[13px] text-muted-foreground" role="status" data-testid="text-refresh-status">
        {q.isError
          ? (q.data ? `Live updates unavailable. Showing data last refreshed ${updated}; it may be out of date.` : 'Live updates unavailable.')
          : updated
            ? `Last refreshed ${updated}. ${live ? `Auto-refresh every ${POLL_MS / 1000} seconds.` : 'Auto-refresh paused; the list will not change until you refresh.'}`
            : 'Waiting for node transaction history.'}
        {' '}Complete means at least 3 confirmations, not irreversible finality. A chain reorganization can change the status.
      </p>

      {q.isError && <ErrorPanel error={q.error} onRetry={refresh} />}
      {q.isLoading ? <SkelRows rows={8} /> : displayed && (
        groups.length === 0 ? (
          <Empty icon={<ListTree className="h-5 w-5" />} title={keyed.length ? 'No matches' : 'Ledger is empty'} body={keyed.length ? 'Adjust search or filters.' : 'Transactions appear here once your node sees them.'} />
        ) : (
          <div className="space-y-6" data-testid="list-transactions">
            {groups.map((g) => (
              <section key={g.k} aria-label={monthLabel(g.k)}>
                <h2 className="text-[15px] font-bold">{monthLabel(g.k)}</h2>
                <ul className="mt-1">
                  {g.rows.map(({ row, key }) => <TxRow key={key} testKey={key} t={row} detail={<Detail t={row} now={now} minutes={minutes} />} />)}
                </ul>
              </section>
            ))}
            {pages > 1 && (
              <nav aria-label="Pagination" className="flex items-center justify-between gap-3 pt-2">
                <button className="pill-btn disabled:opacity-40" disabled={cur === 0} onClick={() => setPage(cur - 1)} data-testid="button-page-prev">Previous</button>
                <span className="text-[13px] text-muted-foreground" data-testid="text-page">Page {cur + 1} of {pages} · {filtered.length} entries</span>
                <button className="pill-btn disabled:opacity-40" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} data-testid="button-page-next">Next</button>
              </nav>
            )}
          </div>
        )
      )}

      <Sheet open={settings} onOpenChange={setSettings} title="Delay warning" description="Browser-only. Does not change fees or send notifications." testId="sheet-tx-settings">
        <div className="mt-4 space-y-3">
          <label className="flex flex-wrap items-center justify-between gap-3 text-sm">
            Warn when fewer than 3 confirmations after
            <select className="h-11 rounded-full border border-border bg-card px-4" value={minutes} onChange={(e) => {
              const value = Number(e.target.value); setMinutes(value);
              try { localStorage.setItem('vault-delay-minutes', String(value)); setStorageWarning(false); } catch { setStorageWarning(true); }
            }} data-testid="select-delay-minutes">{[30, 60, 120].map(n => <option key={n} value={n}>{n} minutes</option>)}</select>
          </label>
          <p className="text-xs text-muted-foreground">Measured from first seen, not time since the last block. Paused history uses its snapshot time. Stale data may show an outdated signal.</p>
          <p className="text-xs text-muted-foreground">Possible causes include low fees, mempool congestion, slow block arrival or a node still syncing. Elapsed time does not identify the cause. Check your node and transaction before reviewing a fee replacement; do not resend blindly.</p>
          {storageWarning && <p role="status" className="text-xs">Preference could not be saved. It applies to this page until reload.</p>}
          <button onClick={() => setSettings(false)} className="pill-btn h-14 w-full" data-testid="button-close-tx-settings">Done</button>
        </div>
      </Sheet>
    </div>
  );
}

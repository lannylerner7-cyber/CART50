import { useEffect, useState } from 'react';
import { useGetNodeSync, getGetNodeSyncQueryKey } from '@workspace/api-client-react';
import { RefreshCw } from 'lucide-react';

export function NodeSync() {
  const q = useGetNodeSync({ query: {
    queryKey: getGetNodeSyncQueryKey(),
    refetchInterval: 15000, staleTime: 0, refetchOnMount: 'always',
    refetchOnWindowFocus: 'always', refetchOnReconnect: 'always', retry: 1,
  } });
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const d = q.data;
  const observed = Date.parse(d?.observedAt ?? '');
  const age = Number.isFinite(observed) ? Math.max(0, Math.floor((now - observed) / 1000)) : null;
  const stale = q.isError || q.fetchStatus === 'paused' || (age !== null && age > 60);
  const available = d?.available === true;
  const progress = available && d.verificationProgress != null ? d.verificationProgress * 100 : null;
  const title = q.isPending ? 'Connecting to mainnet…' : stale ? 'Sync updates interrupted' :
    !available ? 'Mainnet monitor not connected' : d.initialBlockDownload ? 'Bitcoin is syncing' : 'Blockchain is up to date';

  return <section className="rounded-[24px] border border-border bg-card p-5 sm:p-6" data-testid="mainnet-sync-card">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Mainnet · read-only monitor</p>
        <h2 className="mt-2 text-xl font-semibold">{title}</h2>
      </div>
      <button onClick={() => void q.refetch()} disabled={q.isFetching}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted disabled:opacity-50"
        aria-label="Refresh mainnet sync progress"><RefreshCw className={`h-4 w-4 ${q.isFetching ? 'animate-spin' : ''}`} /></button>
    </div>
    {progress !== null && <>
      <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-mono text-3xl">{(Math.floor(progress * 100) / 100).toFixed(2)}%</span>
        <span className="text-sm text-muted-foreground">{stale ? 'Last known verification progress' : 'Blockchain verified'}</span>
      </div>
      <div role="progressbar" aria-label="Blockchain verification" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}
        className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full transition-[width] ${stale ? 'bg-muted-foreground' : 'bg-primary'}`} style={{ width: `${progress}%` }} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div><dt className="text-muted-foreground">Blocks verified</dt><dd className="mt-1 font-mono">{d?.blocks?.toLocaleString()}</dd></div>
        <div><dt className="text-muted-foreground">Known headers</dt><dd className="mt-1 font-mono">{d?.headers?.toLocaleString()}</dd></div>
      </dl>
    </>}
    <p className={`mt-4 text-sm ${stale ? 'text-warn' : 'text-muted-foreground'}`} role="status">
      {stale ? 'Updates are unavailable or stale. This is not evidence that the node has stopped syncing.' :
        available ? `Updated ${age ?? 0}s ago · refreshes every 15 seconds while this page is open.` :
        q.isPending ? 'Requesting a fresh observation…' : d?.message ?? 'Unable to load sync progress.'}
    </p>
    {available && <p className="mt-2 text-xs text-muted-foreground">
      {d.initialBlockDownload ? 'Initial blockchain download is still in progress. A reliable finish time is not yet available.' :
        'Sync is complete; wallet readiness and recovery checks are separate.'}
      {' '}Monitoring does not enable mainnet transfers.
    </p>}
  </section>;
}

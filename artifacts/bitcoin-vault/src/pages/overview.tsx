import { Link } from 'wouter';
import { Boxes, Radio, Snowflake, Flame, Timer } from 'lucide-react';
import { useGetVaultDashboard, getGetVaultDashboardQueryKey, type Wallet } from '@workspace/api-client-react';
import { Btc, Empty, ErrorPanel, PageHeader, Panel, Pill, Skel, Stat, statusTone } from '@/components/kit';
import { POLL_MS, ago, remaining, short, toBig } from '@/lib/vault';
import { cn } from '@/lib/utils';

function sumKind(ws: Wallet[], kind: string) {
  return ws.filter((w) => w.kind === kind).reduce((a, w) => a + toBig(w.confirmedSats), 0n);
}

export default function Overview() {
  const q = useGetVaultDashboard({ query: { queryKey: getGetVaultDashboardQueryKey(), refetchInterval: POLL_MS } });
  const d = q.data;

  return (
    <div className="space-y-6">
      <PageHeader kicker="00 / control room" title="Overview" desc="Live state from your own node. Figures update every 15 seconds while the vault is open." 
        actions={d && <Pill tone={d.node.connected ? 'ok' : 'bad'} dot testId="status-node">{d.node.connected ? 'node connected' : 'node disconnected'}</Pill>} />

      {q.isError && <ErrorPanel error={q.error} onRetry={() => q.refetch()} title="Dashboard unavailable" />}
      {q.isLoading && <div className="grid gap-4 md:grid-cols-3"><Skel className="h-40 md:col-span-2" /><Skel className="h-40" /><Skel className="h-64 md:col-span-3" /></div>}

      {d && (() => {
        const temp = d.wallets.filter((w) => w.kind === 'temporary');
        const soon = temp.filter((w) => { const r = remaining(w.expiresAt); return r.ms > 0 && r.ms < 12 * 3600000; }).length;
        const expired = temp.filter((w) => w.status.toLowerCase() === 'expired').length;
        const n = d.node;
        const prog = n.syncProgress != null ? Math.max(0, Math.min(1, n.syncProgress)) : null;
        return (
          <>
            <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
              <Panel className="relative overflow-hidden" bodyClass="p-6">
                <div className="absolute inset-0 ledger-grid opacity-60" />
                <div className="relative">
                  <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">confirmed holdings</div>
                  <div className="mt-2" data-testid="text-confirmed-total"><Btc sats={d.confirmedSats} size="xl" showSats /></div>
                  <div className="mt-2 text-sm text-muted-foreground">Pending <Btc sats={d.unconfirmedSats} size="sm" className="text-warn" /></div>
                  <div className="mt-6 grid grid-cols-3 gap-4 border-t border-border pt-4">
                    <Stat label="cold"><span className="inline-flex items-center gap-1.5 text-cold"><Snowflake className="h-3.5 w-3.5" /><Btc sats={sumKind(d.wallets, 'cold')} size="sm" /></span></Stat>
                    <Stat label="hot spending"><span className="inline-flex items-center gap-1.5 text-primary"><Flame className="h-3.5 w-3.5" /><Btc sats={sumKind(d.wallets, 'spending')} size="sm" /></span></Stat>
                    <Stat label="receiving"><span className="inline-flex items-center gap-1.5"><Boxes className="h-3.5 w-3.5" /><Btc sats={sumKind(d.wallets, 'temporary')} size="sm" /></span></Stat>
                  </div>
                </div>
              </Panel>

              <Panel title="node health" meta={<span className="font-mono">{n.network}</span>}>
                <div className="flex items-center gap-3">
                  <Radio className={cn('h-5 w-5', n.connected ? 'text-ok' : 'text-destructive')} />
                  <div className="text-sm" data-testid="text-node-message">{n.message}</div>
                </div>
                <div className="mt-4">
                  <div className="flex justify-between font-mono text-[10.5px] uppercase text-muted-foreground"><span>sync</span><span>{prog != null ? `${(Math.floor(prog * 10000) / 100).toFixed(2)}%` : 'unknown'}</span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full origin-left bg-primary transition-transform duration-700" style={{ transform: `scaleX(${prog ?? 0})` }} />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Stat label="blocks"><span className="font-mono text-sm">{n.blocks?.toLocaleString() ?? '—'}</span></Stat>
                  <Stat label="headers"><span className="font-mono text-sm">{n.headers?.toLocaleString() ?? '—'}</span></Stat>
                  <Stat label="peers"><span className="font-mono text-sm">{n.peers ?? '—'}</span></Stat>
                  <Stat label="last sync"><span className="text-sm">{ago(n.lastSync)}</span></Stat>
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  <Pill tone={statusTone(n.recoveryStatus)}>recovery {n.recoveryStatus}</Pill>
                  <Pill tone={d.mainnetEnabled ? 'ember' : 'neutral'}>mainnet {d.mainnetEnabled ? 'on' : 'disabled'}</Pill>
                  <Pill tone={d.destructionEnabled ? 'ember' : 'neutral'}>destruction {d.destructionEnabled ? 'on' : 'disabled'}</Pill>
                </div>
              </Panel>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Panel title="receiving fleet"><div className="flex items-baseline gap-2"><span className="font-display text-4xl font-extrabold" data-testid="text-temp-count">{temp.length}</span><span className="text-sm text-muted-foreground">temporary wallets</span></div>
                <div className="mt-3 flex gap-2"><Pill tone="warn"><Timer className="h-3 w-3" />{soon} under 12h</Pill><Pill tone="neutral">{expired} expired</Pill></div></Panel>
              <Panel title="services" className="md:col-span-2">
                {d.services.length === 0 ? <div className="text-sm text-muted-foreground">No services reported.</div> : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {d.services.map((s) => (
                      <div key={s.name} className="flex items-start justify-between gap-2 rounded-sm border border-border px-3 py-2" data-testid={`card-service-${s.name}`}>
                        <div className="min-w-0"><div className="text-sm font-medium">{s.name}</div><div className="truncate text-xs text-muted-foreground">{s.message}</div></div>
                        <Pill tone={statusTone(s.status)}>{s.status}</Pill>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="recent transactions" meta={<Link href="/transactions" className="hover:text-primary" data-testid="link-all-tx">view all</Link>} bodyClass="p-0">
                {d.transactions.length === 0 ? <div className="p-4"><Empty icon={<Boxes className="h-5 w-5" />} title="No transactions yet" body="Nothing has moved through this vault on its node." /></div> : (
                  <ul className="divide-y divide-border">
                    {d.transactions.slice(0, 8).map((t) => (
                      <li key={t.txid + t.walletId} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <div className="min-w-0"><div className="font-mono text-xs">{short(t.txid, 10)}</div><div className="text-[11px] text-muted-foreground">{ago(t.firstSeen)} · {t.confirmations} conf</div></div>
                        <div className="text-right"><Btc sats={t.amountSats} size="sm" className={t.direction === 'in' || t.direction === 'incoming' ? 'text-ok' : 'text-primary'} /><div><Pill tone={statusTone(t.status)}>{t.status}</Pill></div></div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="activity log" bodyClass="p-0">
                {d.activity.length === 0 ? <div className="p-4 text-sm text-muted-foreground">No activity recorded.</div> : (
                  <ol className="relative max-h-[420px] overflow-auto py-2">
                    {d.activity.map((a) => (
                      <li key={a.id} className="relative flex gap-3 px-4 py-2">
                        <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', { ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-destructive', cold: 'bg-cold', neutral: 'bg-muted-foreground', ember: 'bg-primary' }[statusTone(a.severity)])} />
                        <div className="min-w-0"><div className="text-sm font-medium">{a.title}</div><div className="text-xs text-muted-foreground">{a.message}</div><div className="font-mono text-[10px] text-muted-foreground/70">{ago(a.createdAt)}</div></div>
                      </li>
                    ))}
                  </ol>
                )}
              </Panel>
            </div>
          </>
        );
      })()}
    </div>
  );
}

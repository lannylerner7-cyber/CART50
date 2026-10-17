import { useState } from 'react';
import { Link } from 'wouter';
import { ArrowDownToLine, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { Sheet, SheetAction, kindLabel } from '@/components/sheet';
import { PriceChart } from '@/components/price-chart';
import { NodeSync } from '@/components/node-sync';
import { ReceiveDialog, receiveBlock, useOnline, type Freshness } from '@/components/receive';
import { Boxes, Radio, Snowflake, Flame, Timer } from 'lucide-react';
import { useGetVaultDashboard, getGetVaultDashboardQueryKey, useGetMarket, getGetMarketQueryKey, type Wallet } from '@workspace/api-client-react';
import { Btc, Empty, ErrorPanel, Panel, Pill, Skel, Stat, statusTone } from '@/components/kit';
import { POLL_MS, ago, remaining, short, toBig } from '@/lib/vault';
import { cn } from '@/lib/utils';

function sumKind(ws: Wallet[], kind: string) {
  return ws.filter((w) => w.kind === kind).reduce((a, w) => a + toBig(w.confirmedSats), 0n);
}

export default function Overview() {
  const q = useGetVaultDashboard({ query: { queryKey: getGetVaultDashboardQueryKey(), refetchInterval: POLL_MS } });
  const d = q.data;
  const m = useGetMarket({ query: { queryKey: getGetMarketQueryKey(), refetchInterval: POLL_MS } });

  const [hide, setHide] = useState(false);
  const [picker, setPicker] = useState(false);
  const [recvId, setRecvId] = useState<string | null>(null);
  const online = useOnline();
  const fresh: Freshness = { nodeConnected: d?.node.connected, dataUpdatedAt: q.dataUpdatedAt, isError: q.isError };
  const recvWallet = d?.wallets.find((w) => w.id === recvId) ?? null;

  return (
    <div className="space-y-7 pb-24 md:pb-0">
      <NodeSync />
      {q.isError && <ErrorPanel error={q.error} onRetry={() => q.refetch()} title="Dashboard unavailable" />}
      {q.isLoading && <div className="grid gap-4"><Skel className="h-72" /><Skel className="h-64" /></div>}

      {d && (() => {
        const temp = d.wallets.filter((w) => w.kind === 'temporary');
        const soon = temp.filter((w) => { const r = remaining(w.expiresAt); return r.ms > 0 && r.ms < 12 * 3600000; }).length;
        const expired = temp.filter((w) => w.status.toLowerCase() === 'expired' || remaining(w.expiresAt).ms <= 0).length;
        const n = d.node;
        const prog = n.syncProgress != null ? Math.max(0, Math.min(1, n.syncProgress)) : null;
        const main = d.wallets.filter((w) => w.kind !== 'temporary');
        return (
          <>
            <section className="rise -mx-4 md:mx-0">
              <div className="flex items-start justify-between gap-3 px-5 md:px-1">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-muted-foreground">Confirmed balance</div>
                  <div className="mt-1 flex items-center gap-2" data-testid="text-confirmed-total">
                    {!n.connected || q.isError ? <span className="font-display text-2xl font-bold">Balance unavailable</span> : hide ? <span className="font-display text-[2.4rem] font-semibold leading-none">••••••</span> : <Btc sats={d.confirmedSats} size="xl" className="font-display font-semibold tracking-tight" />}
                    <button onClick={() => setHide((h) => !h)} className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground hover:bg-muted" aria-label={hide ? 'Show balances' : 'Hide balances'} data-testid="button-toggle-privacy">{hide ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button>
                  </div>
                </div>
                <Pill tone={n.connected ? 'ok' : 'bad'} dot testId="status-node" className="mt-1 bg-muted py-1.5">{n.connected ? 'Node live' : 'Node offline'}</Pill>
              </div>
              <div className="mt-4 md:px-1">
                {m.isLoading ? <Skel className="h-[230px] rounded-none md:rounded-[24px]" /> : m.data?.available && m.data.history.length > 1 ? (
                  <PriceChart history={m.data.history} currency={m.data.currency} className="px-1" />
                ) : (
                  <div className="mx-5 rounded-[24px] border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground md:mx-0" data-testid="status-chart-empty">
                    {m.isError ? 'Price feed unreachable.' : m.data?.message || 'No price history recorded yet.'} The chart appears only when your provider has real history.
                  </div>
                )}
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
              <div>
                <dl className="divide-y divide-border">
                  <div className="flex items-center justify-between py-4"><dt className="text-[16px]">Confirmed</dt><dd>{hide ? '••••' : <Btc sats={d.confirmedSats} size="md" className="text-[15px]" />}</dd></div>
                  <div className="flex items-center justify-between py-4"><dt className="text-[16px]">Pending</dt><dd>{hide ? '••••' : <Btc sats={d.unconfirmedSats} size="md" className="text-[15px] text-warn" />}</dd></div>
                </dl>
                <Link href="/explorer" className="mt-3 flex items-center gap-3 rounded-[22px] bg-card px-5 py-4 hover:bg-muted" data-testid="link-node-status">
                  <svg viewBox="0 0 24 24" className="h-7 w-7 -rotate-90" aria-hidden><circle cx="12" cy="12" r="10" fill="none" stroke="hsl(var(--muted))" strokeWidth="2.5" /><circle cx="12" cy="12" r="10" fill="none" stroke={n.connected ? 'hsl(var(--ok))' : 'hsl(var(--destructive))'} strokeWidth="2.5" strokeDasharray={`${(prog ?? 0) * 62.8} 62.8`} strokeLinecap="round" /></svg>
                  <span className="flex-1 text-[16px]">{n.network} node</span>
                  <span className={cn('font-mono text-sm', n.connected ? 'text-ok' : 'text-destructive')}>{prog != null ? `${(Math.floor(prog * 10000) / 100).toFixed(2)}% synced` : n.connected ? 'sync unknown' : 'offline'}</span>
                </Link>
              </div>

              <section>
                <div className="flex items-center justify-between py-2">
                  <h2 className="font-display text-[22px] font-semibold">My wallets</h2>
                  <Link href="/wallets" className="grid h-10 w-10 place-items-center rounded-full hover:bg-muted" aria-label="See all wallets" data-testid="link-see-all-wallets"><ArrowRight className="h-5 w-5" /></Link>
                </div>
                <ul>
                  {main.length === 0 && <li className="py-4 text-sm text-muted-foreground">No main or spending wallets reported.</li>}
                  {main.map((w) => (
                    <li key={w.id}><Link href={`/wallets/${w.id}`} className="-mx-2 flex items-center gap-3 rounded-2xl px-2 py-3 hover:bg-card" data-testid={`row-main-wallet-${w.id}`}>
                      <span className={cn('grid h-11 w-11 place-items-center rounded-full', w.kind === 'cold' ? 'bg-primary/15 text-primary' : 'bg-accent text-accent-foreground')}>{w.kind === 'cold' ? <Snowflake className="h-5 w-5" /> : <Flame className="h-5 w-5" />}</span>
                      <div className="min-w-0 flex-1"><div className="truncate text-[16px] font-medium">{w.label}</div><div className="text-xs text-muted-foreground">{kindLabel(w.kind)}</div></div>
                      <div className="text-right">{hide ? <span className="text-sm">••••</span> : <Btc sats={w.confirmedSats} size="sm" className="text-[13.5px]" />}</div>
                    </Link></li>
                  ))}
                  <li><Link href="/wallets" className="-mx-2 flex items-center gap-3 rounded-2xl px-2 py-3 hover:bg-card" data-testid="link-receiving-wallets">
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-muted"><Timer className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1"><div className="text-[16px] font-medium">Receiving wallets</div><div className="text-xs text-muted-foreground">{temp.length} temporary · {soon} under 12h · {expired} expired</div></div>
                    {hide ? '••••' : <Btc sats={sumKind(d.wallets, 'temporary')} size="sm" className="text-[13.5px]" />}
                  </Link></li>
                </ul>
              </section>
            </div>

            <div className="fixed inset-x-4 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.25rem)] z-30 grid grid-cols-2 gap-3 md:static md:inset-auto md:max-w-md">
              <button onClick={() => setPicker(true)} className="h-14 rounded-full border border-border bg-background/90 text-[16px] font-bold backdrop-blur transition-transform active:scale-[0.98]" data-testid="button-action-receive">Receive</button>
              <Link href="/spending" className="grid h-14 place-items-center rounded-full bg-primary text-[16px] font-bold text-primary-foreground transition-transform active:scale-[0.98]" data-testid="link-action-send">Send</Link>
            </div>

            <Panel title="Node health" meta={<span className="font-bold uppercase text-warn">{n.network}</span>}>
              <div className="flex items-center gap-3">
                <Radio className={cn('h-5 w-5', n.connected ? 'text-ok' : 'text-destructive')} />
                <div className="text-sm" data-testid="text-node-message">{n.message}</div>
              </div>
              <div className="mt-4">
                <div className="flex justify-between text-xs text-muted-foreground"><span>Sync</span><span>{prog != null ? `${(Math.floor(prog * 10000) / 100).toFixed(2)}%` : 'unknown'}</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full origin-left rounded-full bg-primary transition-transform duration-700" style={{ transform: `scaleX(${prog ?? 0})` }} />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
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

            <Sheet open={picker} onOpenChange={setPicker} title="Receive into" description="Pick the wallet that should receive. Only wallets with live, fresh data can show an address." testId="sheet-receive-picker">
              <ul className="mt-4 space-y-1">
                {d.wallets.map((w) => {
                  const why = receiveBlock(w, fresh, online);
                  return (
                    <li key={w.id}><SheetAction icon={<ArrowDownToLine />} label={w.label} sub={why ?? (w.kind === 'temporary' ? `Temporary · ${remaining(w.expiresAt).label} left` : kindLabel(w.kind))} disabled={!!why} onClick={() => { setPicker(false); setRecvId(w.id); }} testId={`button-receive-pick-${w.id}`} /></li>
                  );
                })}
              </ul>
            </Sheet>
            {recvWallet && <ReceiveDialog wallet={recvWallet} freshness={fresh} open={!!recvId} onOpenChange={(o) => !o && setRecvId(null)} />}

            <div className="grid gap-4 md:grid-cols-3">
              <Panel title="Services" className="md:col-span-3">
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
              <Panel title="Recent activity" meta={<Link href="/transactions" className="hover:text-primary" data-testid="link-all-tx">view all</Link>} bodyClass="p-0">
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
              <Panel title="Vault log" bodyClass="p-0">
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

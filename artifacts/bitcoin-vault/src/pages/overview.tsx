import { useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { ArrowDownToLine, Boxes, Eye, EyeOff, FlaskConical, ScanSearch } from 'lucide-react';
import { Sheet, SheetAction, kindLabel } from '@/components/sheet';
import { NodeSync } from '@/components/node-sync';
import { ReceiveDialog, receiveBlock, useOnline, type Freshness } from '@/components/receive';
import { TxRow } from '@/components/tx-row';
import { useGetVaultDashboard, getGetVaultDashboardQueryKey, useGetMarket, getGetMarketQueryKey, type Wallet } from '@workspace/api-client-react';
import { Empty, ErrorPanel, Panel, Pill, Skel, Stat, statusTone } from '@/components/kit';
import { POLL_MS, ago, remaining, satsGrouped, satsToBtc, stamp, toBig } from '@/lib/vault';
import { LIVE_HERO } from '@/lib/assets';
import { cn } from '@/lib/utils';

const isMainnet = (n: string) => /^(main|mainnet|bitcoin)$/i.test(n);
const netLabel = (n: string) => (isMainnet(n) ? 'Bitcoin Mainnet' : `${n} · test network`);

/** USD valuation from a real provider quote; integer cents via BigInt, no invented figure. */
function usdOf(sats: string, price: number | null | undefined, currency: string): string | null {
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  const cents = (toBig(sats) * BigInt(Math.round(price * 100))) / 100000000n;
  const whole = cents / 100n; const frac = (cents % 100n).toString().padStart(2, '0');
  return `${whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${frac} ${currency.toUpperCase()}`;
}

function walletTotal(ws: Wallet[], kind: string) {
  return ws.filter((w) => w.kind === kind).reduce((a, w) => a + toBig(w.confirmedSats), 0n);
}

export default function Overview() {
  const q = useGetVaultDashboard({ query: { queryKey: getGetVaultDashboardQueryKey(), refetchInterval: POLL_MS } });
  const m = useGetMarket({ query: { queryKey: getGetMarketQueryKey(), refetchInterval: POLL_MS } });
  const d = q.data;
  const [hide, setHide] = useState(false);
  const [picker, setPicker] = useState(false);
  const [recvId, setRecvId] = useState<string | null>(null);
  const online = useOnline();
  const fresh: Freshness = { nodeConnected: d?.node.connected, dataUpdatedAt: q.dataUpdatedAt, isError: q.isError };
  const recvWallet = d?.wallets.find((w) => w.id === recvId) ?? null;
  const mask = (v: ReactNode) => (hide ? <span aria-label="hidden">••••••</span> : v);

  return (
    <div className="mx-auto max-w-[760px] space-y-5 lg:max-w-none">
      <header className="rise">
        <div className="text-[12.5px] font-medium text-muted-foreground">Live · {d ? netLabel(d.node.network) : 'connecting'}</div>
        <h1 className="font-display mt-1 text-[1.95rem] font-bold leading-tight tracking-tight md:text-[2.35rem]" data-testid="text-page-title">Your vault</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">A clear view of your Bitcoin.</p>
      </header>

      {q.isError && <ErrorPanel error={q.error} onRetry={() => q.refetch()} title={d ? 'Reconnecting: showing last loaded data' : 'Vault dashboard unavailable'} />}
      {q.isLoading && <div className="grid gap-4" data-testid="status-loading"><Skel className="h-80" /><Skel className="h-56" /></div>}

      {d && (() => {
        const n = d.node;
        const unknown = !n.connected || q.isError || !online;
        const available = d.wallets.reduce((total, wallet) => total + toBig(wallet.availableSats), 0n).toString();
        const usd = isMainnet(n.network) && !m.isError && m.data?.available && !m.data.stale ? usdOf(available, m.data.price, m.data.currency) : null;
        const temp = d.wallets.filter((w) => w.kind === 'temporary');
        const prog = n.syncProgress != null ? Math.max(0, Math.min(1, n.syncProgress)) : null;
        const ready = !unknown && d.wallets.some((w) => !receiveBlock(w, fresh, online));
        return (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
            <div className="space-y-5">
              <section className="rise rounded-[20px] border border-card-border bg-card p-5 md:p-6" data-testid="card-balance">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[13px] font-medium text-muted-foreground">Available balance</div>
                    <div className="mt-0.5 text-[12.5px] text-muted-foreground">{netLabel(n.network)}</div>
                  </div>
                  <button onClick={() => setHide((h) => !h)} className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground hover:bg-muted" aria-label={hide ? 'Show balances' : 'Hide balances'} data-testid="button-toggle-privacy">{hide ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button>
                </div>
                <div className="mt-3" data-testid="text-confirmed-total">
                  {unknown ? (
                    <div>
                      <div className="font-display text-[1.9rem] font-bold leading-tight">Balance unknown</div>
                      <p className="mt-1 text-[13.5px] text-muted-foreground">{n.connected ? 'The dashboard could not refresh.' : 'Your node is not connected.'} The last figure is not shown as current. Nothing is assumed to be zero.</p>
                    </div>
                  ) : (
                    <>
                      <div className="break-words font-mono text-[1.8rem] font-semibold leading-none tracking-tight tabular-nums md:text-[2.4rem]">{mask(`${satsToBtc(available)} BTC`)}</div>
                      <div className="mt-2 font-mono text-[14px] text-muted-foreground">{mask(`${satsGrouped(available)} sats available`)}</div>
                      <div className="mt-1 text-[13px] text-muted-foreground" data-testid="text-usd-value">
                        {!isMainnet(n.network) ? 'Test coins have no monetary value.' : usd ? <>{mask(`≈ ${usd}`)} · {m.data?.source}</> : `${m.data?.currency?.toUpperCase() ?? 'USD'}: Unavailable · ${m.isError ? 'price feed unreachable' : m.data?.stale ? 'quote is stale' : 'no current quote'}`}
                      </div>
                    </>
                  )}
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 rounded-[16px] bg-muted p-4 text-[13px]">
                  <div><div className="text-muted-foreground">Confirmed</div><div className="mt-1 font-mono">{unknown ? 'Unknown' : mask(`${satsToBtc(d.confirmedSats)} BTC`)}</div></div>
                  <div><div className="text-muted-foreground">Pending</div><div className="mt-1 break-words font-mono text-warn">{unknown ? 'Unknown' : mask(`${satsToBtc(d.unconfirmedSats)} BTC`)}</div></div>
                </div>
                <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">Pending funds are excluded from available until confirmed. Spending limits come from your server policy.</p>
                <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                  <button disabled={!ready} onClick={() => setPicker(true)} className="h-12 rounded-[14px] bg-primary text-[15px] font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-50" data-testid="button-action-receive">{isMainnet(n.network) ? 'Receive Bitcoin' : 'Receive test Bitcoin'}</button>
                  <Link href="/spending" className="grid h-12 place-items-center rounded-[14px] bg-primary/90 text-[15px] font-semibold text-primary-foreground transition-transform active:scale-[0.98]" data-testid="link-action-send">Send</Link>
                </div>
                <p className="mt-3 text-[12.5px] text-muted-foreground" data-testid="text-readiness">Receive: {ready ? 'ready' : 'not ready, a fresh node connection is required'} · Send: checks run at review.</p>
              </section>

              <Panel title="Recent activity" meta={<Link href="/transactions" className="font-semibold text-foreground underline underline-offset-4" data-testid="link-all-tx">View all</Link>}>
                {d.transactions.length === 0 ? <Empty icon={<Boxes className="h-5 w-5" />} title="No activity yet" body="Nothing has moved through this vault on its node." /> : (
                  <ul className="divide-y divide-border">{d.transactions.slice(0, 5).map((t) => <TxRow key={t.txid + t.walletId} t={t} testKey={`${t.txid}-${t.walletId}`} />)}</ul>
                )}
              </Panel>

              <Panel title="Configured wallets" meta={<span>{d.wallets.length} wallets · {netLabel(n.network)}</span>}>
                <ul className="grid gap-2.5">
                  {d.wallets.filter((w) => w.kind !== 'temporary').map((w) => (
                    <li key={w.id}><Link href={`/wallets/${w.id}`} className="flex items-center justify-between gap-3 rounded-[16px] bg-muted px-4 py-3.5 hover:bg-muted/70" data-testid={`row-main-wallet-${w.id}`}>
                      <div className="min-w-0"><div className="truncate text-[14.5px] font-semibold">{w.label}</div><div className="text-[12.5px] text-muted-foreground">{kindLabel(w.kind)}</div></div>
                      <div className="text-right font-mono text-[13px]">{unknown ? 'Unknown' : mask(`${satsToBtc(w.confirmedSats)} BTC`)}<div className="font-sans text-[12px] capitalize text-muted-foreground">{w.status}</div></div>
                    </Link></li>
                  ))}
                  <li><Link href="/wallets" className="flex items-center justify-between gap-3 rounded-[16px] bg-muted px-4 py-3.5 hover:bg-muted/70" data-testid="link-receiving-wallets">
                    <div><div className="text-[14.5px] font-semibold">Temporary receiving</div><div className="text-[12.5px] text-muted-foreground">{temp.length} active or expired · {temp.filter((w) => { const r = remaining(w.expiresAt); return r.ms > 0 && r.ms < 43200000; }).length} under 12h</div></div>
                    <div className="font-mono text-[13px]">{unknown ? 'Unknown' : mask(`${satsToBtc(walletTotal(d.wallets, 'temporary'))} BTC`)}</div>
                  </Link></li>
                </ul>
                <Link href="/wallets" className="mt-4 inline-block text-[14px] font-semibold underline underline-offset-4" data-testid="link-see-all-wallets">Manage wallets</Link>
              </Panel>
            </div>

            <div className="space-y-5">
              <NodeSync />
              <Panel title="Workspace status" meta={<Pill tone={n.connected ? 'ok' : 'bad'} dot testId="status-node">{n.connected ? 'Node live' : 'Node offline'}</Pill>}>
                <p className="rounded-[16px] bg-muted p-4 text-[13.5px] leading-relaxed" data-testid="text-node-message">{n.message}</p>
                <div className="mt-4">
                  <div className="flex justify-between text-[12.5px] text-muted-foreground"><span>Blockchain sync</span><span className="font-mono">{prog != null ? `${(Math.floor(prog * 10000) / 100).toFixed(2)}%` : 'unknown'}</span></div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full origin-left rounded-full bg-primary transition-transform duration-700" style={{ transform: `scaleX(${prog ?? 0})` }} /></div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Stat label="Verified blocks"><span className="font-mono text-[13.5px]">{n.blocks?.toLocaleString() ?? '—'}</span></Stat>
                  <Stat label="Known headers"><span className="font-mono text-[13.5px]">{n.headers?.toLocaleString() ?? '—'}</span></Stat>
                  <Stat label="Peers"><span className="font-mono text-[13.5px]">{n.peers ?? '—'}</span></Stat>
                  <Stat label="Last sync"><span className="text-[13.5px]" title={stamp(n.lastSync)}>{ago(n.lastSync)}</span></Stat>
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  <Pill tone={statusTone(n.recoveryStatus)}>recovery {n.recoveryStatus}</Pill>
                  <Pill tone={d.mainnetEnabled ? 'ember' : 'neutral'}>mainnet {d.mainnetEnabled ? 'on' : 'disabled'}</Pill>
                  <Pill tone={d.destructionEnabled ? 'ember' : 'neutral'}>destruction {d.destructionEnabled ? 'on' : 'disabled'}</Pill>
                </div>
                {d.services.length > 0 && (
                  <ul className="mt-4 grid gap-2">
                    {d.services.map((s) => (
                      <li key={s.name} className="flex items-start justify-between gap-2 rounded-[14px] border border-border px-3.5 py-2.5" data-testid={`card-service-${s.name}`}>
                        <div className="min-w-0"><div className="text-[13.5px] font-medium">{s.name}</div><div className="truncate text-[12px] text-muted-foreground">{s.message}</div></div>
                        <Pill tone={statusTone(s.status)}>{s.status}</Pill>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel title="Vault log" bodyClass="p-0 pb-2">
                {d.activity.length === 0 ? <p className="p-5 text-[13.5px] text-muted-foreground">No activity recorded.</p> : (
                  <ol className="max-h-[360px] overflow-auto px-5 py-3">
                    {d.activity.map((a) => (
                      <li key={a.id} className="flex gap-3 py-2">
                        <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', { ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-destructive', cold: 'bg-cold', neutral: 'bg-muted-foreground', ember: 'bg-accent' }[statusTone(a.severity)])} />
                        <div className="min-w-0"><div className="text-[13.5px] font-medium">{a.title}</div><div className="text-[12.5px] text-muted-foreground">{a.message}</div><div className="font-mono text-[11px] text-muted-foreground/70">{ago(a.createdAt)}</div></div>
                      </li>
                    ))}
                  </ol>
                )}
              </Panel>

              <section className="rise relative overflow-hidden rounded-[20px] border border-card-border bg-card">
                <img src={LIVE_HERO} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-35" />
                <div className="relative bg-gradient-to-t from-card via-card/85 to-transparent p-5 pt-24">
                  <h2 className="font-display text-[22px] font-bold leading-tight">Your Bitcoin, clearly tracked.</h2>
                  <p className="mt-1 text-[13.5px] text-muted-foreground">Check the network before sending. Wallet readiness is separate from sync.</p>
                  <div className="mt-4 grid gap-2">
                    <Link href="/explorer" className="flex h-11 items-center justify-center gap-2 rounded-[14px] bg-muted text-[14px] font-semibold hover:bg-muted/70" data-testid="link-overview-explorer"><ScanSearch className="h-4 w-4" /> Explorer</Link>
                    <Link href="/sandbox" className="flex h-11 items-center justify-center gap-2 rounded-[14px] border border-warn/40 text-[14px] font-semibold text-warn hover:bg-warn/10" data-testid="link-overview-sandbox"><FlaskConical className="h-4 w-4" /> Switch to Sandbox</Link>
                  </div>
                </div>
              </section>
            </div>

            <Sheet open={picker} onOpenChange={setPicker} title="Receive into" description="Pick the wallet that should receive. Only wallets with live, fresh data can show an address." testId="sheet-receive-picker">
              <ul className="mt-4 space-y-1">
                {d.wallets.map((w) => {
                  const why = receiveBlock(w, fresh, online);
                  return <li key={w.id}><SheetAction icon={<ArrowDownToLine />} label={w.label} sub={why ?? (w.kind === 'temporary' ? `Temporary · ${remaining(w.expiresAt).label} left` : kindLabel(w.kind))} disabled={!!why} onClick={() => { setPicker(false); setRecvId(w.id); }} testId={`button-receive-pick-${w.id}`} /></li>;
                })}
              </ul>
            </Sheet>
            {recvWallet && <ReceiveDialog wallet={recvWallet} freshness={fresh} open={!!recvId} onOpenChange={(o) => !o && setRecvId(null)} />}
          </div>
        );
      })()}
    </div>
  );
}

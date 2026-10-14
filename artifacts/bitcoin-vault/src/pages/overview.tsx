import { useState } from 'react';
import { Link } from 'wouter';
import { ArrowDownToLine, ArrowUpFromLine, Eye, EyeOff, ScanSearch } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ReceiveDialog, receiveBlock, useOnline, type Freshness } from '@/components/receive';
import { Boxes, Radio, Snowflake, Flame, Timer } from 'lucide-react';
import { useGetVaultDashboard, getGetVaultDashboardQueryKey, type Wallet } from '@workspace/api-client-react';
import { Btc, Empty, ErrorPanel, Panel, Pill, Skel, Stat, statusTone } from '@/components/kit';
import { POLL_MS, ago, remaining, short, toBig } from '@/lib/vault';
import { cn } from '@/lib/utils';
import { SignetSetupLink } from '@/components/signet-setup-link';

function sumKind(ws: Wallet[], kind: string) {
  return ws.filter((w) => w.kind === kind).reduce((a, w) => a + toBig(w.confirmedSats), 0n);
}

export default function Overview() {
  const q = useGetVaultDashboard({ query: { queryKey: getGetVaultDashboardQueryKey(), refetchInterval: POLL_MS } });
  const d = q.data;

  const [hide, setHide] = useState(false);
  const [picker, setPicker] = useState(false);
  const [recvId, setRecvId] = useState<string | null>(null);
  const online = useOnline();
  const fresh: Freshness = { nodeConnected: d?.node.connected, dataUpdatedAt: q.dataUpdatedAt, isError: q.isError };
  const recvWallet = d?.wallets.find((w) => w.id === recvId) ?? null;

  return (
    <div className="space-y-6">
      <SignetSetupLink />
      {q.isError && <ErrorPanel error={q.error} onRetry={() => q.refetch()} title="Dashboard unavailable" />}
      {q.isLoading && <div className="grid gap-4"><Skel className="h-72" /><Skel className="h-64" /></div>}

      {d && (() => {
        const temp = d.wallets.filter((w) => w.kind === 'temporary');
        const soon = temp.filter((w) => { const r = remaining(w.expiresAt); return r.ms > 0 && r.ms < 12 * 3600000; }).length;
        const expired = temp.filter((w) => w.status.toLowerCase() === 'expired' || remaining(w.expiresAt).ms <= 0).length;
        const n = d.node;
        const prog = n.syncProgress != null ? Math.max(0, Math.min(1, n.syncProgress)) : null;
        const main = d.wallets.filter((w) => w.kind !== 'temporary');
        const actions = [
          { label: 'Receive', icon: ArrowDownToLine, onClick: () => setPicker(true), testId: 'button-action-receive' },
          { label: 'Send', icon: ArrowUpFromLine, href: '/spending', testId: 'link-action-send' },
          { label: 'Wallets', icon: Boxes, href: '/wallets', testId: 'link-action-wallets' },
          { label: 'Explorer', icon: ScanSearch, href: '/explorer', testId: 'link-action-explorer' },
        ];
        return (
          <>
            <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
              <section className="rise rounded-[32px] bg-card p-6 shadow-[0_8px_30px_-16px_hsl(232_30%_20%/0.25)] md:p-8">
                <div className="flex items-center justify-between">
                  <div className="text-[15px] font-bold">Portfolio</div>
                  <Pill tone={n.connected ? 'ok' : 'bad'} dot testId="status-node">{n.connected ? 'Node connected' : 'Node disconnected'}</Pill>
                </div>
                <div className="mt-3 flex items-center gap-3" data-testid="text-confirmed-total">
                  {!n.connected || q.isError ? <span className="font-display text-2xl font-bold">Balance unavailable</span> : hide ? <span className="font-display text-[2.6rem] font-extrabold leading-none tracking-tight md:text-6xl">••••••</span> : <Btc sats={d.confirmedSats} size="xl" className="font-display font-extrabold tracking-tight" />}
                  <button onClick={() => setHide((h) => !h)} className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted" aria-label={hide ? 'Show balances' : 'Hide balances'} data-testid="button-toggle-privacy">{hide ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button>
                </div>
                <div className="mt-2 text-sm text-muted-foreground">{!n.connected || q.isError ? 'Connect your node to verify balances. No balance is assumed.' : <>Confirmed on {n.network} · pending {hide ? '••••' : <Btc sats={d.unconfirmedSats} size="sm" className="font-semibold text-warn" />}</>}</div>
                <div className="mt-7 grid grid-cols-4 gap-2">
                  {actions.map((a) => {
                    const inner = <><span className="grid h-14 w-14 place-items-center rounded-full bg-muted text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))] transition-transform group-active:scale-95 md:h-16 md:w-16"><a.icon className="h-5 w-5" /></span><span className="text-[12.5px] font-semibold text-muted-foreground">{a.label}</span></>;
                    return a.href
                      ? <Link key={a.label} href={a.href} className="group flex flex-col items-center gap-2" data-testid={a.testId}>{inner}</Link>
                      : <button key={a.label} onClick={a.onClick} className="group flex flex-col items-center gap-2" data-testid={a.testId}>{inner}</button>;
                  })}
                </div>
              </section>

              <Panel title="My wallets" meta={<Link href="/wallets" className="font-semibold text-primary" data-testid="link-see-all-wallets">See all</Link>} bodyClass="p-2 pt-1">
                <ul className="divide-y divide-border">
                  {main.length === 0 && <li className="p-4 text-sm text-muted-foreground">No cold or spending wallets reported.</li>}
                  {main.map((w) => (
                    <li key={w.id}><Link href={`/wallets/${w.id}`} className="flex items-center gap-3 rounded-2xl px-3 py-3 hover:bg-muted/60" data-testid={`row-main-wallet-${w.id}`}>
                      <span className={cn('grid h-10 w-10 place-items-center rounded-full', w.kind === 'cold' ? 'bg-primary/12 text-primary' : 'bg-accent/20 text-warn')}>{w.kind === 'cold' ? <Snowflake className="h-4 w-4" /> : <Flame className="h-4 w-4" />}</span>
                      <div className="min-w-0 flex-1"><div className="truncate font-semibold">{w.label}</div><div className="text-xs capitalize text-muted-foreground">{w.kind === 'cold' ? 'Cold storage' : 'Spending'}</div></div>
                      <div className="text-right">{hide ? <span className="text-sm">••••</span> : <Btc sats={w.confirmedSats} size="sm" className="font-semibold" />}</div>
                    </Link></li>
                  ))}
                  <li className="flex items-center justify-between px-3 py-3 text-sm"><span className="text-muted-foreground">Receiving wallets · {temp.length}</span>{hide ? '••••' : <Btc sats={sumKind(d.wallets, 'temporary')} size="sm" className="font-semibold" />}</li>
                </ul>
              </Panel>
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

            <Dialog open={picker} onOpenChange={setPicker}>
              <DialogContent className="max-w-md rounded-[28px] bg-card">
                <DialogTitle className="text-lg font-bold">Receive into</DialogTitle>
                <DialogDescription>Pick the wallet that should receive. Only wallets with live, fresh data can show an address.</DialogDescription>
                <ul className="mt-2 max-h-[60dvh] space-y-1.5 overflow-auto">
                  {d.wallets.map((w) => {
                    const why = receiveBlock(w, fresh, online);
                    return (
                      <li key={w.id}><button disabled={!!why} onClick={() => { setPicker(false); setRecvId(w.id); }} className="flex w-full items-center gap-3 rounded-2xl bg-muted/60 px-4 py-3 text-left transition-colors hover:bg-muted disabled:opacity-50" data-testid={`button-receive-pick-${w.id}`}>
                        <div className="min-w-0 flex-1"><div className="truncate font-semibold">{w.label}</div><div className="truncate text-xs text-muted-foreground">{why ?? (w.kind === 'temporary' ? `Temporary · ${remaining(w.expiresAt).label} left` : w.kind === 'cold' ? 'Cold storage' : 'Spending')}</div></div>
                        <ArrowDownToLine className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button></li>
                    );
                  })}
                </ul>
              </DialogContent>
            </Dialog>
            {recvWallet && <ReceiveDialog wallet={recvWallet} freshness={fresh} open={!!recvId} onOpenChange={(o) => !o && setRecvId(null)} />}

            <div className="grid gap-4 md:grid-cols-3">
              <Panel title="Receiving wallets"><div className="flex items-baseline gap-2"><span className="font-display text-4xl font-extrabold" data-testid="text-temp-count">{temp.length}</span><span className="text-sm text-muted-foreground">temporary wallets</span></div>
                <div className="mt-3 flex gap-2"><Pill tone="warn"><Timer className="h-3 w-3" />{soon} under 12h</Pill><Pill tone="neutral">{expired} expired</Pill></div></Panel>
              <Panel title="Services" className="md:col-span-2">
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

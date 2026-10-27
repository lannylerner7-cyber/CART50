import { useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Pencil, Trash2 } from 'lucide-react';
import { useGetWallet, useUpdateWallet, useDeleteWalletHistory, useGetVaultDashboard, getGetVaultDashboardQueryKey, useListTransactions, getListTransactionsQueryKey, getGetWalletQueryKey, getListWalletsQueryKey } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ReceiveDialog, receiveBlock, useOnline, NetworkBadge, BtcGlyph, type Freshness } from '@/components/receive';
import { Btc, ErrorPanel, Panel, Pill, Skel, SkelRows, statusTone } from '@/components/kit';
import { Sheet, SheetAction, kindLabel } from '@/components/sheet';
import { TxRow } from '@/components/tx-row';
import { keyLedger } from '@/lib/ledger-keys';
import { POLL_MS, ago, remaining, stamp, toBig, useCsrf, useSession } from '@/lib/vault';
import { useToast } from '@/hooks/use-toast';

export default function WalletDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const [, nav] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const csrf = useCsrf();
  const q = useGetWallet(id, { query: { enabled: !!id, queryKey: getGetWalletQueryKey(id), refetchInterval: POLL_MS } });
  const update = useUpdateWallet(csrf);
  const del = useDeleteWalletHistory(csrf);
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState('');
  const [confirm, setConfirm] = useState(false);
  const w = q.data;
  const session = useSession();
  const online = useOnline();
  const dash = useGetVaultDashboard({ query: { queryKey: getGetVaultDashboardQueryKey(), refetchInterval: POLL_MS } });
  const [recv, setRecv] = useState(false);
  const fresh: Freshness = { nodeConnected: dash.isError ? false : dash.data?.node.connected, dataUpdatedAt: Math.min(q.dataUpdatedAt, dash.dataUpdatedAt || 0), isError: q.isError || dash.isError };
  const why = w ? receiveBlock(w, fresh, online) : 'Loading';

  const save = () => update.mutate({ id, data: { label: label.trim() } }, {
    onSuccess: (nw) => { qc.setQueryData(getGetWalletQueryKey(id), nw); qc.invalidateQueries({ queryKey: getListWalletsQueryKey() }); setEditing(false); toast({ title: 'Wallet renamed' }); },
  });

  const remove = () => del.mutate({ id }, {
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: getListWalletsQueryKey() }); toast({ title: 'History deleted', description: r.message }); nav('/wallets'); },
    onError: () => setConfirm(false),
  });

  const r = remaining(w?.expiresAt);
  const expired = w?.status.toLowerCase() === 'expired';
  const empty = w ? toBig(w.confirmedSats) === 0n && toBig(w.unconfirmedSats) === 0n : false;
  const total = 120 * 3600000;
  const frac = w?.expiresAt ? Math.max(0, Math.min(1, r.ms / total)) : 0;

  const txq = useListTransactions({ query: { queryKey: getListTransactionsQueryKey(), refetchInterval: POLL_MS } });
  const txs = useMemo(() => keyLedger((txq.data ?? []).filter((t) => t.walletId === id)).sort((a, b) => Date.parse(b.row.firstSeen) - Date.parse(a.row.firstSeen)), [txq.data, id]);
  const [actions, setActions] = useState(false);

  return (
    <div className="space-y-7 pb-28 md:pb-0">
      <div className="flex items-center justify-between">
        <Link href="/wallets" className="circle-btn h-12 w-12" aria-label="Back to wallets" data-testid="link-back"><ArrowLeft className="h-5 w-5" /></Link>
        <span className="font-mono text-[13px] font-bold uppercase tracking-[0.14em] text-muted-foreground">BTC</span>
        <button className="circle-btn h-12 w-12 disabled:opacity-40" disabled={!w} onClick={() => { if (w) { setLabel(w.label); setEditing(true); } }} aria-label="Rename wallet" data-testid="button-rename"><Pencil className="h-4 w-4" /></button>
      </div>
      {q.isError && <ErrorPanel error={q.error} onRetry={() => q.refetch()} title="Wallet unavailable" />}
      {q.isLoading && <div className="space-y-4"><Skel className="h-40" /><Skel className="h-56" /></div>}
      {w && (
        <>
          <header className="rise flex items-center gap-4">
            <BtcGlyph className="h-14 w-14 rounded-full" />
            <div className="min-w-0">
              <h1 className="font-display truncate text-[28px] font-semibold leading-tight" data-testid="text-page-title">{w.label}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="text-sm text-muted-foreground">{kindLabel(w.kind)}</span>
                <Pill tone={statusTone(w.status)} dot testId="status-wallet">{w.status}</Pill>
                <Pill tone={statusTone(w.destructionStatus)} testId="status-destruction">destruction {w.destructionStatus}</Pill>
              </div>
            </div>
          </header>
          <NetworkBadge network={session.network} />

          <div className="grid gap-8 lg:grid-cols-2">
            <section>
              <h2 className="font-display text-[22px] font-semibold">Balance</h2>
              <div className="mt-2"><Btc sats={w.availableSats} size="xl" className="font-display font-medium" /></div>
              <div className="mt-1 text-sm text-muted-foreground">available · last sync {ago(w.lastSync)}</div>
              <dl className="mt-6 grid grid-cols-1 gap-x-6 min-[420px]:grid-cols-2 gap-y-5">
                <div><dt className="dotted-label text-[13px] text-muted-foreground">Confirmed</dt><dd className="mt-1"><Btc sats={w.confirmedSats} size="md" /></dd></div>
                <div><dt className="dotted-label text-[13px] text-muted-foreground">Pending</dt><dd className="mt-1"><Btc sats={w.unconfirmedSats} size="md" className="text-warn" /></dd></div>
                <div><dt className="dotted-label text-[13px] text-muted-foreground">Total received</dt><dd className="mt-1"><Btc sats={w.totalReceivedSats} size="md" className="text-ok" /></dd></div>
                <div><dt className="dotted-label text-[13px] text-muted-foreground">Total swept</dt><dd className="mt-1"><Btc sats={w.totalSweptSats} size="md" /></dd></div>
              </dl>
              {why && <p className="mt-5 rounded-2xl bg-card px-4 py-3 text-xs text-muted-foreground" data-testid="text-receive-blocked">Receiving paused: {why}</p>}

              {w.expiresAt && (
                <div className="mt-8 rounded-[24px] bg-card p-5">
                  <div className="flex items-baseline justify-between"><span className="text-sm text-muted-foreground">Expires in</span><span className="font-mono text-xs text-muted-foreground">{stamp(w.expiresAt)}</span></div>
                  <div className="font-display mt-1 text-3xl font-semibold" data-testid="text-expiry">{r.label}</div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full origin-left bg-accent transition-transform" style={{ transform: `scaleX(${frac})` }} /></div>
                  <div className="mt-2 font-mono text-[11px] text-muted-foreground">120 hour window · created {stamp(w.createdAt)}</div>
                </div>
              )}
            </section>

            <section>
              <div className="flex items-center justify-between">
                <h2 className="font-display text-[22px] font-semibold">Transactions</h2>
                <Link href={`/transactions?wallet=${encodeURIComponent(w.id)}`} className="grid h-10 w-10 place-items-center rounded-full hover:bg-muted" aria-label="All transactions for this wallet" data-testid="link-wallet-transactions"><ArrowRight className="h-5 w-5" /></Link>
              </div>
              {txq.isLoading ? <SkelRows rows={3} /> : txq.isError ? <ErrorPanel error={txq.error} onRetry={() => txq.refetch()} title="History unavailable" /> : txs.length === 0 ? (
                <p className="mt-3 rounded-[22px] border border-dashed border-border px-5 py-6 text-sm text-muted-foreground" data-testid="status-wallet-tx-empty">Your node has not seen any transactions for this wallet yet.</p>
              ) : (
                <ul className="mt-2">{txs.slice(0, 6).map(({ row, key }) => <TxRow key={key} testKey={key} t={row} />)}</ul>
              )}
            </section>
          </div>

          {w.kind === 'temporary' && (
            <Panel title="History">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  {expired ? (empty ? (w.destructionStatus === 'completed' ? 'Expired, empty and destruction verified. Its local history record can be deleted.' : 'Expired. A displayed zero balance is not proof of safe destruction. Keys remain until fresh node checks verify drainage and settlement, and storage-key destruction is verified.') : 'Expired but still holds funds. Keys are retained while funds are drained; there is no strict destruction deadline.') : 'Expires after 120 hours. Keys must be retained until drainage, settlement and storage-key destruction are verified.'}
                  {' '}Late deposits after key destruction may be permanently lost. Public Bitcoin history cannot be erased.
                </p>
                <Button variant="destructive" size="sm" className="gap-1.5 rounded-full" disabled={!expired || !empty || w.destructionStatus !== 'completed' || del.isPending} onClick={() => setConfirm(true)} data-testid="button-delete-history"><Trash2 className="h-3.5 w-3.5" /> Delete history</Button>
              </div>
              {del.isError && <div className="mt-3"><ErrorPanel error={del.error} title="Delete failed" /></div>}
            </Panel>
          )}

          <div className="fixed inset-x-4 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.25rem)] z-30 md:static md:inset-auto md:max-w-sm">
            <button onClick={() => setActions(true)} className="h-14 w-full rounded-full bg-primary text-[16px] font-bold text-primary-foreground transition-transform active:scale-[0.98]" data-testid="button-open-actions">Receive or send</button>
          </div>

          <Sheet open={actions} onOpenChange={setActions} title="Move bitcoin" hideHeader testId="sheet-wallet-actions">
            <SheetAction icon={<ArrowDown />} label="Receive bitcoin" sub={why ?? undefined} disabled={!!why} onClick={() => { setActions(false); setRecv(true); }} testId="button-open-receive" />
            <Link href="/spending" className="flex w-full items-center gap-4 rounded-2xl px-2 py-3.5 hover:bg-muted/60" data-testid="link-send"><ArrowUp className="h-5 w-5" /><span className="text-[16px] font-medium">Send bitcoin</span></Link>
          </Sheet>
          <ReceiveDialog wallet={w} freshness={fresh} open={recv && !why} onOpenChange={setRecv} />

          <Sheet open={editing} onOpenChange={setEditing} title="Rename wallet" testId="sheet-rename">
            <div className="mt-4 space-y-3">
              <Input autoFocus value={label} maxLength={64} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && label.trim() && save()} className="h-12 rounded-2xl" data-testid="input-rename" />
              {update.isError && <ErrorPanel error={update.error} />}
              <button disabled={!label.trim() || update.isPending} onClick={save} className="h-14 w-full rounded-full bg-primary font-bold text-primary-foreground disabled:opacity-40" data-testid="button-save-rename">{update.isPending ? 'Saving' : 'Save'}</button>
              <button onClick={() => setEditing(false)} className="pill-btn h-14 w-full" data-testid="button-cancel-rename">Cancel</button>
            </div>
          </Sheet>

          <AlertDialog open={confirm} onOpenChange={setConfirm}>
            <AlertDialogContent className="bg-card">
              <AlertDialogHeader>
                <AlertDialogTitle className="font-display">Delete history for {w.label}?</AlertDialogTitle>
                <AlertDialogDescription>Permanently removes this expired local history entry after verified key destruction. Main-vault balances, its outgoing history and public Bitcoin records remain unchanged. This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-cancel-delete">Keep</AlertDialogCancel>
                <AlertDialogAction onClick={(e) => { e.preventDefault(); remove(); }} className="bg-destructive text-destructive-foreground" data-testid="button-confirm-delete">{del.isPending ? 'Deleting' : 'Delete history'}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}

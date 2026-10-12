import { useState } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { useGetWallet, useUpdateWallet, useDeleteWalletHistory, getGetWalletQueryKey, getListWalletsQueryKey } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Btc, CopyText, ErrorPanel, PageHeader, Panel, Pill, Skel, Stat, statusTone } from '@/components/kit';
import { POLL_MS, ago, remaining, stamp, toBig, useCsrf } from '@/lib/vault';
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

  return (
    <div className="space-y-6">
      <Link href="/wallets" className="inline-flex items-center gap-1 font-mono text-[11px] uppercase text-muted-foreground hover:text-primary" data-testid="link-back"><ArrowLeft className="h-3.5 w-3.5" /> wallets</Link>
      {q.isError && <ErrorPanel error={q.error} onRetry={() => q.refetch()} title="Wallet unavailable" />}
      {q.isLoading && <div className="grid gap-4 md:grid-cols-[320px_1fr]"><Skel className="h-80" /><Skel className="h-80" /></div>}
      {w && (
        <>
          <PageHeader kicker={`${w.kind} wallet · ${w.id}`} title={w.label}
            actions={<>
              <Pill tone={statusTone(w.status)} dot testId="status-wallet">{w.status}</Pill>
              <Pill tone={statusTone(w.destructionStatus)} testId="status-destruction">destruction {w.destructionStatus}</Pill>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setLabel(w.label); setEditing(true); }} data-testid="button-rename"><Pencil className="h-3.5 w-3.5" /> Rename</Button>
            </>} />

          {editing && (
            <Panel title="rename">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input autoFocus value={label} maxLength={64} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && label.trim() && save()} data-testid="input-rename" />
                <Button disabled={!label.trim() || update.isPending} onClick={save} data-testid="button-save-rename">{update.isPending ? 'Saving' : 'Save'}</Button>
                <Button variant="ghost" onClick={() => setEditing(false)} data-testid="button-cancel-rename">Cancel</Button>
              </div>
              {update.isError && <div className="mt-3"><ErrorPanel error={update.error} /></div>}
            </Panel>
          )}

          <div className="grid gap-4 md:grid-cols-[320px_1fr]">
            <Panel title="receive" bodyClass="flex flex-col items-center gap-4 p-6">
              {w.address && !expired ? (
                <>
                  <div className="rounded-md border border-border bg-[hsl(40_45%_97%)] p-4"><QRCodeSVG value={`bitcoin:${w.address}`} size={200} bgColor="transparent" fgColor="hsl(224 38% 12%)" level="M" data-testid="img-qr" /></div>
                  <CopyText value={w.address} className="max-w-full break-all text-center" />
                </>
              ) : (
                <div className="hatch grid h-[232px] w-[232px] place-items-center rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  {expired ? 'Expired. Do not share this address for new payments.' : 'No address derived for this wallet.'}
                </div>
              )}
            </Panel>

            <div className="space-y-4">
              <Panel title="balances">
                <div className="grid grid-cols-2 gap-5 lg:grid-cols-3">
                  <Stat label="confirmed"><Btc sats={w.confirmedSats} size="lg" /></Stat>
                  <Stat label="pending"><Btc sats={w.unconfirmedSats} size="lg" className="text-warn" /></Stat>
                  <Stat label="available"><Btc sats={w.availableSats} size="lg" /></Stat>
                  <Stat label="total received"><Btc sats={w.totalReceivedSats} /></Stat>
                  <Stat label="total swept"><Btc sats={w.totalSweptSats} /></Stat>
                  <Stat label="last sync"><span className="text-sm">{ago(w.lastSync)}</span></Stat>
                </div>
              </Panel>
              <Panel title="expiry" meta={<span className="font-mono">120h window</span>}>
                <div className="flex items-baseline justify-between">
                  <span className="font-display text-3xl font-extrabold" data-testid="text-expiry">{r.label}</span>
                  <span className="font-mono text-xs text-muted-foreground">{stamp(w.expiresAt)}</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full origin-left bg-primary transition-transform" style={{ transform: `scaleX(${frac})` }} /></div>
                <div className="mt-2 font-mono text-[11px] text-muted-foreground">created {stamp(w.createdAt)}</div>
              </Panel>
              {w.kind === 'temporary' && (
                <Panel title="history">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted-foreground">
                      {expired ? (empty ? (w.destructionStatus === 'completed' ? 'Expired, empty and destruction verified. Its local history record can be deleted.' : 'Expired and empty. Deletion stays blocked until key destruction is verified; the destruction policy is not yet approved.') : 'Expired but still holds funds. Resolve funds before any destruction or deletion.') : 'History can be deleted only after expiration and verified key destruction. These are separate states.'}
                    </p>
                    <Button variant="destructive" size="sm" className="gap-1.5" disabled={!expired || !empty || w.destructionStatus !== 'completed' || del.isPending} onClick={() => setConfirm(true)} data-testid="button-delete-history"><Trash2 className="h-3.5 w-3.5" /> Delete history</Button>
                  </div>
                  {del.isError && <div className="mt-3"><ErrorPanel error={del.error} title="Delete failed" /></div>}
                </Panel>
              )}
            </div>
          </div>

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

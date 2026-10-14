import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { AlertTriangle, Check, Copy, Share2, ShieldAlert, X } from 'lucide-react';
import { useCreateWalletReceiveAddress, getGetWalletQueryKey, getListWalletsQueryKey, getGetVaultDashboardQueryKey, type Wallet } from '@workspace/api-client-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ErrorPanel } from '@/components/kit';
import { POLL_MS, remaining, stamp, useCsrf, useSession } from '@/lib/vault';
import { cn } from '@/lib/utils';

export function useOnline() {
  const [on, setOn] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true); const down = () => setOn(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return on;
}

export type Freshness = { nodeConnected: boolean | undefined; dataUpdatedAt: number; isError: boolean };

/** Returns null when receiving is allowed, otherwise the reason it is blocked. */
export function receiveBlock(w: Wallet, f: Freshness, online: boolean): string | null {
  const st = w.status.toLowerCase();
  const ds = w.destructionStatus.toLowerCase();
  if (!online) return 'This device is offline. Reconnect to load a live receive address.';
  if (f.isError) return 'Lost contact with the vault server. Cached addresses are not shown.';
  if (!f.dataUpdatedAt || Date.now() - f.dataUpdatedAt > POLL_MS * 3) return 'Wallet data is stale. Wait for a fresh sync before receiving.';
  if (f.nodeConnected === false) return 'Your node is disconnected. Receiving is paused until it reconnects.';
  if (f.nodeConnected === undefined) return 'Checking node status.';
  if (st.includes('expired') || remaining(w.expiresAt).ms <= 0) return 'This temporary wallet has expired. Do not share its address for new payments.';
  if (st.includes('destroy') || ds === 'completed' || ds.includes('destroy')) return 'Keys for this wallet have been destroyed. Funds sent here would be lost.';
  if (st.includes('creat') || st.includes('pending') || st.includes('deriv')) return 'This wallet is still being created.';
  return null;
}

function netLabel(n: string) {
  const v = n.toLowerCase();
  if (v === 'signet') return 'Bitcoin Signet';
  if (v === 'regtest') return 'Bitcoin Regtest';
  if (v.startsWith('test')) return 'Bitcoin Testnet';
  if (v === 'main' || v === 'mainnet' || v === 'bitcoin') return 'Bitcoin Mainnet';
  return `Bitcoin ${n}`;
}

export function NetworkBadge({ network, className }: { network: string; className?: string }) {
  const test = !/^(main|mainnet|bitcoin)$/i.test(network);
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-wide', test ? 'bg-accent/15 text-warn' : 'bg-destructive/10 text-destructive', className)} data-testid="badge-network">
      <span className="h-1.5 w-1.5 rounded-full bg-current" />{network}{test ? ' · test coins only' : ''}
    </span>
  );
}

export function BtcGlyph({ className }: { className?: string }) {
  return (
    <span className={cn('grid place-items-center rounded-xl bg-accent text-accent-foreground', className)} aria-hidden>
      <svg viewBox="0 0 24 24" className="h-[60%] w-[60%]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M8 5h6a3 3 0 0 1 0 6H8zM8 11h7a3 3 0 0 1 0 6H8zM8 5v12M10 3v2M13 3v2M10 17v2M13 17v2" /></svg>
    </span>
  );
}

export function ReceiveDialog({ wallet, freshness, open, onOpenChange }: { wallet: Wallet; freshness: Freshness; open: boolean; onOpenChange: (o: boolean) => void }) {
  const session = useSession();
  const online = useOnline();
  const qc = useQueryClient();
  const alloc = useCreateWalletReceiveAddress(useCsrf());
  const [copied, setCopied] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { if (!open) return; const t = setInterval(() => tick((x) => x + 1), 5000); return () => clearInterval(t); }, [open]);

  const block = receiveBlock(wallet, freshness, online);
  const [verified, setVerified] = useState<Wallet | null>(null);
  const r = remaining(verified?.expiresAt ?? wallet.expiresAt);
  const temp = wallet.kind === 'temporary';
  const reqId = useRef(0);
  const mutateRef = useRef(alloc.mutate);
  mutateRef.current = alloc.mutate;
  const resetRef = useRef(alloc.reset);
  resetRef.current = alloc.reset;

  const verify = useCallback(() => {
    const my = ++reqId.current;
    setVerified(null);
    mutateRef.current({ id: wallet.id }, {
      onSuccess: (nw) => {
        if (my !== reqId.current) return;
        if (!nw.address) return;
        setVerified(nw);
        qc.setQueryData(getGetWalletQueryKey(wallet.id), nw);
        qc.invalidateQueries({ queryKey: getListWalletsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetVaultDashboardQueryKey() });
      },
    });
  }, [wallet.id, qc]);

  // Verify with the server every time the dialog opens; clear on close or when blocked.
  const blocked = !!block;
  useEffect(() => {
    if (open && !blocked) verify();
    else { reqId.current++; setVerified(null); resetRef.current(); }
  }, [open, blocked, verify]);
  // Drop the QR the moment the temporary window lapses.
  useEffect(() => { if (verified && remaining(verified.expiresAt).ms <= 0) setVerified(null); });

  const address = !block && verified ? verified.address : null;

  const copy = () => address && navigator.clipboard.writeText(address).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }).catch(() => undefined);
  const share = async () => {
    if (!address) return;
    if (navigator.share) { try { await navigator.share({ title: `${netLabel(session.network)} address`, text: address }); return; } catch { /* fall through to copy */ } }
    copy();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[100dvh] max-w-md gap-0 overflow-y-auto rounded-[28px] border-0 bg-card p-0 [&>button]:hidden">
        <div className="flex items-center justify-between px-5 pt-5">
          <button onClick={() => onOpenChange(false)} className="grid h-10 w-10 place-items-center rounded-full bg-muted transition-transform active:scale-95" data-testid="button-close-receive" aria-label="Close"><X className="h-5 w-5" /></button>
          <DialogTitle className="text-[17px] font-bold">Receive</DialogTitle>
          <span className="h-10 w-10" />
        </div>
        <DialogDescription className="sr-only">Receive bitcoin into {wallet.label}</DialogDescription>
        <div className="flex flex-col items-center px-5 pb-6 pt-4">
          <div className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-sm font-semibold"><BtcGlyph className="h-5 w-5 rounded-md" />{netLabel(session.network)}</div>
          <div className="mt-1.5 text-[12.5px] text-muted-foreground">{wallet.label} · {wallet.kind}</div>

          {block ? (
            <div className="mt-5 flex w-full flex-col items-center gap-3 rounded-3xl border border-dashed border-border bg-muted/40 px-6 py-10 text-center" data-testid="status-receive-blocked">
              <ShieldAlert className="h-8 w-8 text-warn" />
              <div className="font-bold">Receiving unavailable</div>
              <p className="text-sm text-muted-foreground">{block}</p>
            </div>
          ) : alloc.isError ? (
            <div className="mt-5 w-full space-y-3" data-testid="status-receive-error">
              <ErrorPanel error={alloc.error} onRetry={verify} title="The vault could not confirm this address" />
              <p className="text-center text-xs text-muted-foreground">No address is shown until the server verifies it against your live node.</p>
            </div>
          ) : !verified ? (
            <div className="mt-5 flex w-full flex-col items-center gap-3 rounded-3xl bg-muted/40 px-6 py-12 text-center" data-testid="status-receive-verifying">
              <div className="h-[200px] w-[200px] animate-pulse rounded-2xl bg-muted" />
              <p className="text-sm text-muted-foreground">Checking this address with your node</p>
            </div>
          ) : address ? (
            <>
              <div className="mt-5 w-full rounded-3xl border border-card-border bg-[hsl(240_33%_99%)] p-5 shadow-[0_10px_30px_-16px_hsl(232_30%_20%/0.3)]">
                <div className="relative mx-auto w-fit">
                  <QRCodeSVG value={`bitcoin:${address}`} title="Bitcoin receive QR code for the address shown below" size={232} level="Q" bgColor="#ffffff" fgColor="#000000" marginSize={4} data-testid="img-qr" />
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-[hsl(240_33%_99%)] p-1"><BtcGlyph className="h-10 w-10" /></span>
                </div>
                <div className="mt-4 break-all text-center font-mono text-[13px] leading-relaxed" data-testid="text-receive-address">{address}</div>
              </div>
              <div className="mt-4 flex w-full items-start gap-2.5 rounded-2xl bg-accent/15 px-4 py-3 text-[13px] text-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                <span>Only send <b>{netLabel(session.network)}</b> coins to this address. Coins from any other network will be lost.</span>
              </div>
              {temp && (
                <div className="mt-2 flex w-full items-start gap-2.5 rounded-2xl bg-muted px-4 py-3 text-[13px]" data-testid="text-expiry-warning">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>Temporary address. Expires in <b>{r.label}</b> ({stamp(wallet.expiresAt)}). Payments arriving after key destruction may be permanently lost.</span>
                </div>
              )}
              <div className="mt-4 grid w-full grid-cols-2 gap-3">
                <button onClick={copy} className="flex flex-col items-center gap-1.5 rounded-2xl bg-muted py-4 text-sm font-semibold transition-transform active:scale-[0.97]" data-testid="button-copy-address">
                  {copied ? <Check className="h-5 w-5 text-ok" /> : <Copy className="h-5 w-5" />}{copied ? 'Copied' : 'Copy'}
                </button>
                <button onClick={share} className="flex flex-col items-center gap-1.5 rounded-2xl bg-muted py-4 text-sm font-semibold transition-transform active:scale-[0.97]" data-testid="button-share-address">
                  <Share2 className="h-5 w-5" />Share
                </button>
              </div>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

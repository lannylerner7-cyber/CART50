import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import * as D from '@radix-ui/react-dialog';
import { Link } from 'wouter';
import { AlertTriangle, ArrowDown, ArrowLeft, Check, Clock, Copy, History, Info, MoreVertical, RefreshCw, Share2, ShieldAlert } from 'lucide-react';
import { useCreateWalletReceiveAddress, getGetWalletQueryKey, getListWalletsQueryKey, getGetVaultDashboardQueryKey, type Wallet } from '@workspace/api-client-react';
import { Sheet, SheetAction } from '@/components/sheet';
import { ErrorPanel } from '@/components/kit';
import { POLL_MS, remaining, short, stamp, useCsrf, useSession } from '@/lib/vault';
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
  const [menu, setMenu] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);
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

  // Verify with the server every time the screen opens; clear on close or when blocked.
  const blocked = !!block;
  useEffect(() => {
    if (open && !blocked) verify();
    else { reqId.current++; setVerified(null); resetRef.current(); setMenu(false); setActionErr(null); }
  }, [open, blocked, verify]);
  // Drop the QR the moment the temporary window lapses.
  useEffect(() => { if (verified && remaining(verified.expiresAt).ms <= 0) setVerified(null); });

  const address = !block && verified ? verified.address : null;

  const copy = async () => {
    if (!address) return;
    setActionErr(null);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('unsupported');
      await navigator.clipboard.writeText(address);
      setCopied(true); setTimeout(() => setCopied(false), 1400);
    } catch {
      setActionErr('Could not copy to the clipboard. Select and copy the address manually.');
    }
  };
  const share = async () => {
    if (!address) return;
    setActionErr(null);
    if (!navigator.share) { setActionErr('Sharing is not available on this device. Use Copy instead.'); return; }
    try { await navigator.share({ title: `${netLabel(session.network)} address`, text: address }); }
    catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return; // user cancelled: do nothing
      setActionErr('Sharing failed. Use Copy instead.');
    }
  };

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-[hsl(228_20%_2%/0.8)] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <D.Content className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-6 data-[state=open]:fade-in-0 duration-300 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[92dvh] sm:w-[440px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[32px] sm:border sm:border-border" data-testid="sheet-receive">
          <div className="sticky top-0 z-10 flex items-center justify-between bg-background/90 px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur">
            <button onClick={() => onOpenChange(false)} className="circle-btn" data-testid="button-close-receive" aria-label="Back"><ArrowLeft className="h-5 w-5" /></button>
            <button onClick={() => setMenu(true)} disabled={!address} className="circle-btn disabled:opacity-40" aria-label="Address options" data-testid="button-address-options"><MoreVertical className="h-5 w-5" /></button>
          </div>
          <div className="flex flex-1 flex-col px-6 pb-6">
            <D.Title className="font-display mt-4 text-[30px] font-semibold leading-tight">Receive BTC</D.Title>
            <D.Description className="text-[15px] text-muted-foreground">on the {netLabel(session.network)} network · {wallet.label}</D.Description>

            {block ? (
              <div className="mt-7 flex flex-col items-center gap-3 rounded-[28px] border border-dashed border-border bg-card px-6 py-12 text-center" data-testid="status-receive-blocked">
                <ShieldAlert className="h-8 w-8 text-warn" />
                <div className="font-bold">Receiving unavailable</div>
                <p className="text-sm text-muted-foreground">{block}</p>
              </div>
            ) : alloc.isError ? (
              <div className="mt-7 space-y-3" data-testid="status-receive-error">
                <ErrorPanel error={alloc.error} onRetry={verify} title="The vault could not confirm this address" />
                <p className="text-center text-xs text-muted-foreground">No address is shown until the server verifies it against your live node.</p>
              </div>
            ) : !verified ? (
              <div className="mt-7 flex h-[214px] overflow-hidden rounded-[26px]" data-testid="status-receive-verifying">
                <div className="flex-1 animate-pulse bg-accent/40" />
                <div className="grid w-[214px] place-items-center bg-card"><span className="px-4 text-center text-xs text-muted-foreground">Checking this address with your node</span></div>
              </div>
            ) : address ? (
              <>
                <div className="rise mt-7 flex overflow-hidden rounded-[26px] bg-accent">
                  <div className="relative min-w-0 flex-1 p-5">
                    <span className="absolute bottom-5 left-5 grid h-9 w-9 place-items-center rounded-full bg-background/90 text-accent"><svg viewBox="0 0 32 32" className="h-6 w-6" aria-hidden><circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" strokeWidth="3" /><circle cx="16" cy="16" r="3" fill="currentColor" /></svg></span>
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-accent-foreground/70">{session.network}</span>
                  </div>
                  <div className="shrink-0 rounded-[24px] border-[6px] border-background bg-[#fbfaf7] p-2">
                    <div className="relative">
                      <QRCodeSVG value={`bitcoin:${address}`} title="Bitcoin receive QR code for the address shown below" size={186} level="Q" bgColor="#fbfaf7" fgColor="#0b0b0d" marginSize={1} data-testid="img-qr" />
                      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#fbfaf7] p-1"><BtcGlyph className="h-9 w-9 rounded-full" /></span>
                    </div>
                  </div>
                </div>
                <div className="mt-7 flex items-center justify-between gap-4 border-b border-border pb-6">
                  <div className="min-w-0">
                    <div className="text-[16px]">Your address</div>
                    <div className="mt-0.5 font-mono text-[13.5px] text-muted-foreground" data-testid="text-receive-address-short">{short(address, 6)}</div>
                    <span className="sr-only" data-testid="text-receive-address">{address}</span>
                  </div>
                  <button onClick={copy} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-muted transition-transform active:scale-95" aria-label="Copy address" data-testid="button-copy-address">
                    {copied ? <Check className="h-5 w-5 text-ok" /> : <Copy className="h-5 w-5" />}
                  </button>
                </div>
                {actionErr && <p role="alert" className="mt-3 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive" data-testid="text-address-action-error">{actionErr}</p>}
                <ul className="mt-5 space-y-4 text-[13px] text-muted-foreground">
                  <li className="flex gap-3"><Info className="mt-0.5 h-4 w-4 shrink-0" />Bitcoin only. Do not send Bitcoin Cash, Bitcoin SV or any other coin to this address.</li>
                  <li className="flex gap-3"><ArrowDown className="mt-0.5 h-4 w-4 shrink-0" />Only send <b className="text-foreground">{netLabel(session.network)}</b> coins. Coins from any other network will be lost.</li>
                  <li className="flex gap-3"><Clock className="mt-0.5 h-4 w-4 shrink-0" />Credit appears once your own node sees the payment; confirmation time depends on fees and blocks.</li>
                  {temp && <li className="flex gap-3 text-foreground" data-testid="text-expiry-warning"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" /><span>Temporary address. Expires in <b>{r.label}</b> ({stamp(wallet.expiresAt)}). Payments arriving after key destruction may be permanently lost.</span></li>}
                </ul>
              </>
            ) : null}

            <div className="mt-auto pt-8">
              <button onClick={() => onOpenChange(false)} className="pill-btn h-14 w-full text-[16px]" data-testid="button-receive-done">Close</button>
            </div>
          </div>

          <Sheet open={menu && !!address} onOpenChange={setMenu} title="Your BTC address" description={<span className="break-all font-mono text-[13px]">{address}</span>} testId="sheet-address-options">
            <div className="mt-4">
              <SheetAction icon={copied ? <Check className="text-ok" /> : <Copy />} label={copied ? 'Copied' : 'Copy'} onClick={copy} testId="button-option-copy" />
              <SheetAction icon={<Share2 />} label="Share" onClick={share} testId="button-share-address" />
              <SheetAction icon={<RefreshCw className={alloc.isPending ? 'animate-spin' : ''} />} label="Refresh address" sub="Re-checks the current receive address with the vault and your node. The vault decides which address is returned; this does not guarantee a new one." disabled={alloc.isPending} onClick={() => { setMenu(false); verify(); }} testId="button-option-refresh-address" />
              <Link href={`/transactions?wallet=${encodeURIComponent(wallet.id)}`} onClick={() => { setMenu(false); onOpenChange(false); }} className="flex w-full items-center gap-4 rounded-2xl px-2 py-3.5 hover:bg-muted/60" data-testid="link-option-history"><History className="h-5 w-5" /><span className="text-[16px] font-medium">View history</span></Link>
            </div>
            {actionErr && <p role="alert" className="mt-3 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive" data-testid="text-address-action-error">{actionErr}</p>}
            <button onClick={() => setMenu(false)} className="pill-btn mt-4 h-14 w-full text-[16px]" data-testid="button-option-dismiss">Dismiss</button>
          </Sheet>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, RefreshCw, Wallet } from 'lucide-react';
import { checkHostedCheckout, getHostedCheckout, type HostedCheckout } from '@workspace/api-client-react';
import { BrandedQr } from '@/components/branded-qr';
import { CopyText } from '@/components/kit';
import { VaultMark } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { ReceiptButton, ReceiptTerminal } from '@/components/receipt-terminal';
import { fromHostedCheckout } from '@/lib/receipt-terminal';
import { errStatus, satsToBtc } from '@/lib/vault';

const httpsUrl = (v: string | null | undefined) => { try { const u = new URL(v ?? ''); return u.protocol === 'https:' ? u : null; } catch { return null; } };
/** Same-origin Sandbox send screen with the destination prefilled; sign-in keeps the link via ?next=. */
const sandboxSendHref = (destination: string) => `${import.meta.env.BASE_URL.replace(/\/$/, '')}/developers/sandbox/send?destination=${encodeURIComponent(destination)}`;
/** The receipt terminal prints for ten seconds; leave a short pause before the merchant redirect. */
const RETURN_DELAY_SEC = 14;

function returnTarget(c: HostedCheckout): string | null {
  const u = httpsUrl(c.return_url);
  if (!u) return null;
  u.searchParams.set('checkout_id', c.id);
  u.searchParams.set('status', c.status);
  return u.toString();
}

function View({ token }: { token: string }) {
  const key = ['hosted-checkout', token];
  const q = useQuery({
    queryKey: key, queryFn: () => getHostedCheckout(token), retry: (count,error) => count<1 && ![400,401,403,404,410].includes(errStatus(error)??0),
    refetchInterval: (s) => (s.state.data?.status === 'pending' ? 5000 : false),
  });
  const check = useMutation({ mutationFn: () => checkHostedCheckout(token), retry: false });
  const c = check.data && check.data.id === q.data?.id && check.data.status !== 'pending' ? check.data : q.data;
  const [now, setNow] = useState(Date.now());
  const [left, setLeft] = useState(RETURN_DELAY_SEC);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { document.title = 'Checkout simulation'; }, []);
  const target = useMemo(() => (c && c.status === 'simulation_paid' ? returnTarget(c) : null), [c]);
  useEffect(() => {
    if (!target) return;
    setLeft(RETURN_DELAY_SEC);
    const i = setInterval(() => setLeft((l) => l - 1), 1000);
    const t = setTimeout(() => window.location.assign(target), RETURN_DELAY_SEC * 1000);
    return () => { clearInterval(i); clearTimeout(t); };
  }, [target]);

  if (q.isLoading) return <Frame><div className="space-y-3"><div className="h-6 w-40 animate-pulse rounded bg-muted" /><div className="mx-auto h-56 w-56 animate-pulse rounded-2xl bg-muted" /></div></Frame>;
  if (q.isError || !c) {
    const nf = errStatus(q.error) === 404;
    return <Frame><div className="text-center" data-testid="status-checkout-error"><AlertTriangle className="mx-auto h-7 w-7 text-warn" /><h1 className="mt-3 font-display text-xl font-bold">{nf ? 'Checkout not found' : 'Could not load checkout'}</h1><p className="mt-2 text-[14px] text-muted-foreground">{nf ? 'This link is invalid or was removed. Return to the merchant and start again.' : 'Network or server error. Nothing was charged.'}</p>{!nf && <Button className="mt-4 rounded-full" onClick={() => q.refetch()} data-testid="button-retry-load"><RefreshCw className="h-4 w-4" /> Retry</Button>}</div></Frame>;
  }
  const expMs = Date.parse(c.expiresAt) - now;
  const expired = c.status === 'expired' || (c.status === 'pending' && expMs <= 0);
  const qr = httpsUrl(c.qrPayload)?.toString() ?? httpsUrl(c.url)?.toString() ?? null;

  return (
    <Frame>
      <div className="text-center">
        <span className="inline-flex rounded-full border border-warn/40 bg-warn/10 px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-warn" data-testid="badge-simulation">Simulation · no real Bitcoin</span>
        <div className="mt-4 font-mono text-[12px] text-muted-foreground" data-testid="text-reference">{c.reference}</div>
        <div className="mt-1 font-display text-[2rem] font-bold leading-none" data-testid="text-amount">{satsToBtc(String(c.amount_sats))} <span className="text-[1rem] text-muted-foreground">sim BTC</span></div>
        <div className="font-mono text-[12px] text-muted-foreground">{c.amount_sats.toLocaleString('en-US')} simulated sats</div>
      </div>

      {c.status === 'simulation_paid' ? (
        <div className="mt-6" data-testid="status-paid">
          <div className="rounded-2xl bg-primary/10 p-5 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-primary" />
            <h1 className="mt-2 font-display text-xl font-bold">Simulated payment confirmed</h1>
            <p className="mt-1 text-[13.5px] text-muted-foreground" data-testid="text-paid-via">{c.paid_via === 'sandbox_transfer' ? 'Settled from a MainVault Sandbox wallet.' : 'Marked paid by the merchant.'} No real funds moved.</p>
            {target ? <><p className="mt-3 text-[13px]" data-testid="text-redirect">Returning to the merchant in {Math.max(0, left)}s.</p><a href={target} className="mt-3 inline-flex h-11 items-center rounded-full bg-primary px-5 font-bold text-primary-foreground" data-testid="link-continue">Continue to merchant</a></> : <p className="mt-3 text-[13px] text-muted-foreground">You can close this page.</p>}
          </div>
          {/* The receipt prints inline once, from backend facts only; the merchant redirect waits for it. */}
          <div className="mt-4"><ReceiptTerminal m={fromHostedCheckout(c)} testId="card-checkout-terminal" testPrefix="checkout-receipt" /></div>
        </div>
      ) : expired ? (
        <div className="mt-6 rounded-2xl bg-muted p-5 text-center" data-testid="status-expired"><Clock className="mx-auto h-7 w-7 text-muted-foreground" /><h1 className="mt-2 font-display text-xl font-bold">Checkout expired</h1><p className="mt-1 text-[13.5px] text-muted-foreground">Return to the merchant to start a new checkout.</p><div className="mt-3 flex justify-center"><ReceiptButton m={fromHostedCheckout(c)} label="View record" testPrefix="checkout-receipt" /></div></div>
      ) : (
        <>
          <section className="mt-6 rounded-2xl border border-border bg-muted/40 p-4" aria-labelledby="pay-from-sandbox" data-testid="card-sandbox-destination">
            <h2 id="pay-from-sandbox" className="flex items-center gap-2 text-[14px] font-bold"><Wallet className="h-4 w-4" /> Pay from a MainVault Sandbox wallet</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] text-muted-foreground">
              <li>Open your Sandbox wallet and choose Send.</li>
              <li>Paste this destination. The amount locks to exactly <span className="font-mono text-foreground">{c.amount_sats.toLocaleString('en-US')}</span> simulated sats.</li>
              <li>Confirm. This page updates on its own once the transfer settles.</li>
            </ol>
            <div className="mt-3 break-all rounded-xl bg-background p-3 font-mono text-[12.5px]" data-testid="text-sandbox-destination">{c.sandbox_destination}</div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <CopyText value={c.sandbox_destination} display="Copy destination" className="text-[13px]" />
              <a href={sandboxSendHref(c.sandbox_destination)} className="inline-flex items-center gap-1.5 text-[13px] font-semibold underline underline-offset-4" data-testid="link-open-sandbox-wallet">Open Sandbox wallet <ExternalLink className="h-3.5 w-3.5" /></a>
            </div>
          </section>
          <details className="mt-4">
            <summary className="cursor-pointer text-center text-[12.5px] text-muted-foreground">Show QR for another device</summary>
            <div className="mt-3">{qr ? <BrandedQr value={qr} title="Link to this checkout page" testId="img-checkout-qr" /> : <p className="text-center text-[13px] text-muted-foreground">QR unavailable for this link.</p>}</div>
            <p className="mt-3 text-center text-[12.5px] text-muted-foreground">The QR opens this checkout page on another device. It is not a Bitcoin address.</p>
          </details>
          <div className="mt-3 text-center font-mono text-[12px] text-muted-foreground" data-testid="text-expiry">Expires in {Math.floor(expMs / 60000)}:{String(Math.floor(expMs / 1000) % 60).padStart(2, '0')}</div>
          <Button className="mt-5 h-12 w-full rounded-full font-bold" disabled={check.isPending} onClick={() => check.mutate()} data-testid="button-sent-payment">{check.isPending ? 'Checking status' : 'I\u2019ve made the payment'}</Button>
          {check.isSuccess && check.data.status === 'pending' && <p className="mt-2 text-center text-[13px] text-muted-foreground" data-testid="text-still-pending">No settled transfer for this checkout yet. Finish the confirmation in your Sandbox wallet; this page checks again every few seconds.</p>}
          {check.isError && <p className="mt-2 text-center text-[13px] text-destructive" data-testid="text-check-error">Status check failed. Try again.</p>}
          {q.isRefetchError && <p className="mt-2 text-center text-[12px] text-warn">Live updates interrupted; retrying.</p>}
        </>
      )}
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-background p-5">
      <main className="w-full max-w-[420px]">
        <div className="mb-4 flex items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground"><VaultMark className="h-6 w-6" /> hosted checkout</div>
        <div className="rounded-[24px] border border-card-border bg-card p-6">{children}</div>
      </main>
    </div>
  );
}

/** Public page: its own short-lived QueryClient, no owner or developer calls, cache cleared on leave. */
export default function HostedCheckoutPage({ token }: { token: string }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: true }, mutations: { retry: false } } }));
  useEffect(() => () => client.clear(), [client]);
  return <QueryClientProvider client={client}><View key={token} token={token} /></QueryClientProvider>;
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ShieldCheck, Send, AlertTriangle } from 'lucide-react';
import { Link } from 'wouter';
import { outcomeUnknown } from '@/lib/sandbox';
import { useGetVaultDashboard, useGetVaultSettings, useReviewPayment, useSendPayment, getGetVaultDashboardQueryKey, getGetVaultSettingsQueryKey, getListTransactionsQueryKey, type PaymentReview, type Transaction } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { PolicyError, Btc, ErrorPanel, PageHeader, Panel, Pill, Skel, Stat } from '@/components/kit';
import { POLL_MS, btcToSats, remaining, toBig, useCsrf, satsToBtc, stamp } from '@/lib/vault';
import { CopyText } from '@/components/kit';
import { useToast } from '@/hooks/use-toast';
import { RecipientCheck } from '@/components/recipient-check';
import { ReceiptTerminal } from '@/components/receipt-terminal';
import { fromLivePayment } from '@/lib/receipt-terminal';
import { useGetMarket, getGetMarketQueryKey } from '@workspace/api-client-react';
import { freshUsdPrice, usdEstimate } from '@/lib/usd-estimate';

export default function Spending() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const csrf = useCsrf();
  const dash = useGetVaultDashboard({ query: { queryKey: getGetVaultDashboardQueryKey(), refetchInterval: POLL_MS } });
  const settings = useGetVaultSettings({ query: { queryKey: getGetVaultSettingsQueryKey() } });
  const market = useGetMarket({ query: { queryKey: getGetMarketQueryKey(), refetchInterval: POLL_MS } });
  const review = useReviewPayment(csrf);
  const send = useSendPayment(csrf);
  const [address, setAddress] = useState('');
  const [walletId, setWalletId] = useState<'vault-spending' | 'vault-reserve'>('vault-spending');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<'btc' | 'sats'>('btc');
  const [feeRate, setFeeRate] = useState('');
  const [replacesTxid, setReplacesTxid] = useState('');
  const [rv, setRv] = useState<PaymentReview | null>(null);
  const [ack, setAck] = useState(false);
  const [receipt, setReceipt] = useState<{ tx: Transaction; rv: PaymentReview; at: string } | null>(null);
  const [unknownId, setUnknownId] = useState<string | null>(null);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);

  const sats = unit === 'btc' ? btcToSats(amount) : /^[0-9]+$/.test(amount) ? amount : null;
  const d = dash.data;
  const s = settings.data;
  const sources = d?.wallets.filter((w) => (w.kind === 'spending' || w.kind === 'reserve') && w.status === 'active') ?? [];
  const source = sources.find((w) => w.id === walletId);
  const balKnown = !!source && !!d?.node.connected && !dash.isError &&
    !!dash.dataUpdatedAt && Date.now() - dash.dataUpdatedAt <= POLL_MS * 3;
  const hot = source ? toBig(source.availableSats) : 0n;
  const mainnet = !!d && (d.node.network === 'main' || d.node.network === 'mainnet');
  const usdPrice = mainnet ? freshUsdPrice(market.data, market.isError) : null;
  const dollars = (value: string | null) => {
    const formatted = usdEstimate(value, usdPrice);
    return formatted ? `≈ ${formatted} USD` : 'USD estimate unavailable';
  };
  const stale = !dash.dataUpdatedAt || Date.now() - dash.dataUpdatedAt > POLL_MS * 3 || !settings.dataUpdatedAt;
  const blocked = settings.isError ? 'Spending policy unavailable. Sending is disabled.' : dash.isError ? 'Node status unavailable. Sending is disabled.' : !d || !s ? 'Loading node status and policy' : stale ? 'Node status is stale. Sending is paused until a fresh sync.' : !d.node.connected ? 'Node disconnected. Spending is disabled.' : !mainnet ? 'The live mainnet engine is not commissioned. Review and sending are disabled.' : !d.mainnetEnabled ? 'Mainnet spending is disabled.' : s.sweepsPaused ? 'Sending is paused in Settings.' : null;
  const inputKey = `${walletId}|${address.trim()}|${sats ?? ''}|${feeRate}|${replacesTxid.trim()}`;
  const reviewKey = useRef<string | null>(null);
  const reviewReq = useRef(0);
  const valid = !!source && address.trim().length >= 14 && address.trim().length <= 100 && !!sats && toBig(sats) > 0n && /^[0-9]+(\.[0-9]{1,3})?$/.test(feeRate);
  const exp = rv ? remaining(rv.expiresAt) : null;

  // A review is only valid for the exact inputs it priced. Drop it (and any in-flight review) when inputs change or sending becomes unavailable.
  // An unknown-outcome submission keeps its review pinned so nothing can be resubmitted.
  useEffect(() => {
    if (unknownId || send.isPending) return;
    if ((rv && (reviewKey.current !== inputKey || blocked)) || (review.isPending && reviewKey.current !== inputKey)) {
      reviewReq.current++; reviewKey.current = null; setRv(null); setAck(false); review.reset(); send.reset();
    }
  }, [inputKey, blocked, rv, unknownId, send.isPending, review.isPending]); // eslint-disable-line react-hooks/exhaustive-deps
  const doReview = () => {
    if (blocked || unknownId) return;
    const my = ++reviewReq.current; reviewKey.current = inputKey;
    review.mutate({ data: { walletId, address: address.trim(), amountSats: sats!, feeRate, ...(replacesTxid.trim() ? { replacesTxid: replacesTxid.trim() } : {}) } }, { onSuccess: (r) => { if (my !== reviewReq.current || reviewKey.current !== inputKey) return; setRv(r); setAck(false); send.reset(); } });
  };
  const doSend = () => rv && !unknownId && !blocked && exp && exp.ms > 0 && reviewKey.current === inputKey && send.mutate({ data: { reviewId: rv.id, confirmed: true } }, {
    onError: (e) => { if (outcomeUnknown(e)) setUnknownId(rv.id); },
    onSuccess: (r) => {
      setReceipt({ tx: r, rv, at: new Date().toISOString() });
      toast({ title: r.status === 'confirmed' ? 'Payment confirmed' : 'Payment status received', description: r.status === 'confirmed' ? `Status: ${r.status}` : `Status: ${r.status} · not confirmed; check Activity` });
      qc.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
      qc.invalidateQueries({ queryKey: getGetVaultDashboardQueryKey() });
      reviewKey.current = null; setRv(null); setAddress(''); setAmount(''); setReplacesTxid(''); setAck(false);
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader kicker="Server-held wallets" title="Send bitcoin" desc="Choose your main or spending wallet, review the payment, then confirm before anything is signed. Both hold keys on your server—not offline." />
      {receipt && <LiveReceipt r={receipt} onClose={() => setReceipt(null)} />}
      {dash.isError && <ErrorPanel error={dash.error} onRetry={() => dash.refetch()} title="Node status unavailable" />}
      {settings.isError && <PolicyError error={settings.error} onRetry={() => settings.refetch()} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <Panel title={<span className="flex items-center gap-2"><span className={rv ? 'text-muted-foreground' : 'text-primary'}>1 · Details</span><ArrowRight className="h-3 w-3" /><span className={rv ? 'text-primary' : ''}>2 · Confirm</span></span>}>
            {blocked && <div className="mb-4 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn" data-testid="text-spend-blocked">{blocked}</div>}
            <fieldset disabled={!!rv || send.isPending || !!unknownId} className="grid min-w-0 grid-cols-1 gap-4 disabled:opacity-60">
              <div className="grid gap-1.5">
                <Label htmlFor="payment-source">From wallet</Label>
                <select id="payment-source" data-testid="select-payment-source" className="h-12 rounded-2xl border border-border bg-background px-3 text-sm" value={walletId} onChange={(e) => { setWalletId(e.target.value as typeof walletId); setReplacesTxid(''); review.reset(); }}>
                  {sources.length === 0 && <option value="vault-spending">No spendable wallet available</option>}
                  {sources.map((w) => <option key={w.id} value={w.id}>{w.label} · server-held</option>)}
                </select>
              </div>
              <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Replace a pending payment (RBF)</summary><div className="mt-3 space-y-2"><Label>Original spending transaction ID</Label><Input value={replacesTxid} onChange={(e) => setReplacesTxid(e.target.value)} placeholder="64-character transaction ID; leave blank for a new payment" className="font-mono" /><p className="text-xs text-muted-foreground">Enter the original recipient and amount below, with a higher fee rate. The engine preserves the recipient and amount. The review shows the replacement's total fee, not just its increase.</p></div></details>
              <div className="grid gap-1.5"><Label>Destination address</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} className="h-12 rounded-2xl font-mono" placeholder={d?.node.network === 'main' ? 'bc1q…' : d?.node.network === 'regtest' ? 'bcrt1q…' : 'tb1q…'} spellCheck={false} data-testid="input-address" /></div>
              <RecipientCheck address={address} mainnet={mainnet} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Amount</Label>
                  <div className="flex min-w-0">
                    <Input value={amount} onChange={(e) => setAmount(e.target.value.trim())} className="h-12 rounded-l-2xl rounded-r-none font-mono text-lg" placeholder={unit === 'btc' ? '0.00100000' : '100000'} data-testid="input-amount" />
                    <button type="button" onClick={() => { setAmount(sats === null ? '' : unit === 'btc' ? sats : satsToBtc(sats).replaceAll(',', '')); setUnit(unit === 'btc' ? 'sats' : 'btc'); }} className="rounded-r-2xl border border-l-0 border-input bg-muted px-4 text-[12px] font-bold uppercase" data-testid="button-toggle-unit">{unit}</button>
                  </div>
                  {amount && !sats && <span className="font-mono text-[11px] text-destructive">invalid amount</span>}
                  {sats && unit === 'btc' && <span className="font-mono text-[11px] text-muted-foreground">{sats} sats</span>}
                  <span className="text-sm text-muted-foreground" data-testid="text-send-usd" aria-live="polite">{sats ? dollars(sats) : 'Enter a Bitcoin amount to see its USD estimate.'}</span>
                </div>
                <div className="grid gap-1.5"><Label>Fee rate (sat/vB)</Label><Input value={feeRate} onChange={(e) => setFeeRate(e.target.value.trim())} className="font-mono" placeholder={s ? `max ${s.feeRateCeiling}` : '2.5'} data-testid="input-fee-rate" /></div>
              </div>
            </fieldset>
            <p className="mt-3 text-xs text-muted-foreground" data-testid="text-send-quote">
              {usdPrice !== null ? `Estimated using ${market.data?.source} · quote ${stamp(market.data!.updatedAt!)}.` : 'A fresh USD quote is unavailable. Bitcoin amounts remain unchanged.'}
              {' '}USD values are estimates, not a locked exchange rate. This payment sends Bitcoin, not dollars.
            </p>
            {review.isError && <div className="mt-4"><ErrorPanel error={review.error} title="Review rejected" /></div>}
            {!rv && <Button className="mt-5 h-12 w-full gap-2 rounded-full text-[15px] font-bold sm:w-auto sm:px-8" disabled={!!blocked || !valid || review.isPending || !!unknownId} onClick={doReview} data-testid="button-review"><ShieldCheck className="h-4 w-4" />{review.isPending ? 'Pricing' : 'Review payment'}</Button>}
          </Panel>

          {rv && (
            <Panel title="Check every character" className="border-primary/50" meta={<span className={`font-mono ${exp && exp.ms <= 0 ? 'text-destructive' : ''}`}>{exp?.ms && exp.ms > 0 ? `valid ${Math.ceil(exp.ms / 1000)}s` : 'expired'}</span>}>
              <p className="mb-3 text-sm" data-testid="text-review-source">From: {d?.wallets.find((w) => w.id === (rv.walletId ?? 'vault-spending'))?.label ?? rv.walletId ?? 'Spending vault'}</p>
              <div className="rounded-xl bg-muted/60 p-3 font-mono text-sm break-all" data-testid="text-review-address">{rv.address}</div>
              <div className="mt-4 grid grid-cols-1 gap-4 min-[420px]:grid-cols-3">
                <Stat label="amount"><Btc sats={rv.amountSats} /><div className="text-xs text-muted-foreground" data-testid="text-review-amount-usd">{dollars(rv.amountSats)}</div></Stat>
                <Stat label="fee"><Btc sats={rv.feeSats} className="text-muted-foreground" /><div className="text-xs text-muted-foreground" data-testid="text-review-fee-usd">{dollars(rv.feeSats)}</div></Stat>
                <Stat label="total debit"><Btc sats={rv.totalSats} className="font-bold text-primary" /><div className="text-xs text-muted-foreground" data-testid="text-review-total-usd">{dollars(rv.totalSats)}</div></Stat>
              </div>
              <div className="mt-3"><Pill tone="ember">network {rv.network}</Pill></div>
              <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 text-sm">
                <Checkbox checked={ack} onCheckedChange={(v) => setAck(!!v)} data-testid="checkbox-ack" className="mt-0.5" />
                I have checked the destination address and amounts. A broadcast Bitcoin transaction cannot be reversed.
              </label>
              {unknownId ? (
                <div role="alert" className="mt-3 flex gap-3 rounded-xl border border-warn/40 bg-warn/5 p-3.5 text-[13px]" data-testid="status-send-unknown">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                  <div>The outcome of this submission is unknown. Do not submit again. Check <Link href="/transactions" className="font-semibold underline">Activity</Link> for this payment. Review ID: <CopyText value={unknownId} className="text-[12px]" /></div>
                </div>
              ) : send.isError && <div className="mt-3"><ErrorPanel error={send.error} title="Send rejected" /></div>}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button className="h-11 gap-2 rounded-full px-6 font-bold" disabled={!ack || send.isPending || !!unknownId || !!blocked || !exp || exp.ms <= 0} onClick={doSend} data-testid="button-confirm-send"><Send className="h-4 w-4" />{send.isPending ? 'Submitting' : 'Confirm and send'}</Button>
                <Button variant="outline" disabled={send.isPending || !!unknownId} onClick={() => { setRv(null); review.reset(); send.reset(); }} data-testid="button-edit-payment">Edit</Button>
              </div>
            </Panel>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          <Panel title="Spending wallet">
            {dash.isLoading ? <Skel className="h-16" /> : balKnown ? <Stat label="available"><Btc sats={hot} size="lg" /></Stat> : <Stat label="available"><span className="font-display text-xl font-bold" data-testid="text-source-unknown">Unknown</span><div className="text-xs text-muted-foreground">Node offline or data stale. Not assumed to be zero.</div></Stat>}
            {balKnown && <p className="mt-2 text-sm text-muted-foreground" data-testid="text-send-balance-usd">{dollars(source!.availableSats)}</p>}
          </Panel>
          <Panel title="Limits">
            {settings.isLoading ? <Skel className="h-28" /> : s ? (
              <div className="grid gap-3">
                <Stat label="hot exposure limit"><Btc sats={s.hotExposureLimitSats} /></Stat>
                <Stat label="total fee ceiling"><Btc sats={s.totalFeeCeilingSats} /></Stat>
                <Stat label="fee rate ceiling"><span className="font-mono text-sm">{s.feeRateCeiling} sat/vB</span></Stat>
                {s.sweepsPaused && <Pill tone="warn">sending and sweeps paused</Pill>}
              </div>
            ) : null}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function LiveReceipt({ r, onClose }: { r: { tx: Transaction; rv: PaymentReview; at: string }; onClose: () => void }) {
  const m = useMemo(() => fromLivePayment(r), [r]);
  return (
    <div aria-live="polite">
      <ReceiptTerminal m={m} testId="card-live-receipt" testPrefix="live-receipt" downloadTestId="button-download-live-receipt" printTestId="button-print-live-receipt"
        intro="Submission snapshot, not a live confirmation count. Open Activity for the current status."
        actions={<>
          <Link href="/transactions" className="pill-btn" data-testid="link-receipt-activity">Open Activity</Link>
          <Button variant="outline" className="rounded-full" onClick={onClose} data-testid="button-close-receipt">Close</Button>
        </>} />
      <span className="sr-only" data-testid="text-receipt-txid">{r.tx.txid}</span>
    </div>
  );
}

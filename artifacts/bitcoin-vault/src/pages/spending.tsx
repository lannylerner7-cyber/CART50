import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ShieldCheck, Send } from 'lucide-react';
import { useGetVaultDashboard, useGetVaultSettings, useReviewPayment, useSendPayment, getGetVaultDashboardQueryKey, getGetVaultSettingsQueryKey, getListTransactionsQueryKey, type PaymentReview } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Btc, ErrorPanel, PageHeader, Panel, Pill, Skel, Stat } from '@/components/kit';
import { POLL_MS, btcToSats, remaining, toBig, useCsrf } from '@/lib/vault';
import { useToast } from '@/hooks/use-toast';

export default function Spending() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const csrf = useCsrf();
  const dash = useGetVaultDashboard({ query: { queryKey: getGetVaultDashboardQueryKey(), refetchInterval: POLL_MS } });
  const settings = useGetVaultSettings({ query: { queryKey: getGetVaultSettingsQueryKey() } });
  const review = useReviewPayment(csrf);
  const send = useSendPayment(csrf);
  const [address, setAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<'btc' | 'sats'>('btc');
  const [feeRate, setFeeRate] = useState('');
  const [replacesTxid, setReplacesTxid] = useState('');
  const [rv, setRv] = useState<PaymentReview | null>(null);
  const [ack, setAck] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);

  const sats = unit === 'btc' ? btcToSats(amount) : /^[0-9]+$/.test(amount) ? amount : null;
  const d = dash.data;
  const s = settings.data;
  const hot = d ? d.wallets.filter((w) => w.kind === 'spending').reduce((a, w) => a + toBig(w.availableSats), 0n) : 0n;
  const blocked = !d ? 'Loading node status' : !d.node.connected ? 'Node disconnected. Spending is disabled.' : d.node.network === 'main' || d.node.network === 'mainnet' ? (d.mainnetEnabled ? null : 'Mainnet spending is disabled.') : null;
  const valid = address.trim().length >= 14 && address.trim().length <= 100 && !!sats && toBig(sats) > 0n && /^[0-9]+(\.[0-9]{1,3})?$/.test(feeRate);
  const exp = rv ? remaining(rv.expiresAt) : null;

  const doReview = () => review.mutate({ data: { address: address.trim(), amountSats: sats!, feeRate, ...(replacesTxid.trim() ? { replacesTxid: replacesTxid.trim() } : {}) } }, { onSuccess: (r) => { setRv(r); setAck(false); send.reset(); } });
  const doSend = () => rv && send.mutate({ data: { reviewId: rv.id, confirmed: true } }, {
    onSuccess: (r) => {
      toast({ title: 'Payment broadcast', description: r.txid });
      qc.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
      qc.invalidateQueries({ queryKey: getGetVaultDashboardQueryKey() });
      setRv(null); setAddress(''); setAmount(''); setReplacesTxid(''); setAck(false);
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader kicker="03 / hot wallet" title="Spending" desc="Two steps, always. The server prices the transaction against your ceilings, then you confirm the exact figures before anything is signed." />
      {dash.isError && <ErrorPanel error={dash.error} onRetry={() => dash.refetch()} title="Node status unavailable" />}
      {settings.isError && <ErrorPanel error={settings.error} onRetry={() => settings.refetch()} title="Settings unavailable" />}

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Panel title={<span className="flex items-center gap-2"><span className={rv ? 'text-muted-foreground' : 'text-primary'}>1 · compose</span><ArrowRight className="h-3 w-3" /><span className={rv ? 'text-primary' : ''}>2 · confirm</span></span>}>
            {blocked && <div className="mb-4 rounded-sm border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn" data-testid="text-spend-blocked">{blocked}</div>}
            <fieldset disabled={!!blocked || !!rv} className="grid gap-4 disabled:opacity-60">
              <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Replace a pending payment (RBF)</summary><div className="mt-3 space-y-2"><Label>Original spending transaction ID</Label><Input value={replacesTxid} onChange={(e) => setReplacesTxid(e.target.value)} placeholder="64-character transaction ID; leave blank for a new payment" className="font-mono" /><p className="text-xs text-muted-foreground">Enter the original recipient and amount below, with a higher fee rate. The engine preserves the recipient and amount. The review shows the replacement's total fee, not just its increase.</p></div></details>
              <div className="grid gap-1.5"><Label>Destination address</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} className="font-mono" placeholder="tb1q…" spellCheck={false} data-testid="input-address" /></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Amount</Label>
                  <div className="flex">
                    <Input value={amount} onChange={(e) => setAmount(e.target.value.trim())} className="rounded-r-none font-mono" placeholder={unit === 'btc' ? '0.00100000' : '100000'} data-testid="input-amount" />
                    <button type="button" onClick={() => { setUnit(unit === 'btc' ? 'sats' : 'btc'); setAmount(''); }} className="rounded-r-md border border-l-0 border-input bg-muted px-3 font-mono text-[11px] uppercase" data-testid="button-toggle-unit">{unit}</button>
                  </div>
                  {amount && !sats && <span className="font-mono text-[11px] text-destructive">invalid amount</span>}
                  {sats && unit === 'btc' && <span className="font-mono text-[11px] text-muted-foreground">{sats} sats</span>}
                </div>
                <div className="grid gap-1.5"><Label>Fee rate (sat/vB)</Label><Input value={feeRate} onChange={(e) => setFeeRate(e.target.value.trim())} className="font-mono" placeholder={s ? `max ${s.feeRateCeiling}` : '2.5'} data-testid="input-fee-rate" /></div>
              </div>
            </fieldset>
            {review.isError && <div className="mt-4"><ErrorPanel error={review.error} title="Review rejected" /></div>}
            {!rv && <Button className="mt-5 gap-2" disabled={!!blocked || !valid || review.isPending} onClick={doReview} data-testid="button-review"><ShieldCheck className="h-4 w-4" />{review.isPending ? 'Pricing' : 'Review payment'}</Button>}
          </Panel>

          {rv && (
            <Panel title="review · verify every character" className="border-primary/50" meta={<span className={`font-mono ${exp && exp.ms <= 0 ? 'text-destructive' : ''}`}>{exp?.ms && exp.ms > 0 ? `valid ${Math.ceil(exp.ms / 1000)}s` : 'expired'}</span>}>
              <div className="rounded-sm bg-muted/60 p-3 font-mono text-sm break-all" data-testid="text-review-address">{rv.address}</div>
              <div className="mt-4 grid grid-cols-3 gap-4">
                <Stat label="amount"><Btc sats={rv.amountSats} /></Stat>
                <Stat label="fee"><Btc sats={rv.feeSats} className="text-muted-foreground" /></Stat>
                <Stat label="total debit"><Btc sats={rv.totalSats} className="font-bold text-primary" /></Stat>
              </div>
              <div className="mt-3"><Pill tone="ember">network {rv.network}</Pill></div>
              <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-sm border border-border p-3 text-sm">
                <Checkbox checked={ack} onCheckedChange={(v) => setAck(!!v)} data-testid="checkbox-ack" className="mt-0.5" />
                I have checked the destination address and amounts. A broadcast Bitcoin transaction cannot be reversed.
              </label>
              {send.isError && <div className="mt-3"><ErrorPanel error={send.error} title="Send failed" /></div>}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button className="gap-2" disabled={!ack || send.isPending || !exp || exp.ms <= 0} onClick={doSend} data-testid="button-confirm-send"><Send className="h-4 w-4" />{send.isPending ? 'Signing & broadcasting' : 'Confirm and send'}</Button>
                <Button variant="outline" onClick={() => { setRv(null); review.reset(); }} data-testid="button-edit-payment">Edit</Button>
              </div>
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          <Panel title="hot wallet">
            {dash.isLoading ? <Skel className="h-16" /> : <Stat label="available"><Btc sats={hot} size="lg" /></Stat>}
          </Panel>
          <Panel title="policy ceilings">
            {settings.isLoading ? <Skel className="h-28" /> : s ? (
              <div className="grid gap-3">
                <Stat label="hot exposure limit"><Btc sats={s.hotExposureLimitSats} /></Stat>
                <Stat label="total fee ceiling"><Btc sats={s.totalFeeCeilingSats} /></Stat>
                <Stat label="fee rate ceiling"><span className="font-mono text-sm">{s.feeRateCeiling} sat/vB</span></Stat>
                {s.sweepsPaused && <Pill tone="warn">sweeps paused</Pill>}
              </div>
            ) : null}
          </Panel>
        </div>
      </div>
    </div>
  );
}

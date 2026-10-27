import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { BrandedQr } from '@/components/branded-qr';
import { AlertTriangle, Ban, Download, RefreshCw, ShieldCheck } from 'lucide-react';
import { useGetSandboxSignet, getGetSandboxSignetQueryKey, useReviewSandboxSignetPayment, useSendSandboxSignetPayment, type PaymentReview, type Transaction, type SandboxSignetStatus } from '@workspace/api-client-react';
import { CopyText, ErrorPanel, Pill, Skel, Stat, statusTone } from '@/components/kit';
import { SandboxCard, SandboxHeader, Reconnecting } from '@/components/sandbox-kit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ago, remaining, satsGrouped, satsToBtc, stamp, useCsrf } from '@/lib/vault';
import { outcomeUnknown } from '@/lib/sandbox';

export const SIGNET_KEY = getGetSandboxSignetQueryKey();
const FRESH_MS = 60000;

export function useSignet() {
  return useGetSandboxSignet({ query: { queryKey: SIGNET_KEY, refetchInterval: 15000, refetchOnWindowFocus: true, refetchOnReconnect: true } });
}

/** Summary card for Sandbox home/status, driven by the live Signet status hook. */
export function SignetSummary() {
  const q = useSignet();
  const s = q.data;
  return (
    <SandboxCard title="Signet" meta="Test network" testId="card-signet">
      {q.isLoading ? <Skel className="h-20" /> : q.isError || !s ? <ErrorPanel error={q.error} onRetry={() => q.refetch()} title="Signet status unavailable" /> : s.available && s.wallet ? (
        <div className="grid gap-2 text-[14px]">
          <Stat label="Confirmed · signet"><span className="font-mono">{satsGrouped(s.wallet.confirmedSats)} sats</span></Stat>
          <div className="text-[12.5px] text-muted-foreground">{s.message}</div>
        </div>
      ) : (
        <div className="flex items-start gap-3 text-[14px] text-muted-foreground"><Ban className="mt-0.5 h-4 w-4 shrink-0" /><p>Unavailable. {s.message}</p></div>
      )}
      <Link href="/sandbox/signet" className="mt-4 inline-flex min-h-11 items-center rounded-full border border-border px-4 text-[14px] font-semibold hover:bg-muted" data-testid="link-signet">Open Signet</Link>
    </SandboxCard>
  );
}

const isIn = (d: string) => /^in/i.test(d) || /receiv/i.test(d);

export default function SignetPage() {
  const q = useSignet();
  const s = q.data;
  return (
    <div className="space-y-5">
      <SandboxHeader kicker="Sandbox · Signet test network" title="Signet" desc="On-chain test coins with no monetary value, separate from your simulated balance." />
      <Reconnecting fetching={q.isRefetching} />
      {q.isLoading && <div className="grid gap-4" data-testid="status-loading"><Skel className="h-48" /><Skel className="h-64" /></div>}
      {q.isError && <ErrorPanel error={q.error} onRetry={() => q.refetch()} title={s ? 'Reconnecting: showing last loaded Signet status' : 'Signet status unavailable'} />}
      {s && (!s.available || !s.wallet ? (
        <SandboxCard title="Unavailable" meta={<Pill>not enabled</Pill>} testId="card-signet-setup">
          <p className="text-[14px] text-muted-foreground" data-testid="text-signet-message">{s.message}</p>
          <p className="mt-3 text-[13px] text-muted-foreground">No balance or address is shown until the server reports an assigned wallet.</p>
          {s.node && <div className="mt-3"><Pill tone={s.node.connected ? 'ok' : 'bad'} dot>{s.node.connected ? 'Signet node connected' : 'Signet node offline'}</Pill></div>}
        </SandboxCard>
      ) : <SignetLive s={s} dataAt={q.dataUpdatedAt} stale={q.isError} />)}
    </div>
  );
}

function SignetLive({ s, dataAt, stale }: { s: SandboxSignetStatus; dataAt: number; stale: boolean }) {
  const w = s.wallet!;
  const n = s.node;
  const fresh = !stale && !!n?.connected && Date.now() - dataAt < FRESH_MS;
  return (
    <>
      <div className="grid gap-5 lg:grid-cols-2">
        <SandboxCard title="Balance" meta="Signet coins · no value" testId="card-signet-balance">
          {fresh ? (
            <>
              <div className="font-mono text-[1.9rem] font-semibold leading-none" data-testid="text-signet-confirmed">{satsToBtc(w.confirmedSats)} sBTC</div>
              <div className="mt-2 font-mono text-[13.5px] text-muted-foreground">{satsGrouped(w.confirmedSats)} sats confirmed · {satsGrouped(w.unconfirmedSats)} pending</div>
              <div className="mt-1 font-mono text-[13px] text-muted-foreground">{satsGrouped(w.availableSats)} sats available</div>
            </>
          ) : <div><div className="font-display text-[1.6rem] font-bold">Balance unknown</div><p className="mt-1 text-[13px] text-muted-foreground">Signet node offline or data stale. Not assumed to be zero.</p></div>}
          <div className="mt-4 flex flex-wrap gap-1.5 text-[12px]">
            {n && <Pill tone={n.connected ? 'ok' : 'bad'} dot>{n.connected ? 'node connected' : 'node offline'}</Pill>}
            {n?.blocks != null && <Pill>{n.blocks.toLocaleString()} blocks</Pill>}
            <Pill>last sync {ago(n?.lastSync ?? w.lastSync)}</Pill>
          </div>
          <p className="mt-3 text-[12.5px] text-muted-foreground">{s.message}</p>
        </SandboxCard>
        <SandboxCard title="Receive" testId="card-signet-receive">
          {w.address && fresh ? (
            <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
              <BrandedQr value={`bitcoin:${w.address}`} size={168} title="Signet receive QR code" testId="img-signet-qr" className="sm:mx-0" />
              <div className="min-w-0">
                <div className="break-all font-mono text-[13.5px]" data-testid="text-signet-address">{w.address}</div>
                <CopyText value={w.address} display="Copy address" className="mt-2 text-[13px]" />
                <p className="mt-3 text-[12.5px] text-warn">Signet only. Never send mainnet Bitcoin to this address.</p>
              </div>
            </div>
          ) : <p className="text-[14px] text-muted-foreground" data-testid="text-signet-no-address">{w.address ? 'Address hidden while Signet data is stale. It will reappear once the node reports fresh data.' : 'The server has not assigned a Signet receive address.'}</p>}
        </SandboxCard>
      </div>
      <SignetSend s={s} fresh={fresh} />
      <SandboxCard title="Activity" testId="card-signet-history">
        {s.transactions.length === 0 ? <p className="text-[14px] text-muted-foreground">No Signet transactions reported by the node.</p> : (
          <ul className="divide-y divide-border">
            {s.transactions.map((t) => (
              <li key={t.txid + t.walletId} className="flex items-start justify-between gap-3 py-3" data-testid={`row-signet-tx-${t.txid}`}>
                <div className="min-w-0"><div className="text-[14px] font-semibold">{isIn(t.direction) ? 'Received' : 'Sent'}</div><CopyText value={t.txid} display={`${t.txid.slice(0, 14)}…${t.txid.slice(-8)}`} className="text-[12px] text-muted-foreground" /><div className="text-[12px] text-muted-foreground">{stamp(t.firstSeen)}</div></div>
                <div className="text-right"><div className="font-mono text-[13.5px]">{isIn(t.direction) ? '+' : '-'}{satsGrouped(t.amountSats)} sats</div><Pill tone={statusTone(t.status)}>{t.status} · {t.confirmations < 0 ? 'conflicted' : `${t.confirmations} conf`}</Pill></div>
              </li>
            ))}
          </ul>
        )}
      </SandboxCard>
    </>
  );
}

function receiptText(tx: Transaction, rv: PaymentReview, at: string) {
  return ['main_vault Sandbox Signet receipt', 'Signet test network coins. No monetary value.', '', `Network: ${rv.network}`, `Status: ${tx.status}${tx.status === 'confirmed' ? '' : ' (not yet confirmed)'}`, `Transaction ID: ${tx.txid}`, `Review ID: ${rv.id}`, `Destination: ${rv.address}`, `Amount: ${rv.amountSats} sats`, `Fee: ${rv.feeSats} sats`, `Total: ${rv.totalSats} sats`, `Confirmations: ${tx.confirmations}`, `Recorded: ${stamp(at)}`].join('\n');
}

function SignetSend({ s, fresh }: { s: SandboxSignetStatus; fresh: boolean }) {
  const qc = useQueryClient();
  const csrf = useCsrf();
  const review = useReviewSandboxSignetPayment(csrf);
  const send = useSendSandboxSignetPayment(csrf);
  const assigned = s.wallet?.address ?? null;
  const [address, setAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [feeRate, setFeeRate] = useState('');
  const [rv, setRv] = useState<PaymentReview | null>(null);
  const [ack, setAck] = useState(false);
  const [unknownId, setUnknownId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ tx: Transaction; rv: PaymentReview; at: string } | null>(null);
  const [, tick] = useState(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (!rv) return; const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, [rv]);

  const destOk = !!assigned && address.trim() === assigned;
  const amtOk = /^[0-9]{1,16}$/.test(amount) && BigInt(amount || '0') > 0n;
  const feeOk = /^[0-9]{1,5}(\.[0-9]{1,3})?$/.test(feeRate);
  const exp = rv ? remaining(rv.expiresAt) : null;
  const refresh = () => qc.invalidateQueries({ queryKey: SIGNET_KEY });

  const doReview = () => review.mutate({ data: { address: address.trim(), amountSats: amount, feeRate } }, { onSuccess: (r) => { if (alive.current) { setRv(r); setAck(false); send.reset(); } } });
  const doSend = () => rv && !unknownId && send.mutate({ data: { reviewId: rv.id, confirmed: true } }, {
    onSuccess: (tx) => { void refresh(); if (alive.current) { setReceipt({ tx, rv, at: new Date().toISOString() }); setRv(null); setAck(false); setAddress(''); setAmount(''); } },
    onError: (e) => { if (outcomeUnknown(e)) { setUnknownId(rv.id); void refresh(); } },
  });
  const download = () => { if (!receipt) return; const url = URL.createObjectURL(new Blob([receiptText(receipt.tx, receipt.rv, receipt.at)], { type: 'text/plain' })); const a = document.createElement('a'); a.href = url; a.download = `sandbox-signet-receipt-${receipt.tx.txid.slice(0, 16)}.txt`; a.click(); URL.revokeObjectURL(url); };

  return (
    <SandboxCard title="Send" meta="To your assigned Signet address" testId="card-signet-send">
      {receipt && (
        <div className="mb-5 rounded-[16px] border border-card-border bg-muted p-4 font-mono text-[13px]" data-testid="card-signet-receipt" aria-live="polite">
          <div className="flex justify-between text-[11.5px] uppercase tracking-[0.14em] text-muted-foreground"><span>Signet receipt · no value</span><span>{receipt.tx.status === 'confirmed' ? 'confirmed' : 'pending'}</span></div>
          <div className="mt-3 break-all">{receipt.tx.txid}</div>
          <CopyText value={receipt.tx.txid} display="copy txid" className="mt-1 text-[12px] text-muted-foreground" />
          <div className="mt-3 grid gap-1 text-muted-foreground"><div>network {receipt.rv.network} · {receipt.tx.confirmations} conf</div><div>amount {satsGrouped(receipt.rv.amountSats)} sats · fee {satsGrouped(receipt.rv.feeSats)} sats</div><div>review {receipt.rv.id}</div></div>
          <div className="mt-4 flex flex-wrap gap-2 font-sans"><Button className="rounded-full" onClick={download} data-testid="button-download-signet-receipt"><Download className="h-4 w-4" /> Download receipt</Button><Button variant="outline" className="rounded-full" onClick={() => setReceipt(null)} data-testid="button-close-signet-receipt">Close</Button></div>
        </div>
      )}
      {!fresh && <p className="mb-4 rounded-xl bg-warn/10 px-3 py-2 text-[13px] text-warn">Sending is disabled while Signet data is stale or the node is offline.</p>}
      {!rv ? (
        <fieldset disabled={!fresh || !assigned || review.isPending} className="grid gap-4 disabled:opacity-60">
          <div className="grid gap-1.5">
            <Label htmlFor="sg-addr">Destination · assigned Signet address</Label>
            <Input id="sg-addr" value={address} onChange={(e) => setAddress(e.target.value)} spellCheck={false} className="h-12 rounded-2xl font-mono" placeholder={assigned ?? 'No address assigned'} data-testid="input-signet-address" />
            <Button type="button" variant="outline" className="w-fit rounded-full" onClick={() => assigned && setAddress(assigned)} data-testid="button-signet-use-assigned">Use assigned address</Button>
            {address && !destOk && <span className="text-[12.5px] text-destructive">Only the assigned Signet address is accepted.</span>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label htmlFor="sg-amt">Amount · sats</Label><Input id="sg-amt" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.trim())} className="h-12 rounded-2xl font-mono" placeholder="10000" data-testid="input-signet-amount" /></div>
            <div className="grid gap-1.5"><Label htmlFor="sg-fee">Fee rate · sat/vB</Label><Input id="sg-fee" inputMode="decimal" value={feeRate} onChange={(e) => setFeeRate(e.target.value.trim())} className="h-12 rounded-2xl font-mono" placeholder="1" data-testid="input-signet-fee" /></div>
          </div>
          {review.isError && <ErrorPanel error={review.error} title="Review rejected" />}
          <Button className="h-12 w-full rounded-full font-bold sm:w-auto sm:px-8" disabled={!destOk || !amtOk || !feeOk} onClick={doReview} data-testid="button-signet-review"><ShieldCheck className="h-4 w-4" /> {review.isPending ? 'Preparing review' : 'Review payment'}</Button>
        </fieldset>
      ) : (
        <div className="grid gap-4">
          <Pill tone={exp && exp.ms > 0 ? 'neutral' : 'bad'}>{exp && exp.ms > 0 ? `Review valid ${Math.ceil(exp.ms / 1000)}s` : 'Review expired'}</Pill>
          <div className="break-all rounded-xl bg-muted p-3 font-mono text-[13.5px]" data-testid="text-signet-review-address">{rv.address}</div>
          <div className="grid grid-cols-1 gap-3 font-mono min-[420px]:grid-cols-3 text-[13px]">
            <Stat label="Amount">{satsGrouped(rv.amountSats)} sats</Stat>
            <Stat label="Fee">{satsGrouped(rv.feeSats)} sats</Stat>
            <Stat label="Total">{satsGrouped(rv.totalSats)} sats</Stat>
          </div>
          <div className="text-[12.5px] text-muted-foreground">Network {rv.network} · review {rv.id}</div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 text-[14px]"><Checkbox checked={ack} onCheckedChange={(v) => setAck(!!v)} data-testid="checkbox-signet-ack" className="mt-0.5" /> I checked the address and amounts. Signet sends cannot be reversed.</label>
          {unknownId ? (
            <div role="alert" className="flex gap-3 rounded-xl border border-warn/40 bg-warn/5 p-3.5 text-[13px]" data-testid="status-signet-unknown">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
              <div>Outcome unknown. Nothing is resent automatically and no new review is created. Check Signet history below after it refreshes. Review ID: <CopyText value={unknownId} className="text-[12px]" />
                <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="outline" className="rounded-full" onClick={() => void refresh()} data-testid="button-signet-check-status"><RefreshCw className="h-3.5 w-3.5" /> Check status</Button>
                  <Button size="sm" variant="outline" className="rounded-full" disabled={send.isPending || !exp || exp.ms <= 0} onClick={() => { const id = unknownId; send.mutate({ data: { reviewId: id, confirmed: true } }, { onSuccess: (tx) => { setUnknownId(null); void refresh(); setReceipt({ tx, rv, at: new Date().toISOString() }); setRv(null); }, onError: (e) => { if (!outcomeUnknown(e)) setUnknownId(null); } }); }} data-testid="button-signet-retry-same">Retry same review</Button></div>
              </div>
            </div>
          ) : send.isError && <ErrorPanel error={send.error} title="Signet send rejected" />}
          <div className="flex flex-wrap gap-2">
            <Button className="h-12 rounded-full px-6 font-bold" disabled={!ack || send.isPending || !!unknownId || !exp || exp.ms <= 0} onClick={doSend} data-testid="button-signet-confirm">{send.isPending ? 'Submitting' : 'Confirm and send'}</Button>
            <Button variant="outline" className="h-12 rounded-full" disabled={send.isPending || !!unknownId} onClick={() => { setRv(null); review.reset(); send.reset(); }} data-testid="button-signet-edit">Edit</Button>
          </div>
        </div>
      )}
    </SandboxCard>
  );
}

import { Link, Route, Switch, useLocation, useParams } from 'wouter';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, FileText, Printer, ShieldCheck, Ban, FlaskConical, Loader2, Search } from 'lucide-react';
import { useGetSandbox, getSandbox, useGetSandboxAddress, getGetSandboxAddressQueryKey, getGetSandboxQueryKey, useReviewSandboxPayment, useExecuteSandboxPayment, type SandboxReview, type SandboxSnapshot, type SandboxReceipt } from '@workspace/api-client-react';
import { CopyText, Empty, ErrorPanel, Pill, Skel, Stat } from '@/components/kit';
import { SandboxCard, SandboxHeader, TestTag, Reconnecting } from '@/components/sandbox-kit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useCsrf, stamp, errMsg } from '@/lib/vault';
import type { ReactNode } from 'react';
import { demoUsd, outcomeUnknown, parseCents } from '@/lib/sandbox';
import NotFound from '@/pages/not-found';
import SignetPage, { SignetSummary, useSignet } from '@/pages/sandbox/signet';
import { SANDBOX_HERO } from '@/lib/assets';

const KEY = getGetSandboxQueryKey();

function useSnap() {
  return useGetSandbox({ query: { queryKey: KEY, refetchInterval: 30000 } });
}

function Loader({ children }: { children: (d: SandboxSnapshot) => ReactNode }) {
  const q = useSnap();
  if (q.isLoading) return <div className="grid gap-4" data-testid="status-loading"><Skel className="h-56" /><Skel className="h-40" /></div>;
  if (q.isError || !q.data) return <ErrorPanel error={q.error} onRetry={() => q.refetch()} title="Sandbox ledger unavailable" />;
  return <div className="space-y-5"><Reconnecting fetching={q.isRefetching} />{children(q.data)}</div>;
}

function Home() {
  return <Loader>{(d) => (<>
    <SandboxHeader title="Sandbox" desc="Practice sending with a simulated ledger. Nothing here is Bitcoin." />
    <figure className="rise relative overflow-hidden rounded-[20px] border border-warn/30">
      <img src={SANDBOX_HERO} alt="" aria-hidden className="h-40 w-full object-cover md:h-52" data-testid="img-sandbox-hero" />
      <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/95 to-transparent p-4 font-display text-[18px] font-bold">Practice with test funds. <span className="block font-sans text-[12.5px] font-normal text-muted-foreground">No real Bitcoin value.</span></figcaption>
    </figure>
    <SandboxCard className="sandbox-card" tag={<TestTag>TEST · Simulation ledger</TestTag>} testId="card-credit">
      <div className="text-[13px] text-muted-foreground">Simulated test credit</div>
      <div className="font-display mt-1 text-[2.6rem] font-bold leading-none tabular-nums" data-testid="text-sandbox-credit">{demoUsd(d.simulatedCreditCents)}</div>
      <p className="mt-3 text-[14px] text-muted-foreground">Demo value only. Not real Bitcoin, not a USD valuation, and not withdrawable.</p>
      <Link href="/sandbox/send" className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-warn px-6 font-bold text-background sm:w-auto" data-testid="link-start-exercise"><FlaskConical className="h-4 w-4" /> Start a simulated exercise</Link>
      <p className="mt-3 text-[12px] text-muted-foreground">{d.message}</p>
    </SandboxCard>
    <div className="grid gap-5 md:grid-cols-2">
      <SignetSummary />
      <SandboxCard title="Keep the modes separate">
        <dl className="grid gap-3 text-[14px]">
          <div><dt className="text-muted-foreground">Simulation source</dt><dd className="font-semibold">Sandbox demo ledger · {demoUsd(d.simulatedCreditCents)}</dd></div>
          <div><dt className="text-muted-foreground">Live funds</dt><dd className="font-semibold">Never shown or touched in Sandbox. Use Return to Live.</dd></div>
        </dl>
        <Link href="/sandbox/status" className="mt-4 inline-block text-[14px] font-semibold underline underline-offset-4" data-testid="link-sandbox-status">View service status</Link>
      </SandboxCard>
    </div>
  </>)}</Loader>;
}

function Wallet() {
  return <Loader>{(d) => (<>
    <SandboxHeader title="Assigned test wallet" desc="The simulation uses a stable server-supplied identifier. It is not a Bitcoin address." />
    <SandboxCard title="Simulation destination" tag={<TestTag>TEST · one assigned identifier</TestTag>} testId="card-assigned">
      {d.assignedAddress ? (<>
        <div className="break-all rounded-2xl bg-muted/60 p-3.5 font-mono text-[14px]" data-testid="text-assigned-id">{d.assignedAddress}</div>
        <CopyText value={d.assignedAddress} display="Copy identifier" className="mt-3 text-[13px]" />
        <p className="mt-4 rounded-2xl border border-warn/30 bg-warn/5 p-3.5 text-[13px] text-muted-foreground">This identifier only exists in the sandbox ledger. Do not send Bitcoin to it; it cannot receive coins on any network.</p>
      </>) : <Empty icon={<Ban className="h-5 w-5" />} title="No identifier assigned" body="The server has not assigned a simulation destination. Simulated payments stay disabled." />}
    </SandboxCard>
    <SignetSummary />
  </>)}</Loader>;
}

function SendPage() {
  return <Loader>{(d) => <SendFlow d={d} />}</Loader>;
}

function SendFlow({ d }: { d: SandboxSnapshot }) {
  const qc = useQueryClient();
  const [, nav] = useLocation();
  const csrf = useCsrf();
  const review = useReviewSandboxPayment(csrf);
  const exec = useExecuteSandboxPayment(csrf);
  const [dest, setDest] = useState('');
  const [amount, setAmount] = useState('');
  const [rv, setRv] = useState<SandboxReview | null>(null);
  const [ack, setAck] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [now, setNow] = useState(Date.now());
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (!rv) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [rv]);

  const [lookup, setLookup] = useState('');
  const [pasteErr, setPasteErr] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const addr = useGetSandboxAddress({ destination: lookup }, { query: { enabled: lookup.length > 0, queryKey: getGetSandboxAddressQueryKey({ destination: lookup }), retry: false } });
  const checking = lookup.length > 0 && addr.isFetching;
  useEffect(() => { if (!checking) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [checking]);
  const elapsed = checking ? Math.floor((now - startedAt) / 1000) : 0;
  const check = (v: string) => { const t = v.trim(); setDest(t); setPasteErr(null); setStartedAt(Date.now()); setNow(Date.now()); if (t && t === lookup) void addr.refetch(); else setLookup(t); };
  const paste = async () => {
    setPasteErr(null);
    try {
      if (!navigator.clipboard?.readText) throw new Error('unsupported');
      const t = (await navigator.clipboard.readText()).trim();
      if (!t) { setPasteErr('Clipboard is empty. Copy the identifier first, or type it into the field and press Check.'); return; }
      check(t);
    } catch {
      setPasteErr('This browser blocked clipboard access. Click the destination field, paste with Ctrl+V or Cmd+V (long-press on mobile), then press Check.');
    }
  };

  const cents = parseCents(amount);
  const assigned = d.assignedAddress;
  const destOk = !!dest && lookup === dest && addr.isSuccess && !addr.isFetching && addr.data?.destination === dest;
  const within = cents !== null && cents <= d.simulatedCreditCents;
  const left = rv ? Math.max(0, Math.ceil((Date.parse(rv.expiresAt) - now) / 1000)) : 0;

  const doReview = () => {
    if (!destOk || !cents || !within) return;
    review.mutate({ data: { amountCents: cents, destination: dest } }, { onSuccess: (r) => { if (alive.current) { setRv(r); setAck(false); setUnknown(false); } } });
  };
  const done = (receiptId: string) => { void qc.invalidateQueries({ queryKey: KEY }); void qc.invalidateQueries({ predicate: (qq) => String(qq.queryKey[0]).startsWith('/api/vault/sandbox/address') }); if (alive.current) nav(`/sandbox/receipt/${encodeURIComponent(receiptId)}`); };
  const reconcile = async () => {
    if (!rv) return;
    const snap = await qc.fetchQuery({ queryKey: KEY, queryFn: () => getSandbox() }).catch(() => null);
    const match = snap?.reviews.find((r) => r.id === rv.id);
    if (match?.status === 'complete' && match.receiptId) done(match.receiptId);
  };
  const submit = () => {
    if (!rv || !ack || exec.isPending) return;
    exec.mutate({ data: { reviewId: rv.id, confirmed: true } }, {
      onSuccess: (r: SandboxReceipt) => done(r.id),
      onError: (e) => { if (outcomeUnknown(e)) { setUnknown(true); void reconcile(); } },
    });
  };

  return (<>
    <SandboxHeader title="Send in Sandbox" desc="Details, review, then an explicit submit. Nothing is signed or broadcast." />
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <SandboxCard title={rv ? 'Review simulated payment' : 'Simulation details'} className={rv ? 'sandbox-card' : ''} testId="card-send">
        {!rv ? (<div className="grid gap-4">
          <div className="rounded-2xl border border-warn/40 bg-warn/5 p-3.5 text-[14px]"><div className="font-semibold text-warn">Simulated exercise · TEST</div><div className="mt-0.5 text-muted-foreground">Internal ledger only. No Bitcoin is signed or sent.</div></div>
          <Link href="/sandbox/signet" className="rounded-2xl border border-border p-3.5 text-[14px] hover:bg-muted" data-testid="link-send-signet"><div className="font-semibold">On-chain Signet test · separate page</div><div className="mt-0.5 text-muted-foreground">Real Signet test transactions, when the server reports it available.</div></Link>
          <div className="grid gap-1.5"><Label>Source ledger · TEST</Label><div className="rounded-2xl border border-border bg-background px-3.5 py-3 text-[14px]" data-testid="text-source">Simulator ledger · {demoUsd(d.simulatedCreditCents)}</div></div>
          <div className="grid gap-1.5">
            <Label htmlFor="sb-dest">Destination · must match the assigned identifier exactly</Label>
            <Input id="sb-dest" value={dest} onChange={(e) => { setDest(e.target.value); setPasteErr(null); }} onKeyDown={(e) => e.key === 'Enter' && dest.trim() && check(dest)} spellCheck={false} className="h-12 rounded-2xl font-mono" placeholder={assigned ?? 'No identifier assigned'} data-testid="input-sandbox-destination" />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="rounded-full" disabled={!assigned} onClick={() => assigned && check(assigned)} data-testid="button-use-assigned">Use assigned identifier</Button>
              <Button type="button" variant="outline" className="rounded-full" onClick={paste} data-testid="button-paste">Paste</Button>
              <Button type="button" variant="outline" className="rounded-full" disabled={!dest.trim() || checking} onClick={() => check(dest)} data-testid="button-check-destination"><Search className="h-4 w-4" /> Check</Button>
            </div>
            {pasteErr && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive" data-testid="text-paste-error">{pasteErr}</p>}
            {checking && <p role="status" className="flex items-center gap-2 text-[12.5px] text-muted-foreground" data-testid="status-lookup"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {elapsed > 8 ? `Still checking with the sandbox ledger (${elapsed}s). Review stays locked until a response arrives.` : 'Checking with the sandbox ledger'}</p>}
            {!checking && lookup && lookup === dest && addr.isError && <div data-testid="text-dest-error"><ErrorPanel error={addr.error} onRetry={() => { setStartedAt(Date.now()); void addr.refetch(); }} title="Destination not accepted" /></div>}
            {!checking && lookup !== dest.trim() && dest.trim() && <p className="text-[12.5px] text-muted-foreground">Destination changed. Press Check to verify it before review.</p>}
            {destOk && addr.data && (
              <div className="rounded-xl border border-warn/30 bg-warn/5 p-3 text-[12.5px]" data-testid="card-lookup-result">
                <div className="font-semibold text-warn">Verified sandbox identifier · simulation</div>
                <div className="mt-1 text-muted-foreground">Simulated credit {demoUsd(addr.data.simulatedCreditCents)} · {addr.data.transactionCount} simulated entr{addr.data.transactionCount === 1 ? 'y' : 'ies'} · checked {stamp(addr.data.checkedAt)}</div>
                <div className="mt-0.5 text-muted-foreground">Answered by this server's sandbox ledger only. No external provider was contacted.</div>
                {addr.data.transactions.length > 0 && <details className="mt-2"><summary className="cursor-pointer">Recent simulated history</summary><ul className="mt-2 space-y-2">{addr.data.transactions.slice(0, 5).map(t => <li key={t.id}><Link href={`/sandbox/receipt/${encodeURIComponent(t.id)}`} className="underline">{demoUsd(t.amountCents)} · {stamp(t.createdAt)}</Link></li>)}</ul></details>}
              </div>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sb-amt">Simulated amount · demoUSD</Label>
            <Input id="sb-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-12 rounded-2xl font-mono text-lg" placeholder="25.00" data-testid="input-sandbox-amount" />
            {amount && cents === null && <span className="text-[12.5px] text-destructive">Enter an amount like 25.00</span>}
            {cents !== null && !within && <span className="text-[12.5px] text-destructive">Exceeds simulated credit.</span>}
          </div>
          <div className="text-[13px] text-muted-foreground">Fee rate · not applicable to simulation</div>
          {review.isError && <ErrorPanel error={review.error} title="Review rejected" />}
          <Button className="h-12 rounded-full font-bold" disabled={!destOk || !within || review.isPending} onClick={doReview} data-testid="button-sandbox-review"><ShieldCheck className="h-4 w-4" /> {review.isPending ? 'Preparing review' : 'Review payment'}</Button>
          {!destOk && <p className="text-[12.5px] text-warn">{assigned ? 'Review unlocks after the current destination is checked successfully.' : 'Review unavailable: no simulation identifier is assigned.'}</p>}
        </div>) : (<div className="grid gap-4">
          <Pill tone={left > 0 ? 'warn' : 'bad'}>{left > 0 ? `Review valid ${left}s` : 'Review expired'}</Pill>
          <Stat label="Amount · demoUSD"><span className="font-display text-3xl font-bold" data-testid="text-review-amount">{demoUsd(rv.amountCents)}</span></Stat>
          <div><div className="text-[12px] text-muted-foreground">Destination identifier</div><div className="mt-1 break-all rounded-2xl bg-muted/60 p-3 font-mono text-[14px]" data-testid="text-review-destination">{rv.destination}</div></div>
          <div className="text-[12.5px] text-muted-foreground">Review {rv.id} · created {stamp(rv.createdAt)}</div>
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border p-3 text-[14px]"><Checkbox checked={ack} onCheckedChange={(v) => setAck(!!v)} data-testid="checkbox-sandbox-ack" className="mt-0.5" /> I understand this is a simulation. No Bitcoin moves and the receipt is a TEST document.</label>
          {unknown && <div role="status" className="rounded-2xl border border-warn/40 bg-warn/5 p-3 text-[13px]">The response was interrupted; the result is not yet confirmed. Check status or retry the same review. The server applies each review at most once. Do not create a replacement payment.</div>}
          {exec.isError && !unknown && <ErrorPanel error={exec.error} title="Simulation rejected" />}
          {exec.isError && unknown && <p className="font-mono text-[11.5px] text-muted-foreground">{errMsg(exec.error)}</p>}
          <div className="flex flex-wrap gap-2">
            <Button className="h-12 rounded-full bg-warn px-6 font-bold text-background hover:bg-warn/90" disabled={!ack || exec.isPending || (left <= 0 && !unknown)} onClick={submit} data-testid="button-sandbox-submit">{exec.isPending ? 'Submitting' : unknown ? 'Retry same review' : 'Submit simulation'}</Button>
            {unknown && <Button variant="outline" className="h-12 rounded-full" onClick={() => void reconcile()} disabled={exec.isPending} data-testid="button-sandbox-reconcile">Check status</Button>}
            <Button variant="outline" className="h-12 rounded-full" disabled={exec.isPending || unknown} onClick={() => { setRv(null); setAck(false); setUnknown(false); review.reset(); exec.reset(); }} data-testid="button-sandbox-edit">Discard review</Button>
          </div>
        </div>)}
      </SandboxCard>
      <SandboxCard title="How this works">
        <ol className="grid gap-2 text-[14px] text-muted-foreground"><li>1. Details stay on this page.</li><li>2. Review is held by the server for a short time.</li><li>3. Submit applies it once to the demo ledger.</li></ol>
        <p className="mt-3 text-[12.5px] text-muted-foreground">Leaving this page clears the form; an unsubmitted server review expires after five minutes. Leaving does not cancel a submitted payment.</p>
      </SandboxCard>
    </div>
  </>);
}

function ActivityPage() {
  return <Loader>{(d) => (<>
    <SandboxHeader title="Sandbox activity" desc="Simulated entries on the demo ledger. No transaction IDs exist." />
    {d.transactions.length === 0 ? <Empty icon={<FileText className="h-5 w-5" />} title="No simulations yet" body="Run a simulated exercise to see it here." action={<Link href="/sandbox/send" className="font-semibold underline" data-testid="link-empty-send">Start one</Link>} /> : (
      <SandboxCard className="p-0 md:p-0"><ul className="divide-y divide-border">
        {d.transactions.map((t) => (
          <li key={t.id}><Link href={`/sandbox/receipt/${encodeURIComponent(t.id)}`} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-muted/50" data-testid={`row-sandbox-tx-${t.id}`}>
            <div className="min-w-0"><div className="font-semibold">Simulated send · TEST</div><div className="truncate text-[12.5px] text-muted-foreground">{stamp(t.createdAt)} · {t.destination}</div></div>
            <div className="text-right"><div className="font-mono font-semibold">-{demoUsd(t.amountCents)}</div><div className="text-[12px] text-muted-foreground">after {demoUsd(t.balanceAfterCents)}</div></div>
          </Link></li>))}
      </ul></SandboxCard>)}
    {d.reviews.some((r) => r.status === 'pending') && <p className="text-[12.5px] text-muted-foreground">{d.reviews.filter((r) => r.status === 'pending').length} unsubmitted review(s) will expire on their own.</p>}
  </>)}</Loader>;
}

function receiptText(t: SandboxReceipt) {
  return ['main_vault SANDBOX TEST RECEIPT', 'NOT A BITCOIN TRANSACTION. NO REAL VALUE. NO TXID.', '', `Receipt: ${t.id}`, `Status: ${t.status}`, `Amount: ${demoUsd(t.amountCents)}`, `Destination identifier: ${t.destination}`, `Ledger balance after: ${demoUsd(t.balanceAfterCents)}`, `Created: ${stamp(t.createdAt)}`].join('\n');
}

function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  return <Loader>{(d) => {
    const t = d.transactions.find((x) => x.id === id);
    if (!t) return <Empty icon={<FileText className="h-5 w-5" />} title="Receipt not found" body="No simulated entry with this ID is on the demo ledger." action={<Link href="/sandbox/activity" className="font-semibold underline" data-testid="link-back-activity">Back to activity</Link>} />;
    const download = () => { const url = URL.createObjectURL(new Blob([receiptText(t)], { type: 'text/plain' })); const a = document.createElement('a'); a.href = url; a.download = `sandbox-test-receipt-${t.id}.txt`; a.click(); URL.revokeObjectURL(url); };
    return (<>
      <SandboxHeader title="TEST receipt" desc="Simulation complete. This document is not proof of any Bitcoin payment." />
      <SandboxCard className="print-sheet sandbox-card" testId="card-receipt">
        <div className="text-[12px] font-bold tracking-wide text-warn">SANDBOX · TEST · NO REAL VALUE · NO TXID</div>
        <div className="font-display mt-3 text-[2.2rem] font-bold" data-testid="text-receipt-amount">{demoUsd(t.amountCents)}</div>
        <dl className="mt-4 grid gap-3 text-[14px] sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Receipt ID</dt><dd><CopyText value={t.id} className="text-[13px]" /></dd></div>
          <div><dt className="text-muted-foreground">Status</dt><dd className="font-semibold">Simulation complete</dd></div>
          <div className="sm:col-span-2"><dt className="text-muted-foreground">Destination identifier</dt><dd className="break-all font-mono">{t.destination}</dd></div>
          <div><dt className="text-muted-foreground">Ledger balance after</dt><dd className="font-semibold">{demoUsd(t.balanceAfterCents)}</dd></div>
          <div><dt className="text-muted-foreground">Created</dt><dd>{stamp(t.createdAt)}</dd></div>
        </dl>
      </SandboxCard>
      <div className="no-print flex flex-wrap gap-2">
        <Button className="rounded-full" onClick={() => window.print()} data-testid="button-print-receipt"><Printer className="h-4 w-4" /> Print</Button>
        <Button variant="outline" className="rounded-full" onClick={download} data-testid="button-download-receipt"><Download className="h-4 w-4" /> Download</Button>
        <Link href="/sandbox/activity" className="pill-btn" data-testid="link-receipt-activity">All activity</Link>
      </div>
    </>);
  }}</Loader>;
}

function StatusPage() {
  const q = useSnap();
  const sg = useSignet();
  return <Loader>{(d) => (<>
    <SandboxHeader title="Sandbox status" />
    <SandboxCard title="Services">
      <ul className="grid gap-3 text-[14px]">
        <li className="flex justify-between gap-3"><span>Simulation ledger</span><Pill tone="ok" dot>available</Pill></li>
        <li className="flex justify-between gap-3"><span>Assigned identifier</span><Pill tone={d.assignedAddress ? 'ok' : 'warn'}>{d.assignedAddress ? 'assigned' : 'not assigned'}</Pill></li>
        <li className="flex justify-between gap-3"><span>Signet node and wallet</span><Pill tone={sg.isError ? 'bad' : sg.data?.available ? 'ok' : 'warn'}>{sg.isLoading ? 'checking' : sg.isError ? 'unreachable' : sg.data?.available ? 'available' : 'setup required'}</Pill></li>
        <li className="flex justify-between gap-3"><span>Live API and signing engine</span><Pill tone="neutral">not connected to Sandbox</Pill></li>
      </ul>
      <p className="mt-4 text-[13px] text-muted-foreground" data-testid="text-sandbox-message">{d.message}</p>
      <p className="mt-2 text-[12px] text-muted-foreground">Last snapshot {q.dataUpdatedAt ? stamp(new Date(q.dataUpdatedAt).toISOString()) : '—'}</p>
    </SandboxCard>
    <SignetSummary />
  </>)}</Loader>;
}

export default function SandboxRouter() {
  return (
    <Switch>
      <Route path="/sandbox" component={Home} />
      <Route path="/sandbox/wallet" component={Wallet} />
      <Route path="/sandbox/send" component={SendPage} />
      <Route path="/sandbox/activity" component={ActivityPage} />
      <Route path="/sandbox/receipt/:id" component={ReceiptPage} />
      <Route path="/sandbox/status" component={StatusPage} />
      <Route path="/sandbox/signet" component={SignetPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

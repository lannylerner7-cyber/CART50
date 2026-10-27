import { Link, Route, Switch, useLocation, useParams } from 'wouter';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, FileText, Printer, ShieldCheck, Ban, Loader2, Search } from 'lucide-react';
import { useGetSandbox, getSandbox, useGetSandboxAddress, getGetSandboxAddressQueryKey, getGetSandboxQueryKey, useReviewSandboxPayment, useExecuteSandboxPayment, type SandboxReview, type SandboxSnapshot, type SandboxReceipt } from '@workspace/api-client-react';
import { CopyText, Empty, ErrorPanel, Panel, Pill, Skel, Stat } from '@/components/kit';
import { SandboxCard, SandboxHeader, Reconnecting } from '@/components/sandbox-kit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useCsrf, stamp, errMsg } from '@/lib/vault';
import type { ReactNode } from 'react';
import { demoUsd, outcomeUnknown, parseCents } from '@/lib/sandbox';
import NotFound from '@/pages/not-found';
import SignetPage, { SignetSummary, useSignet } from '@/pages/sandbox/signet';

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
    <SandboxHeader title="Your vault" />
    <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
      <div className="min-w-0 space-y-5">
        <section className="rise rounded-[20px] border border-card-border bg-card p-5 md:p-6" data-testid="card-credit">
          <div className="text-[13px] font-medium text-muted-foreground">Available balance</div>
          <div className="mt-0.5 text-[12.5px] text-muted-foreground">Simulated balance · demoUSD</div>
          <div className="font-display mt-3 text-[2.4rem] font-bold leading-none tabular-nums" data-testid="text-sandbox-credit">{demoUsd(d.simulatedCreditCents).replace(/ demoUSD$/, '')}</div>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            <Link href="/sandbox/wallet" className="grid h-12 place-items-center rounded-[14px] bg-primary text-[15px] font-semibold text-primary-foreground transition-transform active:scale-[0.98]" data-testid="link-action-wallet">Wallet</Link>
            <Link href="/sandbox/send" className="grid h-12 place-items-center rounded-[14px] bg-primary/90 text-[15px] font-semibold text-primary-foreground transition-transform active:scale-[0.98]" data-testid="link-start-exercise">Send</Link>
          </div>
        </section>
        <Panel title="Recent activity" meta={<Link href="/sandbox/activity" className="font-semibold text-foreground underline underline-offset-4" data-testid="link-all-activity">View all</Link>}>
          {d.transactions.length === 0 ? <Empty icon={<FileText className="h-5 w-5" />} title="No activity yet" body="Payments you send appear here." /> : <TxList items={d.transactions.slice(0, 5)} />}
        </Panel>
      </div>
      <div className="min-w-0 space-y-5">
        <SignetSummary />
        <Panel title="Workspace status" meta={<Link href="/sandbox/status" className="font-semibold text-foreground underline underline-offset-4" data-testid="link-sandbox-status">Details</Link>}>
          <dl className="grid grid-cols-2 gap-3 text-[13.5px]">
            <div><dt className="text-muted-foreground">Ledger</dt><dd className="font-semibold">Available</dd></div>
            <div><dt className="text-muted-foreground">Destination</dt><dd className="font-semibold">{d.assignedAddress ? 'Assigned' : 'Not assigned'}</dd></div>
          </dl>
        </Panel>
      </div>
    </div>
  </>)}</Loader>;
}

function TxList({ items }: { items: SandboxReceipt[] }) {
  return <ul className="divide-y divide-border">
    {items.map((t) => (
      <li key={t.id}><Link href={`/sandbox/receipt/${encodeURIComponent(t.id)}`} className="-mx-2 flex items-center justify-between gap-3 rounded-xl px-2 py-3.5 hover:bg-muted/50" data-testid={`row-sandbox-tx-${t.id}`}>
        <div className="min-w-0"><div className="text-[14.5px] font-semibold">Sent</div><div className="truncate text-[12.5px] text-muted-foreground">{stamp(t.createdAt)} · {t.destination}</div></div>
        <div className="shrink-0 text-right"><div className="font-mono text-[14px] font-semibold">-{demoUsd(t.amountCents)}</div><div className="text-[12px] text-muted-foreground">Complete</div></div>
      </Link></li>))}
  </ul>;
}

function Wallet() {
  return <Loader>{(d) => (<>
    <SandboxHeader title="Wallets" desc="Your assigned destination for practice payments." />
    <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
      <SandboxCard title="Sandbox wallet" meta={<Pill tone={d.assignedAddress ? 'ok' : 'neutral'} dot>{d.assignedAddress ? 'Active' : 'Not assigned'}</Pill>} testId="card-assigned">
        <Stat label="Simulated balance"><span className="font-display text-2xl font-bold tabular-nums">{demoUsd(d.simulatedCreditCents)}</span></Stat>
        {d.assignedAddress ? (<div className="mt-4">
          <div className="text-[12px] text-muted-foreground">Destination identifier</div>
          <div className="mt-1 break-all rounded-2xl bg-muted p-3.5 font-mono text-[14px]" data-testid="text-assigned-id">{d.assignedAddress}</div>
          <CopyText value={d.assignedAddress} display="Copy identifier" className="mt-3 text-[13px]" />
          <p className="mt-3 text-[12.5px] text-muted-foreground">Sandbox ledger identifier. It cannot receive Bitcoin.</p>
        </div>) : <div className="mt-4"><Empty icon={<Ban className="h-5 w-5" />} title="No identifier assigned" body="Sending stays disabled until the server assigns one." /></div>}
      </SandboxCard>
      <SignetSummary />
    </div>
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
    <SandboxHeader title="Send" desc="Enter details, review, then confirm." />
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <SandboxCard title={rv ? 'Confirm details' : 'Payment details'} testId="card-send">
        {!rv ? (<div className="grid gap-4">
          <div className="grid gap-1.5"><Label>From</Label><div className="rounded-2xl border border-border bg-background px-3.5 py-3 text-[14px]" data-testid="text-source">Sandbox wallet · {demoUsd(d.simulatedCreditCents)} simulated balance</div></div>
          <div className="grid gap-1.5">
            <Label htmlFor="sb-dest">Destination</Label>
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
              <div className="rounded-xl border border-ok/30 bg-ok/5 p-3 text-[12.5px]" data-testid="card-lookup-result">
                <div className="font-semibold text-ok">Destination verified</div>
                <div className="mt-1 text-muted-foreground">Balance {demoUsd(addr.data.simulatedCreditCents)} · {addr.data.transactionCount} entr{addr.data.transactionCount === 1 ? 'y' : 'ies'} · checked {stamp(addr.data.checkedAt)}</div>
                {addr.data.transactions.length > 0 && <details className="mt-2"><summary className="cursor-pointer">Recent history</summary><ul className="mt-2 space-y-2">{addr.data.transactions.slice(0, 5).map(t => <li key={t.id}><Link href={`/sandbox/receipt/${encodeURIComponent(t.id)}`} className="underline">{demoUsd(t.amountCents)} · {stamp(t.createdAt)}</Link></li>)}</ul></details>}
              </div>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sb-amt">Amount · demoUSD</Label>
            <Input id="sb-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-12 rounded-2xl font-mono text-lg" placeholder="25.00" data-testid="input-sandbox-amount" />
            {amount && cents === null && <span className="text-[12.5px] text-destructive">Enter an amount like 25.00</span>}
            {cents !== null && !within && <span className="text-[12.5px] text-destructive">Exceeds available balance.</span>}
          </div>
          {review.isError && <ErrorPanel error={review.error} title="Review rejected" />}
          <Button className="h-12 rounded-full font-bold" disabled={!destOk || !within || review.isPending} onClick={doReview} data-testid="button-sandbox-review"><ShieldCheck className="h-4 w-4" /> {review.isPending ? 'Preparing review' : 'Review payment'}</Button>
          {!destOk && <p className="text-[12.5px] text-muted-foreground">{assigned ? 'Review unlocks after the current destination is checked successfully.' : 'Review unavailable: no simulation identifier is assigned.'}</p>}
        </div>) : (<div className="grid gap-4">
          <Pill tone={left > 0 ? 'neutral' : 'bad'}>{left > 0 ? `Review valid ${left}s` : 'Review expired'}</Pill>
          <Stat label="Amount · demoUSD"><span className="font-display text-3xl font-bold" data-testid="text-review-amount">{demoUsd(rv.amountCents)}</span></Stat>
          <div><div className="text-[12px] text-muted-foreground">Destination identifier</div><div className="mt-1 break-all rounded-2xl bg-muted/60 p-3 font-mono text-[14px]" data-testid="text-review-destination">{rv.destination}</div></div>
          <div className="text-[12.5px] text-muted-foreground">Review {rv.id} · created {stamp(rv.createdAt)}</div>
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border p-3 text-[14px]"><Checkbox checked={ack} onCheckedChange={(v) => setAck(!!v)} data-testid="checkbox-sandbox-ack" className="mt-0.5" /> I checked the destination and amount. This is a sandbox payment with no real value.</label>
          {unknown && <div role="status" className="rounded-2xl border border-warn/40 bg-warn/5 p-3 text-[13px]" data-testid="status-sandbox-unknown">The response was interrupted; the result is not yet confirmed. Check status or retry the same review. The server applies each review at most once. Do not create a replacement payment.</div>}
          {exec.isError && !unknown && <ErrorPanel error={exec.error} title="Payment rejected" />}
          {exec.isError && unknown && <p className="font-mono text-[11.5px] text-muted-foreground">{errMsg(exec.error)}</p>}
          <div className="flex flex-wrap gap-2">
            <Button className="h-12 rounded-full px-6 font-bold" disabled={!ack || exec.isPending || (left <= 0 && !unknown)} onClick={submit} data-testid="button-sandbox-submit">{exec.isPending ? 'Submitting' : unknown ? 'Retry same review' : 'Confirm and send'}</Button>
            {unknown && <Button variant="outline" className="h-12 rounded-full" onClick={() => void reconcile()} disabled={exec.isPending} data-testid="button-sandbox-reconcile">Check status</Button>}
            <Button variant="outline" className="h-12 rounded-full" disabled={exec.isPending || unknown} onClick={() => { setRv(null); setAck(false); setUnknown(false); review.reset(); exec.reset(); }} data-testid="button-sandbox-edit">Discard review</Button>
          </div>
        </div>)}
      </SandboxCard>
      <div className="space-y-5">
        <SandboxCard title="Available"><span className="font-display text-2xl font-bold tabular-nums">{demoUsd(d.simulatedCreditCents)}</span><div className="mt-1 text-[12.5px] text-muted-foreground">Simulated balance</div></SandboxCard>
        <Link href="/sandbox/signet" className="block rounded-[20px] border border-card-border bg-card p-5 text-[14px] hover:bg-muted/50" data-testid="link-send-signet"><div className="font-semibold">Signet</div><div className="mt-0.5 text-muted-foreground">On-chain test network, when available.</div></Link>
        <p className="px-1 text-[12.5px] text-muted-foreground">Reviews expire after five minutes. Leaving does not cancel a submitted payment.</p>
      </div>
    </div>
  </>);
}

function ActivityPage() {
  return <Loader>{(d) => (<>
    <SandboxHeader title="Activity" desc="Every payment on your sandbox ledger." />
    {d.transactions.length === 0 ? <Empty icon={<FileText className="h-5 w-5" />} title="No activity yet" body="Payments you send appear here." action={<Link href="/sandbox/send" className="font-semibold underline" data-testid="link-empty-send">Send</Link>} /> : (
      <Panel><TxList items={d.transactions} /></Panel>)}
    {d.reviews.some((r) => r.status === 'pending') && <p className="text-[12.5px] text-muted-foreground">{d.reviews.filter((r) => r.status === 'pending').length} unsubmitted review(s) will expire on their own.</p>}
  </>)}</Loader>;
}

function receiptText(t: SandboxReceipt) {
  return ['main_vault Sandbox receipt', 'Simulation only. Not a Bitcoin transaction. No real value. No transaction ID.', '', `Receipt: ${t.id}`, `Status: ${t.status}`, `Amount: ${demoUsd(t.amountCents)}`, `Destination identifier: ${t.destination}`, `Ledger balance after: ${demoUsd(t.balanceAfterCents)}`, `Created: ${stamp(t.createdAt)}`].join('\n');
}

function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  return <Loader>{(d) => {
    const t = d.transactions.find((x) => x.id === id);
    if (!t) return <Empty icon={<FileText className="h-5 w-5" />} title="Receipt not found" body="No simulated entry with this ID is on the demo ledger." action={<Link href="/sandbox/activity" className="font-semibold underline" data-testid="link-back-activity">Back to activity</Link>} />;
    const download = () => { const url = URL.createObjectURL(new Blob([receiptText(t)], { type: 'text/plain' })); const a = document.createElement('a'); a.href = url; a.download = `sandbox-test-receipt-${t.id}.txt`; a.click(); URL.revokeObjectURL(url); };
    return (<>
      <SandboxHeader title="Receipt" desc="Payment complete." />
      <SandboxCard className="print-sheet" testId="card-receipt">
        <div className="hidden text-[12px] font-bold print:block">main_vault Sandbox receipt. Simulation only, no real value, no transaction ID.</div>
        <div className="flex items-start justify-between gap-3">
          <div className="font-display text-[2.2rem] font-bold" data-testid="text-receipt-amount">{demoUsd(t.amountCents)}</div>
          <Pill tone="cold" className="no-print" testId="status-receipt-simulation">Simulation · no real value</Pill>
        </div>
        <dl className="mt-4 grid gap-3 text-[14px] sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Receipt ID</dt><dd><CopyText value={t.id} className="text-[13px]" /></dd></div>
          <div><dt className="text-muted-foreground">Status</dt><dd className="font-semibold">Complete</dd></div>
          <div className="sm:col-span-2"><dt className="text-muted-foreground">Destination identifier</dt><dd className="break-all font-mono">{t.destination}</dd></div>
          <div><dt className="text-muted-foreground">Balance after</dt><dd className="font-semibold">{demoUsd(t.balanceAfterCents)}</dd></div>
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
    <SandboxHeader title="Status" desc="Services behind your sandbox." />
    <SandboxCard title="Services">
      <ul className="grid gap-3 text-[14px]">
        <li className="flex justify-between gap-3"><span>Simulation ledger</span><Pill tone="ok" dot>available</Pill></li>
        <li className="flex justify-between gap-3"><span>Assigned identifier</span><Pill tone={d.assignedAddress ? 'ok' : 'neutral'}>{d.assignedAddress ? 'assigned' : 'not assigned'}</Pill></li>
        <li className="flex justify-between gap-3"><span>Signet node and wallet</span><Pill tone={sg.isError ? 'bad' : sg.data?.available ? 'ok' : 'neutral'}>{sg.isLoading ? 'checking' : sg.isError ? 'unreachable' : sg.data?.available ? 'available' : 'setup required'}</Pill></li>
        <li className="flex justify-between gap-3"><span>Live API and signing engine</span><Pill tone="neutral">separate from Sandbox</Pill></li>
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

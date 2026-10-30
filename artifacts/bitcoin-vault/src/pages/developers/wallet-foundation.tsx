import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'wouter';
import {
  getWalletFoundationSession, getWalletFoundationView, walletFoundationCommand,
  type FoundationCommandAction, type FoundationPage, type FoundationSession, type GetWalletFoundationViewKind,
} from '@workspace/api-client-react';
import {
  type Rec, str, num, fmtSats, errStatusOf, errText, definitive, newKey, Field, inputCls, btnCls, ghostCls,
  Section, Alert, Tag, toneFor, ReceiptActions, Pager,
} from '@/components/wallet-foundation-kit';
import { DeveloperWalletKey } from '@/components/developer-wallet-key';

type Kind = GetWalletFoundationViewKind;
type Coll = { items: Rec[]; next: number | null; stack: number[]; loading: boolean; error: string | null };
const KINDS: Kind[] = ['customer', 'wallet', 'assignment', 'deposit', 'withdrawal', 'transfer', 'event', 'fee', 'audit', 'usage'];
const emptyColl = (): Coll => ({ items: [], next: null, stack: [0], loading: false, error: null });
const emptyAll = () => Object.fromEntries(KINDS.map((k) => [k, emptyColl()])) as Record<Kind, Coll>;

/** Isolated manual state: no shared QueryClient, token held only in a ref (memory). */
export default function WalletFoundationPage() {
  const [session, setSession] = useState<FoundationSession | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const tokenRef = useRef<string | null>(null);
  const [authed, setAuthed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [meta, setMeta] = useState<Pick<FoundationPage, 'role' | 'tenant' | 'control' | 'fee' | 'liveEnabled' | 'environment'> | null>(null);
  const [colls, setColls] = useState<Record<Kind, Coll>>(emptyAll);
  const gen = useRef(0);

  const probe = useCallback(() => {
    setUnavailable(false); setSession(null);
    getWalletFoundationSession()
      .then((s) => (s && s.enabled === true && s.environment === 'local-simulation' ? setSession(s) : setUnavailable(true)))
      .catch(() => setUnavailable(true));
  }, []);
  useEffect(probe, [probe]);

  const clearAll = useCallback((msg: string | null) => {
    gen.current++;
    tokenRef.current = null;
    pending.current = {};
    setAuthed(false); setMeta(null); setColls(emptyAll()); setNotice(msg);
  }, []);
  useEffect(() => () => { tokenRef.current = null; }, []);

  const handle401 = useCallback((e: unknown) => {
    if (errStatusOf(e) === 401) { clearAll('Credential rejected, expired, or account suspended/revoked. All protected data was cleared from this page.'); return true; }
    return false;
  }, [clearAll]);


  const load = useCallback(async (kind: Kind, after: number, stack?: number[]) => {
    const g = gen.current;
    setColls((c) => ({ ...c, [kind]: { ...c[kind], loading: true, error: null } }));
    try {
      const p = await getWalletFoundationView({ kind, after }, { headers: { Authorization: `Bearer ${tokenRef.current ?? ''}` } });
      if (g !== gen.current) return;
      setMeta({ role: p.role, tenant: p.tenant, control: p.control, fee: p.fee, liveEnabled: p.liveEnabled, environment: p.environment });
      setColls((c) => ({ ...c, [kind]: { items: p.items, next: p.nextCursor, stack: stack ?? c[kind].stack, loading: false, error: null } }));
    } catch (e) {
      if (g !== gen.current || handle401(e)) return;
      setColls((c) => ({ ...c, [kind]: { ...c[kind], loading: false, error: errText(e) } }));
    }
  }, [handle401]);

  const refreshAll = useCallback(() => { KINDS.forEach((k) => { void load(k, 0, [0]); }); }, [load]);

  const signIn = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem('token') as HTMLInputElement;
    const v = input.value.trim();
    input.value = '';
    if (!v) return;
    tokenRef.current = v; setNotice(null); setAuthed(true);
    refreshAll();
  };

  /** Command runner with stable idempotency keys per pending input fingerprint. */
  const pending = useRef<Record<string, { key: string; fp: string }>>({});
  const run = useCallback(async (slot: string, action: FoundationCommandAction, data: Rec): Promise<{ ok: true; rec: Rec } | { ok: false; error: string }> => {
    const fp = JSON.stringify({ action, data });
    const prior = pending.current[slot];
    if (prior && prior.fp !== fp) return { ok: false, error: 'An earlier request has an unknown result. Restore its inputs and retry that same request before starting another.' };
    const key = prior && prior.fp === fp ? prior.key : newKey();
    pending.current[slot] = { key, fp };
    const g = gen.current;
    try {
      const rec = await walletFoundationCommand({ action, data }, { headers: { Authorization: `Bearer ${tokenRef.current ?? ''}`, 'Idempotency-Key': key } });
      if (g !== gen.current) return { ok: false, error: 'Session changed; recheck the operation in history.' };
      delete pending.current[slot];
      if (g === gen.current) refreshAll();
      return { ok: true, rec };
    } catch (e) {
      if (g !== gen.current) return { ok: false, error: 'Session changed; recheck the operation in history.' };
      if (handle401(e)) { pending.current = {}; return { ok: false, error: 'Credential expired.' }; }
      if (definitive(e)) delete pending.current[slot];
      return { ok: false, error: errText(e) };
    }
  }, [handle401, refreshAll]);

  if (unavailable) return <Frame><Unavailable onRetry={probe} /></Frame>;
  if (!session) return <Frame><p role="status" className="text-sm text-muted-foreground">Checking local foundation service…</p></Frame>;

  if (!authed) {
    return (
      <Frame>
        <DeveloperWalletKey />
        <Section title="Open local foundation profile">
          <form onSubmit={signIn} className="flex max-w-md flex-col gap-3" autoComplete="off">
            <Field label="Local fixture bearer token" hint="Held in memory only for this tab. Never stored, never logged. Reload to forget it.">
              <input name="token" type="password" required autoComplete="off" spellCheck={false} className={inputCls} />
            </Field>
            <button className={btnCls} type="submit">Open profile</button>
            <Alert text={notice} />
          </form>
        </Section>
        <Readiness />
      </Frame>
    );
  }

  const C = (k: Kind) => colls[k];
  const pager = (k: Kind) => {
    const c = C(k);
    return <Pager count={c.items.length} loading={c.loading} hasPrev={c.stack.length > 1} hasNext={c.next !== null}
      onPrev={() => { const s = c.stack.slice(0, -1); void load(k, s[s.length - 1], s); }}
      onNext={() => { if (c.next !== null) void load(k, c.next, [...c.stack, c.next]); }} />;
  };
  const control = (meta?.control ?? {}) as Rec;
  const fee = (meta?.fee ?? {}) as Rec;
  const status = str(control.status) || 'active';

  return (
    <Frame>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-xs">
        <Tag>{str(meta?.environment) || 'local-simulation'}</Tag>
        <Tag>role: {str(meta?.role) || '…'}</Tag>
        <Tag>tenant: {str(meta?.tenant) || '…'}</Tag>
        <Tag tone={toneFor(status)}>account {status}</Tag>
        <Tag tone="bad">live disabled</Tag>
        <span className="text-muted-foreground">Fee policy v{num(fee.version)}: {num(fee.fixedSats)} sats + {num(fee.bps)} bps</span>
        <div className="ml-auto flex gap-1.5">
          <button type="button" className={ghostCls} onClick={refreshAll}>Refresh</button>
          <button type="button" className={ghostCls} onClick={() => clearAll('Signed out. Token and all data cleared.')}>Sign out</button>
        </div>
      </div>
      {status !== 'active' && <p role="alert" className="text-xs text-destructive">Account is {status}{control.reason ? `: ${str(control.reason)}` : ''}. Writes are disabled.</p>}

      {meta?.role === 'admin' ? (<>
      <AdminControl control={control} run={run} />
      <p className="text-xs text-muted-foreground">Admin scope: read-only view of records plus account control. Payment actions require a developer credential.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <SimpleList title="Customers" coll={C('customer')} pager={pager('customer')} cols={['id', 'label', 'createdAt']} />
        <SimpleList title="Wallets" coll={C('wallet')} pager={pager('wallet')} cols={['id', 'label', 'customerId']} />
        <SimpleList title="Deposits" coll={C('deposit')} pager={pager('deposit')} cols={['id', 'amountSats', 'status', 'late']} />
        <SimpleList title="Withdrawals" coll={C('withdrawal')} pager={pager('withdrawal')} cols={['id', 'totalSats', 'status', 'feeVersion']} />
        <SimpleList title="Audit trail" coll={C('audit')} pager={pager('audit')} cols={['action', 'actor', 'status', 'reason', 'createdAt']} />
        <SimpleList title="Usage records (non-billable)" coll={C('usage')} pager={pager('usage')} cols={['operation', 'billable', 'createdAt']} />
      </div>
      <Readiness />
      </>) : (<>

      <div className="grid gap-4 lg:grid-cols-2">
        <CustomersBlock coll={C('customer')} pager={pager('customer')} run={run} />
        <WalletsBlock coll={C('wallet')} customers={C('customer').items} pager={pager('wallet')} run={run} />
      </div>
      <AssignmentsBlock coll={C('assignment')} wallets={C('wallet').items} pager={pager('assignment')} run={run} />
      <DepositsBlock coll={C('deposit')} assignments={C('assignment').items} pager={pager('deposit')} run={run} />
      <div className="grid gap-4 lg:grid-cols-2">
        <TransfersBlock coll={C('transfer')} wallets={C('wallet').items} pager={pager('transfer')} run={run} />
        <FeeBlock coll={C('fee')} pager={pager('fee')} run={run} />
      </div>
      <WithdrawalsBlock coll={C('withdrawal')} wallets={C('wallet').items} pager={pager('withdrawal')} run={run} />
      <EventsBlock coll={C('event')} pager={pager('event')} run={run} />
      <div className="grid gap-4 lg:grid-cols-2">
        <SimpleList title="Audit trail" coll={C('audit')} pager={pager('audit')} cols={['action', 'actor', 'status', 'reason', 'createdAt']} />
        <SimpleList title="Usage records (non-billable)" coll={C('usage')} pager={pager('usage')} cols={['operation', 'billable', 'createdAt']} />
      </div>
      <Readiness />
      </>)}
    </Frame>
  );
}

type Run = (slot: string, action: FoundationCommandAction, data: Rec) => Promise<{ ok: true; rec: Rec } | { ok: false; error: string }>;

function useAction(run: Run, slot: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Rec | null>(null);
  const go = async (action: FoundationCommandAction, data: Rec, onOk?: (r: Rec) => void) => {
    if (busy) return;
    setBusy(true); setError(null);
    const r = await run(slot, action, data);
    setBusy(false);
    if (r.ok) { setDone(r.rec); onOk?.(r.rec); } else setError(r.error);
  };
  return { busy, error, done, go };
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Developers / Wallet foundation</p>
            <h1 className="text-2xl font-semibold">Wallet foundation (local simulation)</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">Disposable local profile. Separate from personal custody: no owner keys, no signer, no node, no real funds. Live mode is not enabled.</p>
          </div>
          <Link href="/developers" className={ghostCls}>Back to developer portal</Link>
        </div>
        {children}
      </div>
    </main>
  );
}

function Unavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <Section title="Foundation service unavailable">
      <div role="alert" className="flex flex-col gap-3 text-sm">
        <p>The local wallet foundation service is not reachable from this deployment. It runs only as an independent local service (port 4401) and is not connected here.</p>
        <div className="flex gap-2">
          <button type="button" className={ghostCls} onClick={onRetry}>Check again</button>
          <Link href="/developers" className={ghostCls}>Developer portal</Link>
        </div>
      </div>
    </Section>
  );
}

function Readiness() {
  return (
    <Section id="readiness" title="Readiness and proposed terms">
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Proposed application fee of $8 to $10 and monthly usage units are <strong className="text-foreground">not approved</strong>. Nothing is charged; usage records are marked non-billable.</li>
        <li>Live operation is disabled. Admin live approval is a recorded flag only; live enablement stays off.</li>
        <li>Events use a local lease/acknowledge outbox simulation. No webhooks are transmitted.</li>
        <li>Receipts are local simulation records, not blockchain or tax documents.</li>
      </ul>
    </Section>
  );
}

function Table({ cols, rows, extra }: { cols: string[]; rows: Rec[]; extra?: (r: Rec) => ReactNode }) {
  if (!rows.length) return <p className="py-4 text-center text-xs text-muted-foreground">No records yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead><tr className="border-b border-border">{cols.map((c) => <th key={c} scope="col" className="px-2 py-1.5 font-mono font-normal uppercase tracking-wider text-muted-foreground">{c}</th>)}{extra && <th className="px-2" />}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={str(r.id) || i} className="border-b border-border/60 align-top">
              {cols.map((c) => (
                <td key={c} className="max-w-[16rem] break-all px-2 py-1.5 font-mono">
                  {c === 'status' ? <Tag tone={toneFor(str(r[c]))}>{str(r[c])}</Tag> : /Sats$/.test(c) ? fmtSats(r[c]) : str(r[c]).slice(0, 80)}
                </td>
              ))}
              {extra && <td className="px-2 py-1.5">{extra(r)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CollErr({ coll }: { coll: Coll }) { return <Alert text={coll.error} />; }
const opts = (rows: Rec[], label: (r: Rec) => string) => rows.map((r) => <option key={str(r.id)} value={str(r.id)}>{label(r)}</option>);
const short = (v: unknown) => str(v).slice(0, 8);

function CustomersBlock({ coll, pager, run }: { coll: Coll; pager: ReactNode; run: Run }) {
  const [label, setLabel] = useState('');
  const a = useAction(run, 'customer');
  return (
    <Section title="Customers">
      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void a.go('customer', { label }, () => setLabel('')); }}>
        <Field label="Label"><input className={inputCls} value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} /></Field>
        <button className={btnCls} disabled={a.busy}>Create customer</button>
      </form>
      <Alert text={a.error} />
      <CollErr coll={coll} />
      <Table cols={['id', 'label', 'createdAt']} rows={coll.items} />
      {pager}
    </Section>
  );
}

function WalletsBlock({ coll, customers, pager, run }: { coll: Coll; customers: Rec[]; pager: ReactNode; run: Run }) {
  const [cust, setCust] = useState(''); const [label, setLabel] = useState('');
  const a = useAction(run, 'wallet');
  return (
    <Section title="Wallets">
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void a.go('wallet', { customerId: cust, label }, () => setLabel('')); }}>
        <Field label="Customer"><select required className={inputCls} value={cust} onChange={(e) => setCust(e.target.value)}><option value="">Select</option>{opts(customers, (r) => `${str(r.label)} (${short(r.id)})`)}</select></Field>
        <Field label="Label"><input className={inputCls} value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} /></Field>
        <button className={btnCls} disabled={a.busy}>Create wallet</button>
      </form>
      <Alert text={a.error} />
      <CollErr coll={coll} />
      <Table cols={['id', 'label', 'available', 'pending', 'reserved']} rows={coll.items.map((w) => { const b = (w.balance ?? {}) as Rec; return { ...w, available: fmtSats(b.available), pending: fmtSats(b.pending), reserved: fmtSats(b.reserved) }; })} />
      {pager}
    </Section>
  );
}

function AssignmentsBlock({ coll, wallets, pager, run }: { coll: Coll; wallets: Rec[]; pager: ReactNode; run: Run }) {
  const [wallet, setWallet] = useState(''); const [count, setCount] = useState('5');
  const a = useAction(run, 'batch');
  return (
    <Section title="Deposit assignments" meta="Batch-created atomically; destinations are sim: identifiers">
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void a.go('batch', { walletId: wallet, count: Number(count) }); }}>
        <Field label="Wallet"><select required className={inputCls} value={wallet} onChange={(e) => setWallet(e.target.value)}><option value="">Select</option>{opts(wallets, (r) => `${str(r.label)} (${short(r.id)})`)}</select></Field>
        <Field label="Count (1-100)"><input className={inputCls} type="number" min={1} max={100} required value={count} onChange={(e) => setCount(e.target.value)} /></Field>
        <button className={btnCls} disabled={a.busy}>Create batch</button>
      </form>
      <Alert text={a.error} />
      <CollErr coll={coll} />
      <Table cols={['id', 'walletId', 'destination', 'expiresAt', 'batchId']} rows={coll.items} />
      {pager}
    </Section>
  );
}

function DepositsBlock({ coll, assignments, pager, run }: { coll: Coll; assignments: Rec[]; pager: ReactNode; run: Run }) {
  const [asg, setAsg] = useState(''); const [txid, setTxid] = useState(''); const [vout, setVout] = useState('0'); const [amt, setAmt] = useState('');
  const a = useAction(run, 'deposit');
  const st = useAction(run, 'deposit-state');
  return (
    <Section title="Deposits" meta="Observed outputs; 3 confirmations to make available">
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void a.go('deposit', { assignmentId: asg, txid: txid.trim().toLowerCase(), vout: Number(vout), amountSats: Number(amt) }, () => { setTxid(''); setAmt(''); }); }}>
        <Field label="Assignment"><select required className={inputCls} value={asg} onChange={(e) => setAsg(e.target.value)}><option value="">Select</option>{opts(assignments, (r) => `${short(r.id)} / wallet ${short(r.walletId)}`)}</select></Field>
        <Field label="txid (64 hex)"><input className={`${inputCls} w-72 font-mono`} required pattern="[a-fA-F0-9]{64}" value={txid} onChange={(e) => setTxid(e.target.value)} /></Field>
        <Field label="vout"><input className={`${inputCls} w-20`} type="number" min={0} max={100000} required value={vout} onChange={(e) => setVout(e.target.value)} /></Field>
        <Field label="Amount (sats)"><input className={`${inputCls} w-32`} type="number" min={1} step={1} required value={amt} onChange={(e) => setAmt(e.target.value)} /></Field>
        <button className={btnCls} disabled={a.busy}>Observe deposit</button>
      </form>
      <Alert text={a.error} /><Alert text={st.error} />
      <CollErr coll={coll} />
      <Table cols={['id', 'walletId', 'output', 'amountSats', 'status', 'confirmations', 'late']} rows={coll.items} extra={(r) => (
        <div className="flex flex-col gap-1">
          <div className="flex gap-1">
            <button type="button" className={ghostCls} disabled={st.busy || r.status !== 'pending'} onClick={() => void st.go('deposit-state', { id: r.id, state: 'confirmed', confirmations: 3 })}>Confirm 3</button>
            <button type="button" className={ghostCls} disabled={st.busy || r.status === 'reversed'} onClick={() => void st.go('deposit-state', { id: r.id, state: 'reversed' })}>Reverse</button>
          </div>
          <ReceiptActions record={r} kind="deposit" />
        </div>
      )} />
      {pager}
    </Section>
  );
}

function TransfersBlock({ coll, wallets, pager, run }: { coll: Coll; wallets: Rec[]; pager: ReactNode; run: Run }) {
  const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [amt, setAmt] = useState('');
  const a = useAction(run, 'transfer');
  return (
    <Section title="Internal transfers">
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void a.go('transfer', { from, to, amountSats: Number(amt) }, () => setAmt('')); }}>
        <Field label="From"><select required className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)}><option value="">Select</option>{opts(wallets, (r) => `${str(r.label)} (${short(r.id)})`)}</select></Field>
        <Field label="To"><select required className={inputCls} value={to} onChange={(e) => setTo(e.target.value)}><option value="">Select</option>{opts(wallets, (r) => `${str(r.label)} (${short(r.id)})`)}</select></Field>
        <Field label="Amount (sats)"><input className={`${inputCls} w-28`} type="number" min={1} step={1} required value={amt} onChange={(e) => setAmt(e.target.value)} /></Field>
        <button className={btnCls} disabled={a.busy}>Transfer</button>
      </form>
      <Alert text={a.error} />
      <CollErr coll={coll} />
      <Table cols={['id', 'from', 'to', 'amountSats', 'status']} rows={coll.items} extra={(r) => <ReceiptActions record={r} kind="transfer" />} />
      {pager}
    </Section>
  );
}

function FeeBlock({ coll, pager, run }: { coll: Coll; pager: ReactNode; run: Run }) {
  const [fixed, setFixed] = useState('0'); const [bps, setBps] = useState('0');
  const a = useAction(run, 'fee');
  return (
    <Section title="Developer fee policy" meta="Added on top of withdrawals; versioned">
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void a.go('fee', { fixedSats: Number(fixed), bps: Number(bps) }); }}>
        <Field label="Fixed (sats, max 1,000,000)"><input className={`${inputCls} w-36`} type="number" min={0} max={1000000} required value={fixed} onChange={(e) => setFixed(e.target.value)} /></Field>
        <Field label="Basis points (0-1000)"><input className={`${inputCls} w-28`} type="number" min={0} max={1000} required value={bps} onChange={(e) => setBps(e.target.value)} /></Field>
        <button className={btnCls} disabled={a.busy}>Publish version</button>
      </form>
      <Alert text={a.error} />
      <CollErr coll={coll} />
      <Table cols={['version', 'fixedSats', 'bps', 'mode', 'createdAt']} rows={coll.items} />
      {pager}
    </Section>
  );
}

function WithdrawalsBlock({ coll, wallets, pager, run }: { coll: Coll; wallets: Rec[]; pager: ReactNode; run: Run }) {
  const [wallet, setWallet] = useState(''); const [dest, setDest] = useState(''); const [amt, setAmt] = useState(''); const [net, setNet] = useState('500');
  const [approved, setApproved] = useState<Record<string, boolean>>({});
  const [actual, setActual] = useState<Record<string, string>>({});
  const rv = useAction(run, 'review');
  const ap = useAction(run, 'approve');
  const st = useAction(run, 'withdrawal-state');
  const now = Date.now();
  return (
    <Section title="Withdrawals" meta="Review, explicit approval, simulated broadcast lifecycle">
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void rv.go('review', { walletId: wallet, destination: dest.trim(), amountSats: Number(amt), networkFeeSats: Number(net) }); }}>
        <Field label="Wallet"><select required className={inputCls} value={wallet} onChange={(e) => setWallet(e.target.value)}><option value="">Select</option>{opts(wallets, (r) => `${str(r.label)} (${short(r.id)})`)}</select></Field>
        <Field label="Destination (sim:uuid)"><input className={`${inputCls} w-80 font-mono`} required pattern="sim:[a-f0-9\-]{36}" value={dest} onChange={(e) => setDest(e.target.value)} /></Field>
        <button type="button" className={ghostCls} onClick={() => setDest('sim:' + crypto.randomUUID())}>Generate</button>
        <Field label="Amount (sats)"><input className={`${inputCls} w-28`} type="number" min={1} required value={amt} onChange={(e) => setAmt(e.target.value)} /></Field>
        <Field label="Network fee cap (sats)"><input className={`${inputCls} w-28`} type="number" min={0} max={100000} required value={net} onChange={(e) => setNet(e.target.value)} /></Field>
        <button className={btnCls} disabled={rv.busy}>Create review</button>
      </form>
      <Alert text={rv.error} /><Alert text={ap.error} /><Alert text={st.error} />
      <CollErr coll={coll} />
      <Table cols={['id', 'destination', 'amountSats', 'developerFeeSats', 'networkFeeSats', 'totalSats', 'feeVersion', 'status', 'expiresAt', 'actualFeeSats', 'txid']} rows={coll.items} extra={(r) => {
        const id = str(r.id), s = str(r.status);
        const expired = s === 'review' && Date.parse(str(r.expiresAt)) <= now;
        return (
          <div className="flex min-w-[14rem] flex-col gap-1.5">
            {s === 'review' && (expired ? <span className="text-[11px] text-destructive">Review expired. Create a new review.</span> : (
              <>
                <label className="flex items-center gap-1.5 text-[11px]"><input type="checkbox" checked={!!approved[id]} onChange={(e) => setApproved({ ...approved, [id]: e.target.checked })} />I approve {fmtSats(r.totalSats)} total to {str(r.destination).slice(0, 16)}…</label>
                <button type="button" className={ghostCls} disabled={!approved[id] || ap.busy} onClick={() => void ap.go('approve', { id, approved: true })}>Approve and reserve</button>
              </>
            ))}
            {['reserved', 'unknown', 'broadcast'].includes(s) && (
              <div className="flex flex-wrap gap-1">
                <button type="button" className={ghostCls} disabled={st.busy} onClick={() => void st.go('withdrawal-state', { id, state: 'unknown' })}>Unknown</button>
                <button type="button" className={ghostCls} disabled={st.busy} onClick={() => void st.go('withdrawal-state', { id, state: 'broadcast' })}>Broadcast</button>
                {s === 'reserved' && !r.txid && <button type="button" className={ghostCls} disabled={st.busy} onClick={() => void st.go('withdrawal-state', { id, state: 'failed' })}>Fail (pre-broadcast)</button>}
              </div>
            )}
            {s === 'broadcast' && (
              <div className="flex items-end gap-1">
                <Field label="Actual fee"><input className={`${inputCls} h-8 w-24`} type="number" min={0} max={num(r.networkFeeSats)} value={actual[id] ?? str(r.networkFeeSats)} onChange={(e) => setActual({ ...actual, [id]: e.target.value })} /></Field>
                <button type="button" className={ghostCls} disabled={st.busy} onClick={() => void st.go('withdrawal-state', { id, state: 'confirmed', confirmations: 3, actualFeeSats: Number(actual[id] ?? r.networkFeeSats) })}>Confirm 3</button>
              </div>
            )}
            <ReceiptActions record={r} kind="withdrawal" />
          </div>
        );
      }} />
      {pager}
    </Section>
  );
}

function EventsBlock({ coll, pager, run }: { coll: Coll; pager: ReactNode; run: Run }) {
  const [leased, setLeased] = useState<Rec | null>(null);
  const [idle, setIdle] = useState(false);
  const l = useAction(run, 'event-lease');
  const k = useAction(run, 'event-ack');
  return (
    <Section title="Event outbox (local simulation)" meta="Manual lease and acknowledge; no webhook is sent">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btnCls} disabled={l.busy} onClick={() => void l.go('event-lease', {}, (r) => { setIdle(r.idle === true); setLeased(r.idle === true ? null : r); })}>Lease next event</button>
        {leased && (
          <>
            <span className="font-mono text-xs">{str(leased.type)} / attempt {num(leased.attempts)}</span>
            <button type="button" className={ghostCls} disabled={k.busy} onClick={() => void k.go('event-ack', { id: leased.id, lease: leased.lease, delivered: true }, () => setLeased(null))}>Ack delivered</button>
            <button type="button" className={ghostCls} disabled={k.busy} onClick={() => void k.go('event-ack', { id: leased.id, lease: leased.lease, delivered: false }, () => setLeased(null))}>Ack failed</button>
          </>
        )}
        {idle && !leased && <span role="status" className="text-xs text-muted-foreground">No events due.</span>}
      </div>
      <Alert text={l.error} /><Alert text={k.error} />
      <CollErr coll={coll} />
      <Table cols={['id', 'type', 'status', 'attempts', 'nextAt']} rows={coll.items} />
      {pager}
    </Section>
  );
}

function SimpleList({ title, coll, pager, cols }: { title: string; coll: Coll; pager: ReactNode; cols: string[] }) {
  return <Section title={title}><CollErr coll={coll} /><Table cols={cols} rows={coll.items} />{pager}</Section>;
}

function AdminControl({ control, run }: { control: Rec; run: Run }) {
  const [status, setStatus] = useState(str(control.status) || 'active');
  const [reason, setReason] = useState('');
  const [live, setLive] = useState(control.liveApproved === true);
  const a = useAction(run, 'control');
  return (
    <Section title="Admin account control" meta={`Current: ${str(control.status) || 'active'}${control.reason ? ' / ' + str(control.reason) : ''}`}>
      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void a.go('control', { status, reason: reason.trim(), liveApproved: live }, () => setReason('')); }}>
        <Field label="Status"><select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}><option value="active">active</option><option value="frozen">frozen</option><option value="suspended">suspended</option><option value="revoked">revoked (terminal)</option></select></Field>
        <Field label="Audit reason (min 3 chars)"><input className={`${inputCls} w-64`} required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <label className="flex h-9 items-center gap-1.5 text-xs"><input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />Live approved (record only)</label>
        <span className="flex h-9 items-center text-xs text-muted-foreground">Live enabled: false (fixed)</span>
        <button className={btnCls} disabled={a.busy}>Apply control</button>
      </form>
      <Alert text={a.error} />
    </Section>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { startAuthentication } from '@simplewebauthn/browser';
import { ChevronLeft, ChevronRight, FileClock, Fingerprint, PauseCircle, PlayCircle, Search, ScrollText, ShieldAlert, Users } from 'lucide-react';
import {
  developerAdminAction, getGetDeveloperAdminQueryKey, getGetVaultSessionQueryKey, passkeyLoginOptions, passkeyLoginVerify,
  setCsrfToken, useGetDeveloperAdmin, useLockVault, type AdminDeveloper, type CheckoutAudit, type Session,
} from '@workspace/api-client-react';
import { Empty, ErrorPanel, Panel, Pill, SkelRows, statusTone } from '@/components/kit';
import { AdminShell, type AdminSection } from '@/components/admin-shell';
import { lockClient } from '@/lib/session-lock';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { errStatus, stamp, useCsrf } from '@/lib/vault';

type AdminAction = Parameters<typeof developerAdminAction>[0];
const STEP_MS = 5 * 60 * 1000;
const STRONG: AdminAction[] = ['suspend', 'revoke', 'adjust'];
const KEY = getGetDeveloperAdminQueryKey();

interface Pending { action: AdminAction; account?: AdminDeveloper; paused?: boolean }

function errMsg(e: unknown) { return e instanceof Error && e.message ? e.message : 'Request failed'; }

function Audit({ rows, testId }: { rows: CheckoutAudit[]; testId: string }) {
  if (!rows.length) return <p className="py-3 text-[13px] text-muted-foreground" data-testid={`${testId}-empty`}>No audit entries on record.</p>;
  return (
    <ol className="divide-y divide-border text-[13px]" data-testid={testId}>
      {rows.slice(0, 40).map((a, i) => (
        <li key={`${a.at}-${i}`} className="grid gap-0.5 py-2 sm:grid-cols-[150px_110px_1fr_auto] sm:gap-3">
          <span className="font-mono text-[11.5px] text-muted-foreground">{stamp(a.at)}</span>
          <span className="font-semibold">{a.action}</span>
          <span className="break-words text-muted-foreground">{a.reason}</span>
          <span className="font-mono text-[11.5px] text-muted-foreground">{a.actor}</span>
        </li>
      ))}
    </ol>
  );
}

export default function AdminPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [pages,setPages]=useState<string[]>(['']);
  const cursor=pages[pages.length-1];
  const q = useGetDeveloperAdmin({after:cursor||undefined},{ query: { queryKey: [...KEY,cursor], refetchInterval: 15000 } });
  const [freshAt, setFreshAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [pkBusy, setPkBusy] = useState(false);
  const [pkErr, setPkErr] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [checkoutId, setCheckoutId] = useState('');
  const [adjReq, setAdjReq] = useState<{ intent: string; id: string } | null>(null);
  const [actErr, setActErr] = useState<string | null>(null);
  const [section, setSection] = useState<AdminSection>('overview');
  const [query, setQuery] = useState('');
  const [statusF, setStatusF] = useState('all');
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { document.title = 'Platform admin · MainVaultWallet'; }, []);

  const freshLeft = freshAt ? Math.max(0, Math.ceil((freshAt + STEP_MS - now) / 1000)) : 0;
  const d = q.data;
  const needsStep = !!d?.stepUpRequired || freshLeft <= 0;

  const stepUp = async () => {
    setPkErr(null); setPkBusy(true);
    try {
      const options = await passkeyLoginOptions();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await startAuthentication({ optionsJSON: options as any });
      const s = await passkeyLoginVerify({ response: response as unknown as Record<string, unknown> });
      setCsrfToken((s as Session).csrfToken);
      qc.setQueryData(getGetVaultSessionQueryKey(), s);
      setFreshAt(Date.now());
      await qc.invalidateQueries({ queryKey: KEY });
    } catch (e) {
      const n = e instanceof Error ? e.name : '';
      setPkErr(n === 'NotAllowedError' ? 'Passkey prompt cancelled or timed out. Nothing changed.' : errMsg(e));
    } finally { setPkBusy(false); }
  };

  const open = (p: Pending) => { if (p.action !== 'adjust' || p.account?.id !== pending?.account?.id) setAdjReq(null); setPending(p); setReason(''); setAmount(''); setTyped(''); setCheckoutId(''); setActErr(null); };
  const amt = Number(amount);
  const amountOk = /^-?[0-9]{1,12}$/.test(amount.trim()) && amt !== 0;
  const strong = pending ? STRONG.includes(pending.action) : false;
  const confirmWord = pending?.account ? pending.account.email : '';
  const canSubmit = !!pending && reason.trim().length >= 4 && (!strong || typed.trim() === confirmWord) && (pending.action !== 'adjust' || amountOk) && (pending.action !== 'retry-webhook' || checkoutId.trim().length > 0) && !busy && !needsStep;

  const submit = async () => {
    if (!pending || !canSubmit) return;
    setBusy(true); setActErr(null);
    const token = qc.getQueryData<Session>(getGetVaultSessionQueryKey())?.csrfToken ?? '';
    // Adjust: one requestId per exact intent; reused on retry after a lost response, dropped on success or changed intent.
    let requestId: string | undefined;
    if (pending.action === 'adjust') {
      const intent = `${pending.account?.id}|${Math.trunc(amt)}|${reason.trim()}`;
      requestId = adjReq?.intent === intent ? adjReq.id : crypto.randomUUID();
      setAdjReq({ intent, id: requestId });
    }
    try {
      const r = await developerAdminAction(pending.action, {
        accountId: pending.account?.id, reason: reason.trim(),
        ...(pending.action === 'pause' ? { paused: !!pending.paused } : {}),
        ...(pending.action === 'adjust' ? { amountSats: Math.trunc(amt), requestId } : {}),
        ...(pending.action === 'retry-webhook' ? { checkoutId: checkoutId.trim() } : {}),
      }, { headers: { 'x-csrf-token': token } });
      toast({ title: `${pending.action} recorded`, description: r.message ?? 'Audit entry written.' });
      if (pending.action === 'adjust') setAdjReq(null);
      setPending(null);
    } catch (e) {
      const st = errStatus(e);
      if (st === 401 || st === 403) setFreshAt(0);
      setActErr(st === 401 || st === 403 ? 'Owner passkey confirmation required or expired. Confirm again, then retry.' : errMsg(e));
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: KEY });
    }
  };

  const actions: { a: AdminAction; label: string }[] = [
    { a: 'activate', label: 'Activate' }, { a: 'freeze', label: 'Freeze' }, { a: 'suspend', label: 'Suspend' }, { a: 'revoke', label: 'Revoke' },
    { a: 'adjust', label: 'Adjust balance' }, { a: 'retry-webhook', label: 'Retry webhook' },
  ];
  const accounts = useMemo(() => d?.accounts ?? [], [d]);
  const statuses = useMemo(() => Array.from(new Set(accounts.map((a) => a.status))).sort(), [accounts]);
  const filtered = useMemo(() => {
    const t = query.trim().toLowerCase();
    return accounts.filter((a) => (statusF === 'all' || a.status === statusF) && (!t || `${a.name} ${a.email} ${a.id} ${a.apiKeyPrefix ?? ''}`.toLowerCase().includes(t)));
  }, [accounts, query, statusF]);
  const pageNo = pages.length;
  const countBy = (k: (a: AdminDeveloper) => string) => accounts.reduce<Record<string, number>>((m, a) => { m[k(a)] = (m[k(a)] ?? 0) + 1; return m; }, {});
  const lock = useLockVault(useCsrf());
  const logout = () => {
    if (lock.isPending) return;
    lock.mutate(undefined, {
      onSuccess: () => lockClient(qc),
      onError: (error) => {
        if (errStatus(error) === 401) { lockClient(qc); return; }
        toast({ title: 'Logout not confirmed — please retry', description: errMsg(error), variant: 'destructive' });
      },
    });
  };

  const stepPill = <Pill tone={needsStep ? 'warn' : 'ok'} testId="status-stepup">{needsStep ? 'passkey required' : `fresh ${Math.floor(freshLeft / 60)}:${String(freshLeft % 60).padStart(2, '0')}`}</Pill>;
  const titles: Record<AdminSection, [string, string]> = {
    overview: ['Overview', 'Checkout simulation state and a summary of the accounts loaded on this page.'],
    accounts: ['Developer accounts', 'Status, keys and simulated balances. Filters apply to the current page only.'],
    applications: ['Live applications', 'Approving records intent only. Live stays disabled and no live keys are issued.'],
    audit: ['Audit', 'Global pause and resume entries, plus per-account history for accounts on this page.'],
  };

  const pager = d && (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
      <span className="font-mono text-[11.5px] text-muted-foreground" data-testid="text-page">page {pageNo} · {accounts.length} accounts loaded{q.isFetching ? ' · refreshing' : ''}</span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="rounded-full" disabled={pages.length === 1 || q.isFetching} onClick={() => setPages((p) => p.slice(0, -1))} data-testid="button-prev-page"><ChevronLeft className="h-4 w-4" /> Previous</Button>
        <Button size="sm" variant="outline" className="rounded-full" disabled={!d.nextCursor || q.isFetching} onClick={() => d.nextCursor && setPages((p) => [...p, d.nextCursor!])} data-testid="button-next-page">Next <ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );

  const accountRow = (a: AdminDeveloper, mode: 'accounts' | 'applications') => (
    <li key={a.id} className="py-4 first:pt-1" data-testid={`card-account-${a.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><span className="font-semibold" data-testid={`text-account-name-${a.id}`}>{a.name}</span>{!a.verified && <Pill tone="warn">unverified</Pill>}</div>
          <div className="truncate text-[13px] text-muted-foreground">{a.email}</div>
          <div className="mt-1 break-all font-mono text-[11.5px] text-muted-foreground">{a.id} · key {a.apiKeyPrefix ?? 'none'} · <span className="text-foreground">{a.balanceSats.toLocaleString('en-US')}</span> sim sats</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Pill tone={statusTone(a.status)} testId={`status-account-${a.id}`}>{a.status}</Pill>
          <Pill testId={`status-application-${a.id}`}>live: {a.liveApplication}</Pill>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(mode === 'applications' ? [{ a: 'approve' as AdminAction, label: 'Approve application' }, { a: 'reject' as AdminAction, label: 'Reject application' }] : actions).map(({ a: act, label }) => (
          <Button key={act} size="sm" variant={STRONG.includes(act) ? 'destructive' : 'outline'} className="h-8 rounded-full px-3 text-[12.5px]" onClick={() => open({ action: act, account: a })} data-testid={`button-${act}-${a.id}`}>{label}</Button>
        ))}
      </div>
      {mode === 'accounts' && a.audit.length > 0 && <details className="mt-3 rounded-lg bg-muted/40 px-3"><summary className="cursor-pointer py-2 text-[12.5px] font-semibold text-muted-foreground">Account audit ({a.audit.length})</summary><Audit rows={a.audit} testId={`list-audit-${a.id}`} /></details>}
    </li>
  );

  const content = () => {
    if (q.isLoading) return <SkelRows rows={6} />;
    if (q.isError || !d) return <ErrorPanel error={q.error} onRetry={() => q.refetch()} title="Admin data unavailable" />;
    if (section === 'overview') {
      const st = countBy((a) => a.status); const ap = countBy((a) => a.liveApplication);
      return (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <Panel title="Checkout simulation" meta={<Pill tone={d.paused ? 'warn' : 'ok'} testId="status-paused">{d.paused ? 'paused' : 'running'}</Pill>}>
              <p className="mb-3 text-[13px] text-muted-foreground">Global switch for every simulated checkout.</p>
              <Button variant="outline" className="rounded-full" onClick={() => open({ action: 'pause', paused: !d.paused })} data-testid="button-toggle-pause">
                {d.paused ? <><PlayCircle className="h-4 w-4" /> Resume</> : <><PauseCircle className="h-4 w-4" /> Pause all</>}
              </Button>
            </Panel>
            <Panel title="Signet" meta={<Pill testId="status-signet">{d.signet || 'paused'}</Pill>}>
              <p className="text-[13px] text-muted-foreground">Read-only status. No signet controls exist on this platform console.</p>
            </Panel>
            <Panel title="Live" meta={<Pill tone="neutral" testId="status-live">{d.liveEnabled ? 'enabled' : 'unavailable'}</Pill>}>
              <p className="text-[13px] text-muted-foreground">Live processing is not available here. There is no toggle; approvals record intent only.</p>
            </Panel>
          </div>
          <Panel title="Current page summary" meta={<span className="font-mono text-[11.5px] text-muted-foreground">page {pageNo} only · not global totals</span>}>
            {!accounts.length ? <p className="text-[13px] text-muted-foreground">No accounts on this page.</p> : (
              <div className="grid gap-6 sm:grid-cols-3">
                <div><div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">Accounts loaded</div><div className="mt-1 font-display text-3xl font-semibold" data-testid="text-page-count">{accounts.length}</div></div>
                <dl className="space-y-1 text-[13px]"><dt className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">By status</dt>{Object.entries(st).map(([k, v]) => <dd key={k} className="flex justify-between gap-3"><span>{k}</span><span className="font-mono">{v}</span></dd>)}</dl>
                <dl className="space-y-1 text-[13px]"><dt className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">Live applications</dt>{Object.entries(ap).map(([k, v]) => <dd key={k} className="flex justify-between gap-3"><span>{k}</span><span className="font-mono">{v}</span></dd>)}</dl>
              </div>
            )}
            <div className="mt-5">{pager}</div>
          </Panel>
        </div>
      );
    }
    if (section === 'audit') return (
      <div className="space-y-5">
        <Panel title="Global pause / resume" meta={<FileClock className="h-4 w-4 text-muted-foreground" />}><Audit rows={d.audit} testId="list-audit" /></Panel>
        <Panel title="Account audit" meta={<span className="font-mono text-[11.5px] text-muted-foreground">page {pageNo}</span>}>
          {accounts.filter((a) => a.audit.length).length === 0 ? <p className="text-[13px] text-muted-foreground">No account audit entries on this page. Older records remain stored.</p> :
            <div className="space-y-4">{accounts.filter((a) => a.audit.length).map((a) => <div key={a.id}><div className="mb-1 text-[13px] font-semibold">{a.name} <span className="font-mono text-[11.5px] font-normal text-muted-foreground">{a.id}</span></div><Audit rows={a.audit} testId={`list-audit-${a.id}`} /></div>)}</div>}
          <div className="mt-5">{pager}</div>
        </Panel>
      </div>
    );
    const isApps = section === 'applications';
    return (
      <Panel title={isApps ? 'Applications' : 'Accounts'} meta={<span className="font-mono text-[11.5px] text-muted-foreground">{filtered.length} of {accounts.length} on page {pageNo}</span>}>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search this page by name, email, id or key" className="pl-9" aria-label="Search current page" data-testid="input-admin-search" /></div>
          <select value={statusF} onChange={(e) => setStatusF(e.target.value)} aria-label="Filter by status" className="h-9 rounded-md border border-input bg-background px-3 text-[13px]" data-testid="select-admin-status">
            <option value="all">All statuses</option>{statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {!accounts.length ? <Empty icon={isApps ? <ScrollText className="h-5 w-5" /> : <Users className="h-5 w-5" />} title="No developer accounts" body="Registered developers appear here." />
          : !filtered.length ? <Empty icon={<Search className="h-5 w-5" />} title="No matches on this page" body="Search and filters only cover the accounts loaded on this page. Try the next page or clear the filter." />
          : <ul className="divide-y divide-border">{filtered.map((a) => accountRow(a, isApps ? 'applications' : 'accounts'))}</ul>}
        <div className="mt-4">{pager}</div>
      </Panel>
    );
  };

  return (
    <AdminShell section={section} onSection={setSection} onLogout={logout} status={stepPill}>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 rise">
        <div className="min-w-0">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-accent">Platform operations</div>
          <h1 className="mt-1 font-display text-[28px] font-semibold leading-tight sm:text-[32px]" data-testid="text-admin-title">{titles[section][0]}</h1>
          <p className="mt-1 max-w-2xl text-[13.5px] text-muted-foreground">{titles[section][1]}</p>
        </div>
      </header>
      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3"><Fingerprint className="h-5 w-5 shrink-0 text-accent" /><p className="text-[13px] text-muted-foreground">Reading needs no confirmation. Every write needs a reason and an owner passkey from the last five minutes.</p></div>
        <div className="flex shrink-0 items-center gap-2">{stepPill}<Button onClick={stepUp} disabled={pkBusy} size="sm" className="rounded-full" data-testid="button-admin-passkey"><Fingerprint className="h-4 w-4" /> {pkBusy ? 'Waiting for passkey' : 'Confirm passkey'}</Button></div>
      </div>
      {pkErr && <p className="-mt-3 mb-5 text-[13px] text-destructive" data-testid="text-passkey-error">{pkErr}</p>}
      <div key={section} className="rise motion-reduce:animate-none">{content()}</div>

      <Dialog open={!!pending} onOpenChange={(o) => { if (!o && !busy) setPending(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">{strong && <ShieldAlert className="h-5 w-5 text-destructive" />}{pending?.action === 'pause' ? (pending.paused ? 'Pause checkout simulation' : 'Resume checkout simulation') : `${pending?.action} ${pending?.account?.name ?? ''}`}</DialogTitle>
            <DialogDescription>
              {pending?.action === 'approve' ? 'Records the live application as approved. Live remains disabled and no live keys are created.' : pending?.action === 'freeze' ? 'Blocks outgoing activity only.' : pending?.action === 'suspend' ? 'Suspends the account and revokes all its sessions.' : strong ? 'This is a high-impact change and is written to the audit log.' : 'Written to the audit log with your reason.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {pending?.action === 'adjust' && (
              <div className="grid gap-1.5"><Label htmlFor="adj">Adjustment in simulated sats (signed integer)</Label><Input id="adj" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="-2500 or 10000" data-testid="input-adjust-amount" /></div>
            )}
            {pending?.action === 'retry-webhook' && <div className="grid gap-1.5"><Label htmlFor="cid">Checkout ID</Label><Input id="cid" value={checkoutId} onChange={(e) => setCheckoutId(e.target.value)} data-testid="input-admin-checkout-id" /></div>}
            {pending?.action === 'adjust' && adjReq && <p className="font-mono text-[11.5px] text-muted-foreground" data-testid="text-adjust-request">request {adjReq.id.slice(0, 8)} (reused if retried unchanged)</p>}
            <div className="grid gap-1.5"><Label htmlFor="reason">Reason (required)</Label><Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} data-testid="input-admin-reason" /></div>
            {strong && <div className="grid gap-1.5"><Label htmlFor="typed">Type <span className="font-mono">{confirmWord}</span> to confirm</Label><Input id="typed" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" data-testid="input-admin-confirm" /></div>}
            {needsStep && <p className="text-[13px] text-warn" data-testid="text-needs-stepup">Confirm with your owner passkey first.</p>}
            {actErr && <p className="text-[13px] text-destructive" data-testid="text-admin-error">{actErr}</p>}
          </div>
          <DialogFooter className="gap-2">
            {needsStep && <Button variant="outline" onClick={stepUp} disabled={pkBusy} data-testid="button-dialog-passkey"><Fingerprint className="h-4 w-4" /> Passkey</Button>}
            <Button variant={strong ? 'destructive' : 'default'} onClick={submit} disabled={!canSubmit} data-testid="button-admin-submit">{busy ? 'Saving' : 'Confirm'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}

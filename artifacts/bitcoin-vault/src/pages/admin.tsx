import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { startAuthentication } from '@simplewebauthn/browser';
import { Fingerprint, PauseCircle, PlayCircle, ShieldAlert, Users } from 'lucide-react';
import {
  developerAdminAction, getGetDeveloperAdminQueryKey, getGetVaultSessionQueryKey, passkeyLoginOptions, passkeyLoginVerify,
  setCsrfToken, useGetDeveloperAdmin, type AdminDeveloper, type CheckoutAudit, type Session,
} from '@workspace/api-client-react';
import { Empty, ErrorPanel, PageHeader, Panel, Pill, SkelRows, statusTone } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { errStatus, stamp } from '@/lib/vault';

type AdminAction = Parameters<typeof developerAdminAction>[0];
const STEP_MS = 5 * 60 * 1000;
const STRONG: AdminAction[] = ['suspend', 'revoke', 'adjust'];
const KEY = getGetDeveloperAdminQueryKey();

interface Pending { action: AdminAction; account?: AdminDeveloper; paused?: boolean }

function errMsg(e: unknown) { return e instanceof Error && e.message ? e.message : 'Request failed'; }

function Audit({ rows, testId }: { rows: CheckoutAudit[]; testId: string }) {
  if (!rows.length) return <p className="text-[13px] text-muted-foreground" data-testid={`${testId}-empty`}>No audit entries yet.</p>;
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
  const q = useGetDeveloperAdmin({ query: { queryKey: KEY, refetchInterval: 15000 } });
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
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { document.title = 'Developer admin · main_vault'; }, []);

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
    { a: 'adjust', label: 'Adjust balance' }, { a: 'approve', label: 'Approve application' }, { a: 'reject', label: 'Reject application' }, { a: 'retry-webhook', label: 'Retry webhook' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader kicker="Owner" title="Developer admin" desc="Accounts, applications and the checkout simulation switch. Every change needs a reason and a fresh owner passkey." />

      <Panel title="Step-up" meta={<Pill tone={needsStep ? 'warn' : 'ok'} testId="status-stepup">{needsStep ? 'passkey required' : `fresh · ${Math.floor(freshLeft / 60)}:${String(freshLeft % 60).padStart(2, '0')}`}</Pill>}>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={stepUp} disabled={pkBusy} className="rounded-full" data-testid="button-admin-passkey"><Fingerprint className="h-4 w-4" /> {pkBusy ? 'Waiting for passkey' : 'Confirm with owner passkey'}</Button>
          <p className="text-[13px] text-muted-foreground">Confirmation lasts five minutes. Reading is allowed without it; writing is not.</p>
        </div>
        {pkErr && <p className="mt-3 text-[13px] text-destructive" data-testid="text-passkey-error">{pkErr}</p>}
      </Panel>

      {q.isLoading ? <SkelRows rows={6} /> : q.isError || !d ? <ErrorPanel error={q.error} onRetry={() => q.refetch()} title="Admin data unavailable" /> : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Panel title="Checkout simulation" meta={<Pill tone={d.paused ? 'warn' : 'ok'} testId="status-paused">{d.paused ? 'paused' : 'running'}</Pill>}>
              <Button variant="outline" className="rounded-full" onClick={() => open({ action: 'pause', paused: !d.paused })} data-testid="button-toggle-pause">
                {d.paused ? <><PlayCircle className="h-4 w-4" /> Resume</> : <><PauseCircle className="h-4 w-4" /> Pause all</>}
              </Button>
            </Panel>
            <Panel title="Signet" meta={<Pill testId="status-signet">{d.signet || 'paused'}</Pill>}>
              <p className="text-[13px] text-muted-foreground">Signet stays paused. For real chain state use the read-only <Link href="/" className="font-semibold text-foreground underline" data-testid="link-mainnet-monitor">mainnet monitor on Overview</Link>.</p>
            </Panel>
            <Panel title="Live" meta={<Pill tone="neutral" testId="status-live">{d.liveEnabled ? 'enabled' : 'disabled'}</Pill>}>
              <p className="text-[13px] text-muted-foreground">Approving an application records intent only. Live stays off and no live keys are issued.</p>
            </Panel>
          </div>

          <Panel title="Accounts" meta={<span className="font-mono text-[12px]">{d.accounts.length}</span>}>
            {!d.accounts.length ? <Empty icon={<Users className="h-5 w-5" />} title="No developer accounts" body="Registered developers appear here." /> : (
              <div className="space-y-4">
                {d.accounts.map((a) => (
                  <div key={a.id} className="rounded-2xl border border-border p-4" data-testid={`card-account-${a.id}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold" data-testid={`text-account-name-${a.id}`}>{a.name}</div>
                        <div className="truncate text-[13px] text-muted-foreground">{a.email} {a.verified ? '' : '· unverified'}</div>
                        <div className="mt-1 font-mono text-[11.5px] text-muted-foreground">{a.id} · key {a.apiKeyPrefix ?? 'none'} · {a.balanceSats.toLocaleString('en-US')} sim sats</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Pill tone={statusTone(a.status)} testId={`status-account-${a.id}`}>{a.status}</Pill>
                        <Pill testId={`status-application-${a.id}`}>live: {a.liveApplication}</Pill>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {actions.map(({ a: act, label }) => (
                        <Button key={act} size="sm" variant={STRONG.includes(act) ? 'destructive' : 'outline'} className="rounded-full" onClick={() => open({ action: act, account: a })} data-testid={`button-${act}-${a.id}`}>{label}</Button>
                      ))}
                    </div>
                    {a.audit.length > 0 && <details className="mt-3"><summary className="cursor-pointer text-[12.5px] font-semibold text-muted-foreground">Account audit ({a.audit.length})</summary><Audit rows={a.audit} testId={`list-audit-${a.id}`} /></details>}
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Audit log"><Audit rows={d.audit} testId="list-audit" /></Panel>
        </>
      )}

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
    </div>
  );
}

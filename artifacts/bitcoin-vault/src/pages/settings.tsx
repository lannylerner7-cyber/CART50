import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { startRegistration } from '@simplewebauthn/browser';
import { Fingerprint, KeyRound, LogOut, PlugZap, Trash2 } from 'lucide-react';
import { useGetVaultSettings, useUpdateVaultSettings, useReconnectNode, useRotateCredential, useRevokeSessions, useListPasskeys, usePasskeyRegistrationOptions, useRegisterPasskey, useDeletePasskey, useGetVaultDashboard, setCsrfToken, getGetVaultSettingsQueryKey, getGetVaultDashboardQueryKey, getListPasskeysQueryKey } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { PolicyError, Btc, ErrorPanel, PageHeader, Panel, Pill, Skel, SkelRows, Stat } from '@/components/kit';
import { CREDENTIAL_RE, POLL_MS, ago, errMsg, stamp, useCsrf } from '@/lib/vault';
import { useToast } from '@/hooks/use-toast';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader kicker="Configuration" title="Settings" desc="Operational limits and the keys to this room. Network and destruction policy are fixed server-side." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Operational />
        <NodePanel />
        <Rotation />
        <Passkeys />
        <Sessions />
      </div>
    </div>
  );
}

function Operational() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useGetVaultSettings({ query: { queryKey: getGetVaultSettingsQueryKey() } });
  const upd = useUpdateVaultSettings(useCsrf());
  const [f, setF] = useState({ sweepsPaused: false, feeRateCeiling: '', totalFeeCeilingSats: '', hotExposureLimitSats: '' });
  const init = useRef(false);
  useEffect(() => {
    if (q.data && !init.current) { init.current = true; const s = q.data; setF({ sweepsPaused: s.sweepsPaused, feeRateCeiling: s.feeRateCeiling, totalFeeCeilingSats: s.totalFeeCeilingSats, hotExposureLimitSats: s.hotExposureLimitSats }); }
  }, [q.data]);
  const ok = /^[0-9]+(\.[0-9]{1,3})?$/.test(f.feeRateCeiling) && /^[0-9]+$/.test(f.totalFeeCeilingSats) && /^[0-9]+$/.test(f.hotExposureLimitSats);
  const s = q.data;

  return (
    <Panel title="operational policy" className="lg:row-span-2">
      {q.isError && <PolicyError error={q.error} onRetry={() => q.refetch()} />}
      {q.isLoading && <SkelRows rows={5} />}
      {s && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 rounded-xl bg-muted/50 p-3">
            <Stat label="network"><Pill tone="ember">{s.network}</Pill></Stat>
            <Stat label="destruction"><Pill tone="neutral">{s.destructionPolicy}</Pill></Stat>
            <Stat label="wallet expiry"><span className="font-mono text-sm">{s.expiryHours}h</span></Stat>
            <Stat label="price provider"><span className="text-sm">{s.provider} · {s.priceCurrency}</span> <Pill tone={s.externalConfigured ? 'ok' : 'neutral'}>{s.externalConfigured ? 'configured' : 'unconfigured'}</Pill></Stat>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
            <div><div className="text-sm font-medium">Pause sending and sweeps</div><div className="text-xs text-muted-foreground">Stop outgoing payments and automatic consolidation into your configured main or cold vault.</div></div>
            <Switch checked={f.sweepsPaused} onCheckedChange={(v) => setF({ ...f, sweepsPaused: v })} data-testid="switch-sweeps-paused" />
          </label>
          <div className="grid gap-1.5"><Label>Fee rate ceiling (sat/vB)</Label><Input value={f.feeRateCeiling} onChange={(e) => setF({ ...f, feeRateCeiling: e.target.value.trim() })} className="font-mono" data-testid="input-fee-ceiling" /></div>
          <div className="grid gap-1.5"><Label>Total fee ceiling (sats)</Label><Input value={f.totalFeeCeilingSats} onChange={(e) => setF({ ...f, totalFeeCeilingSats: e.target.value.trim() })} className="font-mono" data-testid="input-total-fee" />
            {/^[0-9]+$/.test(f.totalFeeCeilingSats) && <span className="text-xs text-muted-foreground"><Btc sats={f.totalFeeCeilingSats} size="sm" /></span>}</div>
          <div className="grid gap-1.5"><Label>Hot exposure limit (sats)</Label><Input value={f.hotExposureLimitSats} onChange={(e) => setF({ ...f, hotExposureLimitSats: e.target.value.trim() })} className="font-mono" data-testid="input-hot-limit" />
            {/^[0-9]+$/.test(f.hotExposureLimitSats) && <span className="text-xs text-muted-foreground"><Btc sats={f.hotExposureLimitSats} size="sm" /></span>}</div>
          {upd.isError && <ErrorPanel error={upd.error} title="Save failed" />}
          <Button disabled={!ok || upd.isPending} onClick={() => upd.mutate({ data: f }, { onSuccess: (ns) => { qc.setQueryData(getGetVaultSettingsQueryKey(), ns); toast({ title: 'Policy saved' }); } })} data-testid="button-save-settings">{upd.isPending ? 'Saving' : 'Save policy'}</Button>
        </div>
      )}
    </Panel>
  );
}

function NodePanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const d = useGetVaultDashboard({ query: { queryKey: getGetVaultDashboardQueryKey(), refetchInterval: POLL_MS } });
  const rc = useReconnectNode(useCsrf());
  const n = d.data?.node;
  return (
    <Panel title="bitcoin node">
      {d.isError && <ErrorPanel error={d.error} onRetry={() => d.refetch()} />}
      {d.isLoading && <Skel className="h-20" />}
      {n && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Pill tone={n.connected ? 'ok' : 'bad'} dot>{n.connected ? 'connected' : 'disconnected'}</Pill>
            <div className="mt-1.5 text-sm">{n.message}</div>
            <div className="font-mono text-[11px] text-muted-foreground">last sync {ago(n.lastSync)}</div>
          </div>
          <Button variant="outline" className="gap-1.5" disabled={rc.isPending} onClick={() => rc.mutate(undefined, { onSuccess: () => { qc.invalidateQueries({ queryKey: getGetVaultDashboardQueryKey() }); toast({ title: 'Reconnect requested' }); } })} data-testid="button-reconnect"><PlugZap className="h-4 w-4" />{rc.isPending ? 'Reconnecting' : 'Reconnect'}</Button>
        </div>
      )}
      {rc.isError && <div className="mt-3"><ErrorPanel error={rc.error} title="Reconnect failed" /></div>}
    </Panel>
  );
}

function SecretField({ label, value, onChange, testId }: { label: string; value: string; onChange: (v: string) => void; testId: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input type="password" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value.trim())} className="font-mono" data-testid={`input-${testId}`} />
        <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => ref.current?.click()} data-testid={`button-file-${testId}`}>File</Button>
        <input ref={ref} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) f.text().then((t) => onChange(t.trim())); e.target.value = ''; }} />
      </div>
      <span className={`font-mono text-[10px] ${CREDENTIAL_RE.test(value) ? 'text-ok' : 'text-muted-foreground'}`}>{value.length} / 86</span>
    </div>
  );
}

function Rotation() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const rot = useRotateCredential(useCsrf());
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const ok = CREDENTIAL_RE.test(cur) && CREDENTIAL_RE.test(next) && cur !== next;
  return (
    <Panel title="rotate credential">
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">Generate a new secret offline first. Rotation invalidates the old keyfile and ends all sessions.</p>
        <SecretField label="Current secret" value={cur} onChange={setCur} testId="current-secret" />
        <SecretField label="New secret" value={next} onChange={setNext} testId="new-secret" />
        {rot.isError && <ErrorPanel error={rot.error} title="Rotation failed" />}
        <Button className="gap-1.5" disabled={!ok || rot.isPending} onClick={() => rot.mutate({ data: { credential: cur, newCredential: next } }, {
          onSuccess: (r) => { setCur(''); setNext(''); toast({ title: 'Credential rotated', description: r.message }); setCsrfToken(null); qc.clear(); },
          onError: () => { setCur(''); setNext(''); },
        })} data-testid="button-rotate"><KeyRound className="h-4 w-4" />{rot.isPending ? 'Rotating' : 'Rotate'}</Button>
      </div>
    </Panel>
  );
}

function Passkeys() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const csrf = useCsrf();
  const q = useListPasskeys({ query: { queryKey: getListPasskeysQueryKey() } });
  const opts = usePasskeyRegistrationOptions(csrf);
  const reg = useRegisterPasskey(csrf);
  const del = useDeletePasskey(csrf);
  const [name, setName] = useState('');
  const [err, setErr] = useState<unknown>(null);
  const busy = opts.isPending || reg.isPending;

  const enroll = async () => {
    setErr(null);
    try {
      const o = await opts.mutateAsync();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await startRegistration({ optionsJSON: o as any });
      await reg.mutateAsync({ data: { name: name.trim(), response: response as unknown as Record<string, unknown> } });
      setName('');
      qc.invalidateQueries({ queryKey: getListPasskeysQueryKey() });
      toast({ title: 'Passkey enrolled' });
    } catch (e) { setErr(e); }
  };

  return (
    <Panel title="passkeys · optional">
      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Device name" data-testid="input-passkey-name" />
        <Button className="gap-1.5" disabled={!name.trim() || busy} onClick={enroll} data-testid="button-enroll-passkey"><Fingerprint className="h-4 w-4" />{busy ? 'Waiting' : 'Enroll'}</Button>
      </div>
      {err != null && <div className="mt-3"><ErrorPanel error={err} title="Enrollment failed" /></div>}
      {q.isError && <div className="mt-3"><ErrorPanel error={q.error} onRetry={() => q.refetch()} /></div>}
      {del.isError && <div className="mt-3"><ErrorPanel error={del.error} /></div>}
      {q.isLoading && <div className="mt-3"><SkelRows rows={2} /></div>}
      {q.data && (q.data.length === 0 ? <p className="mt-3 text-xs text-muted-foreground">No passkeys. The keyfile remains the only way in.</p> : (
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
          {q.data.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-3 py-2" data-testid={`row-passkey-${p.id}`}>
              <div><div className="text-sm font-medium">{p.name}</div><div className="font-mono text-[10.5px] text-muted-foreground">{stamp(p.createdAt)}</div></div>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" disabled={del.isPending} onClick={() => del.mutate({ id: p.id }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListPasskeysQueryKey() }) })} data-testid={`button-delete-passkey-${p.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
            </li>
          ))}
        </ul>
      ))}
    </Panel>
  );
}

function Sessions() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const rv = useRevokeSessions(useCsrf());
  const [open, setOpen] = useState(false);
  return (
    <Panel title="sessions">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">End every open session, including this one.</p>
        <Button variant="destructive" className="gap-1.5" onClick={() => setOpen(true)} data-testid="button-open-revoke"><LogOut className="h-4 w-4" /> Revoke all</Button>
      </div>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader><AlertDialogTitle className="font-display">Revoke all sessions?</AlertDialogTitle><AlertDialogDescription>You will need your keyfile or passkey to return.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-revoke">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" data-testid="button-confirm-revoke" onClick={(e) => { e.preventDefault(); rv.mutate(undefined, {
              onSuccess: () => { setCsrfToken(null); qc.clear(); },
              onError: (er) => { setOpen(false); toast({ title: 'Revoke failed', description: errMsg(er), variant: 'destructive' }); },
            }); }}>{rv.isPending ? 'Revoking' : 'Revoke'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Bell, BellOff, CheckCheck, Pencil, Plus, Trash2 } from 'lucide-react';
import { useGetMarket, useListAlerts, useCreateAlert, useUpdateAlert, useDeleteAlert, useListNotifications, useReadNotification, getGetMarketQueryKey, getListAlertsQueryKey, getListNotificationsQueryKey, type Alert, type AlertInput } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Empty, ErrorPanel, PageHeader, Panel, Pill, Skel, SkelRows } from '@/components/kit';
import { POLL_MS, ago, stamp, useCsrf } from '@/lib/vault';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export default function Market() {
  const m = useGetMarket({ query: { queryKey: getGetMarketQueryKey(), refetchInterval: POLL_MS } });
  const d = m.data;
  const fmt = (n: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: d?.currency || 'USD', maximumFractionDigits: 2 }).format(n);

  return (
    <div className="space-y-6">
      <PageHeader kicker="05 / market" title="Market" desc="Reference price from your configured provider. Used only for alerts, never for vault arithmetic." />
      {m.isError && <ErrorPanel error={m.error} onRetry={() => m.refetch()} title="Market feed unavailable" />}
      {m.isLoading && <Skel className="h-64" />}
      {d && (
        <Panel title={`btc / ${d.currency}`} meta={<span className="font-mono">{d.source}</span>}>
          {!d.available || d.price == null ? (
            <Empty icon={<BellOff className="h-5 w-5" />} title="No price feed" body={d.message || 'The price provider is not connected.'} />
          ) : (
            <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
              <div>
                <div className="font-display text-5xl font-extrabold" data-testid="text-price">{fmt(d.price)}</div>
                <div className="mt-2 flex flex-wrap gap-1.5"><Pill tone={d.stale ? 'warn' : 'ok'} dot>{d.stale ? 'stale' : '60s snapshots'}</Pill><span className="text-xs text-muted-foreground">updated {ago(d.updatedAt)}</span></div>
                {d.message && <p className="mt-3 text-xs text-muted-foreground">{d.message}</p>}
              </div>
              <div className="h-48">
                {d.history.length < 2 ? <div className="grid h-full place-items-center text-sm text-muted-foreground">Not enough history recorded yet.</div> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={d.history} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} /><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient></defs>
                      <XAxis dataKey="time" hide /><YAxis domain={['auto', 'auto']} hide />
                      <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontFamily: 'var(--app-font-mono)', fontSize: 11 }} labelFormatter={(l) => stamp(String(l))} formatter={(v) => [fmt(Number(v)), 'price']} />
                      <Area type="monotone" dataKey="price" stroke="hsl(var(--primary))" strokeWidth={1.5} fill="url(#g)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}
        </Panel>
      )}
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Alerts />
        <Notifications />
      </div>
    </div>
  );
}

const blank: AlertInput = { name: '', kind: 'below', threshold: 0, windowMinutes: 60, cooldownMinutes: 240, enabled: true };

function Alerts() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const csrf = useCsrf();
  const q = useListAlerts({ query: { queryKey: getListAlertsQueryKey(), refetchInterval: POLL_MS } });
  const create = useCreateAlert(csrf);
  const update = useUpdateAlert(csrf);
  const del = useDeleteAlert(csrf);
  const [edit, setEdit] = useState<{ id: string | null; v: AlertInput } | null>(null);
  const inv = () => qc.invalidateQueries({ queryKey: getListAlertsQueryKey() });
  const onErr = (e: unknown) => toast({ title: 'Alert action failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });

  const toggle = (a: Alert) => update.mutate({ id: a.id, data: { name: a.name, kind: a.kind, threshold: a.threshold, windowMinutes: a.windowMinutes, cooldownMinutes: a.cooldownMinutes, enabled: !a.enabled } }, { onSuccess: inv, onError: onErr });

  return (
    <Panel title="price alerts" meta={<Button size="sm" variant="outline" className="h-7 gap-1 font-mono text-[10.5px] uppercase" onClick={() => setEdit({ id: null, v: blank })} data-testid="button-new-alert"><Plus className="h-3 w-3" /> new</Button>} bodyClass="p-0">
      {q.isError && <div className="p-4"><ErrorPanel error={q.error} onRetry={() => q.refetch()} /></div>}
      {q.isLoading && <div className="p-4"><SkelRows rows={3} /></div>}
      {q.data && q.data.length === 0 && <div className="p-4"><Empty icon={<Bell className="h-5 w-5" />} title="No alerts" body="Get notified when price falls below a level or drops by a percentage within a window." /></div>}
      {q.data && q.data.length > 0 && (
        <ul className="divide-y divide-border">
          {q.data.map((a) => (
            <li key={a.id} className={cn('flex items-center gap-3 px-4 py-3 transition-opacity', !a.enabled && 'opacity-55')} data-testid={`row-alert-${a.id}`}>
              <Switch checked={a.enabled} onCheckedChange={() => toggle(a)} data-testid={`switch-alert-${a.id}`} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{a.name}</div>
                <div className="font-mono text-[11px] text-muted-foreground">
                  {a.kind === 'below' ? `below ${a.threshold}` : `drop ${a.threshold}% in ${a.windowMinutes}m`} · cooldown {a.cooldownMinutes}m · last {ago(a.lastTriggeredAt)}
                </div>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEdit({ id: a.id, v: { name: a.name, kind: a.kind, threshold: a.threshold, windowMinutes: a.windowMinutes, cooldownMinutes: a.cooldownMinutes, enabled: a.enabled } })} data-testid={`button-edit-alert-${a.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" disabled={del.isPending} onClick={() => del.mutate({ id: a.id }, { onSuccess: inv, onError: onErr })} data-testid={`button-delete-alert-${a.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
            </li>
          ))}
        </ul>
      )}
      {edit && (
        <AlertDialogForm
          initial={edit.v}
          title={edit.id ? 'Edit alert' : 'New alert'}
          pending={create.isPending || update.isPending}
          error={create.error ?? update.error}
          onClose={() => { setEdit(null); create.reset(); update.reset(); }}
          onSave={(v) => {
            const done = { onSuccess: () => { inv(); setEdit(null); toast({ title: 'Alert saved' }); } };
            if (edit.id) update.mutate({ id: edit.id, data: v }, done); else create.mutate({ data: v }, done);
          }}
        />
      )}
    </Panel>
  );
}

function AlertDialogForm({ initial, title, pending, error, onClose, onSave }: { initial: AlertInput; title: string; pending: boolean; error: unknown; onClose: () => void; onSave: (v: AlertInput) => void }) {
  const [v, setV] = useState({ ...initial, threshold: initial.threshold ? String(initial.threshold) : '', windowMinutes: String(initial.windowMinutes), cooldownMinutes: String(initial.cooldownMinutes) });
  const th = Number(v.threshold), w = Number(v.windowMinutes), c = Number(v.cooldownMinutes);
  const ok = v.name.trim().length > 0 && v.name.length <= 80 && th > 0 && Number.isInteger(w) && w >= 1 && w <= 10080 && Number.isInteger(c) && c >= 1 && c <= 10080;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card">
        <DialogHeader><DialogTitle className="font-display text-2xl">{title}</DialogTitle><DialogDescription>Alerts run server-side against the reference feed.</DialogDescription></DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5"><Label>Name</Label><Input value={v.name} maxLength={80} onChange={(e) => setV({ ...v, name: e.target.value })} data-testid="input-alert-name" /></div>
          <div className="grid grid-cols-2 gap-1 rounded-md border border-border p-1 font-mono text-[11px] uppercase">
            {(['below', 'percent_drop'] as const).map((k) => (
              <button key={k} type="button" onClick={() => setV({ ...v, kind: k })} className={cn('rounded-sm py-1.5 transition-colors', v.kind === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')} data-testid={`button-kind-${k}`}>{k === 'below' ? 'price below' : 'percent drop'}</button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5"><Label>{v.kind === 'below' ? 'Price' : 'Drop %'}</Label><Input value={v.threshold} onChange={(e) => setV({ ...v, threshold: e.target.value })} className="font-mono" data-testid="input-alert-threshold" /></div>
            <div className="grid gap-1.5"><Label>Window (min)</Label><Input value={v.windowMinutes} onChange={(e) => setV({ ...v, windowMinutes: e.target.value })} className="font-mono" data-testid="input-alert-window" /></div>
            <div className="grid gap-1.5"><Label>Cooldown (min)</Label><Input value={v.cooldownMinutes} onChange={(e) => setV({ ...v, cooldownMinutes: e.target.value })} className="font-mono" data-testid="input-alert-cooldown" /></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={v.enabled} onCheckedChange={(e) => setV({ ...v, enabled: e })} data-testid="switch-alert-enabled" /> Enabled</label>
          {error != null && <ErrorPanel error={error} title="Save failed" />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-alert">Cancel</Button>
          <Button disabled={!ok || pending} onClick={() => onSave({ name: v.name.trim(), kind: v.kind, threshold: th, windowMinutes: w, cooldownMinutes: c, enabled: v.enabled })} data-testid="button-save-alert">{pending ? 'Saving' : 'Save alert'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Notifications() {
  const qc = useQueryClient();
  const q = useListNotifications({ query: { queryKey: getListNotificationsQueryKey(), refetchInterval: POLL_MS } });
  const read = useReadNotification(useCsrf());
  const unread = (q.data ?? []).filter((n) => !n.read);
  const mark = (id: string) => read.mutate({ id }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() }) });
  return (
    <Panel title="notifications" meta={unread.length > 0 ? <Pill tone="ember">{unread.length} unread</Pill> : undefined} bodyClass="p-0">
      {q.isError && <div className="p-4"><ErrorPanel error={q.error} onRetry={() => q.refetch()} /></div>}
      {read.isError && <div className="p-4"><ErrorPanel error={read.error} /></div>}
      {q.isLoading && <div className="p-4"><SkelRows rows={4} /></div>}
      {q.data && q.data.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Quiet. No notifications.</div>}
      {q.data && q.data.length > 0 && (
        <ul className="max-h-[440px] divide-y divide-border overflow-auto">
          {q.data.map((n) => (
            <li key={n.id} className={cn('flex gap-3 px-4 py-3', !n.read && 'bg-primary/[0.04]')} data-testid={`row-notification-${n.id}`}>
              <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-border' : 'bg-primary')} />
              <div className="min-w-0 flex-1"><div className="text-sm font-medium">{n.title}</div><div className="text-xs text-muted-foreground">{n.message}</div><div className="font-mono text-[10px] text-muted-foreground/70">{ago(n.createdAt)}</div></div>
              {!n.read && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => mark(n.id)} title="Mark read" data-testid={`button-read-${n.id}`}><CheckCheck className="h-3.5 w-3.5" /></Button>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

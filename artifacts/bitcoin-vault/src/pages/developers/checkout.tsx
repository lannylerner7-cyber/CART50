import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Copy, Download, Fingerprint, KeyRound, Plus, RefreshCw, Trash2 } from 'lucide-react';
import {
  checkoutConsoleAction, useGetDeveloperConsole, type CheckoutCommand, type CheckoutCommandResult,
} from '@workspace/api-client-react';
import { Card, DevChip, DevTopBar, Notice } from '@/components/developer-frame';
import { CopyText, Pill, SkelRows, ErrorPanel, statusTone } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ROTATE_WINDOW_MS, devErr, useDev } from '@/lib/developer';
import { ApiBaseRow, StarterExport, WebhookHelp, Help, currentApiBase } from '@/components/starter-export';
import { usePasskeySignIn } from '@/pages/developers/access';
import { errStatus, satsToBtc, stamp } from '@/lib/vault';

type ConsoleAction = Parameters<typeof checkoutConsoleAction>[0];

const httpsOk = (v: string) => { try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; } };

function Secret({ label, value, file, onDone }: { label: string; value: string; file: string; onDone: () => void }) {
  const [ack, setAck] = useState(false);
  const [copied, setCopied] = useState(false);
  const download = () => {
    const url = URL.createObjectURL(new Blob([value + '\n'], { type: 'text/plain' }));
    const a = document.createElement('a'); a.href = url; a.download = file; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="rounded-2xl border border-warn/50 bg-warn/5 p-4" data-testid={`panel-secret-${file}`}>
      <div className="text-[13px] font-bold">{label}: shown once</div>
      <p className="mt-1 text-[12.5px] text-muted-foreground">Store it on your server only (environment variable or secret manager). Never put it in HTML, JavaScript bundles, mobile apps or a repository.</p>
      <code className="mt-3 block break-all rounded-xl bg-muted p-3 font-mono text-[12px]" data-testid="text-secret-value">{value}</code>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="rounded-full" onClick={() => navigator.clipboard.writeText(value).then(() => setCopied(true), () => setCopied(false))} data-testid="button-copy-secret"><Copy className="h-4 w-4" /> {copied ? 'Copied' : 'Copy'}</Button>
        <Button size="sm" variant="outline" className="rounded-full" onClick={download} data-testid="button-download-secret"><Download className="h-4 w-4" /> Download</Button>
      </div>
      <label className="mt-3 flex items-center gap-2 text-[13px]"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} data-testid="checkbox-secret-saved" /> I saved it somewhere server-side</label>
      <Button size="sm" className="mt-3 rounded-full" disabled={!ack} onClick={onDone} data-testid="button-secret-done">Hide it</Button>
    </div>
  );
}

const pySnippet = (base: string) => `import os, requests

# Explicit API base for the deployment that issued your key.
API_BASE = os.environ.get("VAULT_API_BASE", "${base}")
KEY = os.environ["VAULT_CHECKOUT_KEY"]           # server-only secret

def create_checkout(order) -> str:
    # order.idempotency_key is generated ONCE when the order is created and
    # stored with it in your database. Retries reuse it, so a network retry
    # never creates a second checkout. Do not make a new uuid per attempt.
    r = requests.post(
        f"{API_BASE}/v1/checkout/sessions",
        json={"amount_sats": order.amount_sats, "reference": order.ref,
              "return_url": "https://shop.example/thanks"},   # must be saved exactly
        headers={"Authorization": f"Bearer {KEY}",
                 "Idempotency-Key": order.idempotency_key},
        timeout=10,
    )
    r.raise_for_status()
    return r.json()["url"]  # redirect the buyer here (simulation)`;

const nodeSnippet = (base: string) => `// server.js (Node 18+), never shipped to the browser
// Explicit API base for the deployment that issued your key.
const API_BASE = process.env.VAULT_API_BASE ?? '${base}';
const KEY = process.env.VAULT_CHECKOUT_KEY;

app.post('/pay', async (req, res) => {
  // Load the persisted order. Its idempotencyKey was created once with the
  // order and is reused on every retry; never crypto.randomUUID() per attempt.
  const order = await db.orders.get(req.body.order);
  const r = await fetch(\`\${API_BASE}/v1/checkout/sessions\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json',
      Authorization: \`Bearer \${KEY}\`,
      'Idempotency-Key': order.idempotencyKey },
    body: JSON.stringify({ amount_sats: order.amountSats, reference: order.ref,
      return_url: 'https://shop.example/thanks' }),
  });
  if (!r.ok) return res.status(502).send('checkout unavailable');
  res.redirect(303, (await r.json()).url);
});`;

const HTML = `<!-- Your page: posts to YOUR server, which calls the API and redirects. -->
<form method="post" action="/pay">
  <input type="hidden" name="order" value="ORDER-1042">
  <button>Pay with Bitcoin (simulation)</button>
</form>
<!-- No API key here. Ever. -->`;

export default function CheckoutConsolePage() {
  const { session, freshAt } = useDev();
  const qc = useQueryClient();
  const key = ['developer', session.id ?? 'anon', '/api/developers/checkout'];
  const q = useGetDeveloperConsole({ query: { queryKey: key, refetchInterval: 15000 } });
  const pk = usePasskeySignIn();
  const [now, setNow] = useState(Date.now());
  const [urls, setUrls] = useState<string[]>([]);
  const [newUrl, setNewUrl] = useState('');
  const [hook, setHook] = useState('');
  const [inited, setInited] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [whSecret, setWhSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ action: ConsoleAction; data: CheckoutCommand; title: string; body: string } | null>(null);
  const [reason, setReason] = useState('');
  const [pAmount, setPAmount] = useState('21000');
  const [pRef, setPRef] = useState('');
  const [pUrl, setPUrl] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [tab, setTab] = useState<'py' | 'node' | 'html'>('py');
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { document.title = 'Checkout console · main_vault'; }, []);
  const d = q.data;
  useEffect(() => {
    if (d && !inited) { setUrls(d.returnUrls); setHook(d.webhookUrl ?? ''); setPUrl(d.returnUrls[0] ?? ''); setInited(true); }
  }, [d, inited]);

  const freshLeft = freshAt ? Math.max(0, Math.ceil((freshAt + ROTATE_WINDOW_MS - now) / 1000)) : 0;

  const run = async (action: ConsoleAction, data: CheckoutCommand, label: string): Promise<CheckoutCommandResult | null> => {
    setBusy(label); setErr(null); setMsg(null);
    try {
      const r = await checkoutConsoleAction(action, data, { headers: { 'x-developer-csrf': session.csrfToken ?? '' } });
      setMsg(r.message ?? 'Done.');
      return r;
    } catch (e) {
      const st = errStatus(e);
      setErr(st === 403 && action === 'issue-api-key' ? 'Passkey confirmation expired. Confirm again, then issue.' : devErr(e, 'Request failed.'));
      return null;
    } finally {
      setBusy(null);
      void qc.invalidateQueries({ queryKey: ['developer',session.id??'anon'] });
    }
  };

  const urlsValid = urls.length <= 5 && urls.every(httpsOk);
  const hookValid = hook.trim() === '' || httpsOk(hook.trim());
  const save = async (): Promise<boolean> => {
    const r = await run('settings', { returnUrls: urls, webhookUrl: hook.trim() }, 'settings');
    if (r?.webhookSecret) setWhSecret(r.webhookSecret);
    return !!r;
  };
  const dirty = !!d && (hook.trim() !== (d.webhookUrl ?? '') || urls.length !== d.returnUrls.length || urls.some((u, i) => u !== d.returnUrls[i]));
  const addUrl = () => { const v = newUrl.trim(); if (!httpsOk(v) || urls.includes(v) || urls.length >= 5) return; setUrls([...urls, v]); setNewUrl(''); };

  const doConfirm = async () => {
    if (!confirm) return;
    const c = confirm; setConfirm(null);
    const r = await run(c.action, { ...c.data, ...(c.action === 'apply-live' ? { reason: reason.trim() } : {}) }, c.action);
    if (c.action === 'issue-api-key' && r?.key) setApiKey(r.key);
    if (r?.webhookSecret) setWhSecret(r.webhookSecret);
  };

  const createPreview = async () => {
    setPreviewUrl(null);
    const r = await run('create-preview', { amountSats: Math.trunc(Number(pAmount)), reason: pRef.trim(), returnUrls: [pUrl] }, 'preview');
    const u = r?.message;
    // The server returns the absolute hosted URL for its own origin (https in production, http only in loopback fixtures).
    if (u && /^https?:\/\/\S+\/checkout\//.test(u)) setPreviewUrl(u);
  };
  const previewOk = /^[0-9]{1,9}$/.test(pAmount) && Number(pAmount) > 0 && pRef.trim().length > 0 && d?.returnUrls.includes(pUrl);

  return (
    <div className="min-h-[100dvh] bg-background pb-16">
      <DevTopBar right={<><DevChip /><Link href="/live" className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-[13px] font-semibold" data-testid="link-back-live"><ArrowLeft className="h-4 w-4" /> Live</Link></>} />
      <main className="mx-auto mt-8 w-full max-w-[1120px] space-y-6 px-5 md:px-8">
        <header>
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Developer · simulation</div>
          <h1 className="mt-2 font-display text-[2rem] font-bold leading-tight">Checkout console</h1>
          <p className="mt-2 max-w-[62ch] text-[14.5px] text-muted-foreground">Hosted checkout runs on simulated sats only. No real Bitcoin is requested, received or settled.</p>
        </header>
        {msg && <Notice tone="ok" testId="status-console-msg">{msg}</Notice>}
        {err && <Notice tone="bad" testId="status-console-error">{err}</Notice>}
        {apiKey && <Secret label="Checkout API key" value={apiKey} file="checkout-api-key.txt" onDone={() => setApiKey(null)} />}
        {whSecret && <Secret label="Webhook signing secret" value={whSecret} file="webhook-secret.txt" onDone={() => setWhSecret(null)} />}

        {q.isLoading ? <SkelRows rows={6} /> : q.isError || !d ? <ErrorPanel error={q.error} onRetry={() => q.refetch()} title="Console unavailable" /> : (
          <>
            <div className="flex flex-wrap gap-2">
              <Pill tone={statusTone(d.status)} testId="status-account">{d.status}</Pill>
              {d.paused && <Pill tone="warn" testId="status-paused">paused by operator</Pill>}
              <Pill testId="status-live-app">live application: {d.liveApplication}</Pill>
              <Pill testId="status-live">live {d.liveEnabled ? 'enabled' : 'disabled'}</Pill>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <Card testId="card-settings">
                <div className="flex items-center gap-1 text-[13px] font-semibold">Return URLs and webhook <WebhookHelp /></div>
                <p className="mt-1 text-[12.5px] text-muted-foreground">Exact HTTPS URLs, up to five. Buyers are only ever sent back to one of these.</p>
                <ul className="mt-3 space-y-2">
                  {urls.map((u, i) => (
                    <li key={u} className="flex items-center gap-2"><code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-2 py-1.5 font-mono text-[12px]" data-testid={`text-return-url-${i}`}>{u}</code><Button size="icon" variant="ghost" onClick={() => setUrls(urls.filter((x) => x !== u))} aria-label="Remove" data-testid={`button-remove-url-${i}`}><Trash2 className="h-4 w-4" /></Button></li>
                  ))}
                </ul>
                <div className="mt-2 flex gap-2"><Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://shop.example/thanks" disabled={urls.length >= 5} data-testid="input-return-url" /><Button variant="outline" onClick={addUrl} disabled={!httpsOk(newUrl.trim()) || urls.length >= 5} data-testid="button-add-url"><Plus className="h-4 w-4" /></Button></div>
                <div className="mt-4 grid gap-1.5"><Label htmlFor="hook" className="flex items-center gap-1">Webhook URL (empty disables) <Help label="Webhook vs return URL"><p>Webhook: your deployed HTTPS server that receives signed POSTs. Return URL: the exact page the buyer's browser lands on afterwards. Neither the redirect nor an "I've made the payment" click proves payment.</p></Help></Label><Input id="hook" value={hook} onChange={(e) => setHook(e.target.value)} placeholder="https://shop.example/hooks/checkout" data-testid="input-webhook-url" /></div>
                {!hookValid && <p className="mt-1 text-[12px] text-destructive">Must be an HTTPS URL.</p>}
                <Button className="mt-4 rounded-full" disabled={!urlsValid || !hookValid || busy !== null} onClick={() => { void save(); }} data-testid="button-save-settings">{busy === 'settings' ? 'Saving' : 'Save'}</Button>
                <Button variant="outline" className="mt-4 ml-2 rounded-full" disabled={!hook.trim() || !hookValid || !urlsValid || busy!==null} onClick={()=>setConfirm({action:'settings',data:{returnUrls:urls,webhookUrl:hook.trim(),reason:'rotate-webhook'},title:'Replace webhook signing secret?',body:'Save the new secret on your server. Existing queued events retain their previous signing secret.'})} data-testid="button-rotate-webhook">Replace signing secret</Button>
              </Card>

              <Card testId="card-api-key">
                <div className="flex items-center gap-2 text-[13px] font-semibold"><KeyRound className="h-4 w-4" /> Server API key</div>
                <p className="mt-1 text-[12.5px] text-muted-foreground">Current: <span className="font-mono" data-testid="text-key-prefix">{d.apiKeyPrefix ? `${d.apiKeyPrefix}...` : 'none'}</span>. Issuing replaces any previous key immediately and needs a passkey confirmation from the last five minutes.</p>
                <div className="mt-3 grid gap-2">
                  <Button variant="outline" className="rounded-full" disabled={pk.busy || !session.email} onClick={() => session.email && pk.run(session.email)} data-testid="button-console-passkey"><Fingerprint className="h-4 w-4" /> {pk.busy ? 'Waiting for passkey' : freshLeft > 0 ? `Confirmed · ${Math.floor(freshLeft / 60)}:${String(freshLeft % 60).padStart(2, '0')} left` : 'Confirm with passkey'}</Button>
                  {pk.err && <Notice tone="bad">{pk.err}</Notice>}
                  <Button className="rounded-full" disabled={freshLeft <= 0 || busy !== null} onClick={() => setConfirm({ action: 'issue-api-key', data: {}, title: 'Issue a new API key?', body: 'Any existing checkout API key stops working right away.' })} data-testid="button-issue-key">Issue key</Button>
                  <Button variant="destructive" className="rounded-full" disabled={!d.apiKeyPrefix || busy !== null} onClick={() => setConfirm({ action: 'revoke-api-key', data: {}, title: 'Revoke the API key?', body: 'Server calls using it will fail until you issue a new one.' })} data-testid="button-revoke-key">Revoke key</Button>
                </div>
                <div className="mt-5 border-t border-border pt-4">
                  <div className="text-[13px] font-semibold">Apply for live</div>
                  <p className="mt-1 text-[12.5px] text-muted-foreground">Request Live access. Approval does not activate payments; activation is confirmed separately.</p>
                  <Button variant="outline" className="mt-2 rounded-full" disabled={busy !== null} onClick={() => { setReason(''); setConfirm({ action: 'apply-live', data: {}, title: 'Apply for live checkout', body: 'Tell the operator what you plan to sell and expected volume.' }); }} data-testid="button-apply-live">Apply</Button>
                </div>
              </Card>
            </div>

            <ApiBaseRow />
            <StarterExport saved={d} dirty={dirty} busy={busy !== null} onSave={save} />

            <Card testId="card-preview">
              <div className="text-[13px] font-semibold">Create a preview checkout</div>
              <p className="mt-1 text-[12.5px] text-muted-foreground">Created by the server for your account. No key is handled in this browser.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-[140px_1fr_1fr_auto] sm:items-end">
                <div className="grid gap-1.5"><Label>Sim sats</Label><Input inputMode="numeric" value={pAmount} onChange={(e) => setPAmount(e.target.value)} data-testid="input-preview-amount" /></div>
                <div className="grid gap-1.5"><Label>Reference</Label><Input value={pRef} onChange={(e) => setPRef(e.target.value)} maxLength={64} placeholder="ORDER-1042" data-testid="input-preview-reference" /></div>
                <div className="grid gap-1.5"><Label>Return URL</Label>
                  <select className="h-10 rounded-md border border-input bg-background px-2 text-[13px]" value={pUrl} onChange={(e) => setPUrl(e.target.value)} data-testid="select-preview-return">
                    <option value="">Choose a saved URL</option>
                    {d.returnUrls.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <Button disabled={!previewOk || busy !== null || d.paused} onClick={createPreview} data-testid="button-create-preview">{busy === 'preview' ? 'Creating' : 'Create'}</Button>
              </div>
              {!d.returnUrls.length && <p className="mt-2 text-[12px] text-muted-foreground">Save a return URL first.</p>}
              {previewUrl && <a href={previewUrl} target="_blank" rel="noreferrer" className="mt-3 block break-all font-mono text-[12.5px] underline" data-testid="link-preview-checkout">{previewUrl}</a>}
            </Card>

            <Card testId="card-sessions">
              <div className="flex items-center justify-between"><div className="text-[13px] font-semibold">Checkout sessions</div><Button size="sm" variant="ghost" onClick={() => q.refetch()} data-testid="button-refresh-console"><RefreshCw className="h-4 w-4" /></Button></div>
              <p className="mt-1 text-[12.5px] text-muted-foreground">Pending sessions settle when a Sandbox wallet pays their destination. Automated tests can complete their own sessions with <code className="font-mono">POST /api/v1/checkout/sessions/:id/simulate</code> and the test key; "Mark paid manually" below does the same by hand.</p>
              {!d.checkouts.length ? <p className="mt-3 text-[13px] text-muted-foreground">No sessions yet. Create one from your server or the preview above.</p> : (
                <div className="mt-3 divide-y divide-border">
                  {d.checkouts.map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid={`row-checkout-${c.id}`}>
                      <div className="min-w-0">
                        <div className="font-mono text-[12.5px]">{c.reference} · {satsToBtc(String(c.amount_sats))} sim BTC</div>
                        <div className="font-mono text-[11.5px] text-muted-foreground">{c.id} · {c.paid_at ? `settled ${stamp(c.paid_at)}${c.paid_via === 'sandbox_transfer' ? ' · Sandbox wallet' : ' · manual'}` : `expires ${stamp(c.expiresAt)}`}</div>
                        {c.status === 'pending' && <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[11.5px] text-muted-foreground"><span className="truncate" data-testid={`text-destination-${c.id}`}>{c.sandbox_destination}</span><CopyText value={c.sandbox_destination} display="Copy destination" /></div>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Pill tone={statusTone(c.status)} testId={`status-checkout-${c.id}`}>{c.status}</Pill>
                        {c.status === 'pending' && <Button size="sm" variant="ghost" className="rounded-full" disabled={busy !== null} onClick={() => setConfirm({ action: 'simulate', data: { checkoutId: c.id }, title: 'MARK PAID MANUALLY', body: `Marks ${c.reference} as simulation_paid without a payer wallet and sends the webhook. Use this only for automated tests. No real Bitcoin moves.` })} data-testid={`button-simulate-${c.id}`}>Mark paid manually</Button>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card testId="card-deliveries">
              <div className="text-[13px] font-semibold">Webhook deliveries</div>
              {!d.deliveries.length ? <p className="mt-3 text-[13px] text-muted-foreground">No deliveries yet.</p> : (
                <div className="mt-3 divide-y divide-border">
                  {d.deliveries.map((w) => (
                    <div key={w.eventId} className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid={`row-delivery-${w.eventId}`}>
                      <div className="min-w-0 font-mono text-[12px]"><div>{w.eventId}</div><div className="text-muted-foreground">checkout {w.checkoutId} · {w.attempts} attempts{w.lastError ? ` · ${w.lastError}` : ''}</div></div>
                      <div className="flex items-center gap-2"><Pill tone={statusTone(w.status)}>{w.status}</Pill>
                        {w.status !== 'delivered' && <Button size="sm" variant="outline" className="rounded-full" disabled={busy !== null} onClick={() => run('retry-webhook', { checkoutId: w.checkoutId }, 'retry')} data-testid={`button-retry-${w.eventId}`}>Retry</Button>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}

        <Card testId="card-docs">
          <div className="text-[13px] font-semibold">Integrate from your server</div>
          <p className="mt-1 text-[12.5px] text-muted-foreground">Set <span className="font-mono">API_BASE</span> explicitly. For this window it is <span className="font-mono">{currentApiBase()}</span>. Call it from your backend with the key and an Idempotency-Key stored with the order (reused on retries), then redirect the buyer to the returned URL. The key never appears in HTML or client JavaScript.</p>
          <div className="mt-3 flex gap-1">{(['py', 'node', 'html'] as const).map((t) => <Button key={t} size="sm" variant={tab === t ? 'default' : 'ghost'} className="rounded-full" onClick={() => setTab(t)} data-testid={`tab-docs-${t}`}>{t === 'py' ? 'Python' : t === 'node' ? 'Node' : 'HTML'}</Button>)}</div>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-sidebar p-4 font-mono text-[12px] text-sidebar-foreground" data-testid="text-docs-code">{tab === 'py' ? pySnippet(currentApiBase()) : tab === 'node' ? nodeSnippet(currentApiBase()) : HTML}</pre>
        </Card>
      </main>

      <Dialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{confirm?.title}</DialogTitle><DialogDescription>{confirm?.body}</DialogDescription></DialogHeader>
          {confirm?.action === 'apply-live' && <div className="grid gap-1.5"><Label htmlFor="r">Reason</Label><Input id="r" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} data-testid="input-apply-reason" /></div>}
          <DialogFooter><Button variant="outline" onClick={() => setConfirm(null)} data-testid="button-confirm-cancel">Cancel</Button><Button onClick={doConfirm} disabled={confirm?.action === 'apply-live' && reason.trim().length < 4} data-testid="button-confirm-ok">Confirm</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useEffect, useState, type ReactNode } from 'react';
import { Check, Copy, HelpCircle, PackageOpen } from 'lucide-react';
import { createStarterArchive } from '@/lib/starter-archive';
import { Card, Notice } from '@/components/developer-frame';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export const currentApiBase = () => (typeof window !== 'undefined' ? window.location.origin : '') + '/api';
export const PRODUCTION_API_BASE = 'https://mainvaultwallet.com/api';

const httpsOk = (v: string) => { try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash; } catch { return false; } };

/** Clickable, keyboard-accessible help bubble. */
export function Help({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`Help: ${label}`} className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid={`button-help-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`}>
          <HelpCircle className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,380px)] space-y-2 rounded-2xl text-[12.5px] leading-relaxed">
        <div className="text-[13px] font-semibold">{label}</div>
        {children}
      </PopoverContent>
    </Popover>
  );
}

export function WebhookHelp() {
  return (
    <Help label="What is a webhook URL">
      <p>A webhook is a <b>deployed HTTPS endpoint on your own server</b> that accepts POST requests. It needs a real DNS record pointing at a running server, a valid TLS certificate, and server code that verifies the signature with your webhook signing secret and records the order.</p>
      <p>Typing an invented subdomain does nothing: if nothing answers there, deliveries fail and show up below as retries.</p>
      <p>The return URL is different: it is the exact page the buyer's browser is sent back to. A redirect to it, or a buyer clicking "I've sent", <b>never proves payment</b>. Only a verified webhook (in this sandbox, a simulated one) may change order state.</p>
    </Help>
  );
}

export function ApiBaseRow() {
  const base = currentApiBase();
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-2xl border border-border bg-muted/40 p-3.5" data-testid="panel-api-base">
      <div className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        API base for this deployment
        <Help label="Which API base to use">
          <p>This value is read from the window you are in right now: <span className="font-mono">{base}</span>. API keys and webhook secrets issued here only work against this deployment.</p>
          <p>A production target such as <span className="font-mono">{PRODUCTION_API_BASE}</span> is an external domain you supply (for example on your own Coolify server). This console does not know or claim that it is deployed or ready. Keys must be issued from that same deployment; keys from here do not migrate.</p>
        </Help>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-lg bg-background px-2.5 py-2 font-mono text-[13px] font-semibold" data-testid="text-api-base">{base}</code>
        <Button size="sm" variant="outline" className="rounded-full" onClick={() => navigator.clipboard.writeText(base).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }, () => setCopied(false))} data-testid="button-copy-api-base">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );
}

type Saved = { returnUrls: string[]; webhookUrl?: string | null; apiKeyPrefix?: string | null };

export function StarterExport({ saved, dirty, busy, onSave }: { saved: Saved; dirty: boolean; busy: boolean; onSave: () => Promise<boolean> }) {
  const current = currentApiBase();
  const [runtime, setRuntime] = useState<'node' | 'python'>('node');
  const [mode, setMode] = useState<'current' | 'custom'>('current');
  const [custom, setCustom] = useState('');
  const [returnUrl, setReturnUrl] = useState(saved.returnUrls[0] ?? '');
  const [pageName, setPageName] = useState('My shop checkout');
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => { if (!saved.returnUrls.includes(returnUrl)) setReturnUrl(saved.returnUrls[0] ?? ''); }, [saved.returnUrls, returnUrl]);

  const webhook = (saved.webhookUrl ?? '').trim();
  const apiBase = mode === 'current' ? current : custom.trim().replace(/\/+$/, '');
  const missing: string[] = [];
  if (dirty) missing.push('Save your return URL and webhook settings first.');
  if (!saved.returnUrls.includes(returnUrl)) missing.push('Choose a saved return URL.');
  if (!webhook) missing.push('Save a webhook URL.');
  if (!saved.apiKeyPrefix) missing.push('Issue a server API key (it is not included in the download).');
  if (!pageName.trim() || pageName.length > 60) missing.push('Page name must be 1 to 60 characters.');
  if (mode === 'custom' && !httpsOk(apiBase)) missing.push('Custom API base must be an HTTPS URL.');
  const ready = missing.length === 0 && !busy && !working;

  const exportIt = async () => {
    setErr(null); setDone(null); setWorking(true);
    try {
      if (!(await onSave())) { setErr('Settings could not be saved, so nothing was exported.'); return; }
      const blob = await createStarterArchive({ runtime, apiBase, returnUrl, webhookUrl: webhook, pageName: pageName.trim() });
      const file = `mainvault-starter-${runtime}.tar.gz`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = file; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDone(`Downloaded ${file}.`);
    } catch {
      setErr('Could not build the starter archive. Try again.');
    } finally { setWorking(false); }
  };

  const seg = (on: boolean) => `h-9 rounded-full px-4 text-[13px] font-semibold ${on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`;

  return (
    <Card testId="card-starter-export">
      <div className="flex items-center gap-2 text-[13px] font-semibold"><PackageOpen className="h-4 w-4" /> Starter project download
        <Help label="What the starter contains">
          <p>A small server plus checkout page as Docker-ready source code, in Node or Python. Nothing is deployed for you.</p>
          <p>It runs on HTTP localhost for development, but real webhook callbacks require it to be hosted on HTTPS with a real domain.</p>
          <p>It contains <span className="font-mono">.env.mainvaultwallet.example</span> with placeholders only. Your API key and webhook secret are never written into the archive; set them as server-side environment variables yourself.</p>
          <p>Simulation only: no Bitcoin address, no payment QR, no real payment.</p>
        </Help>
      </div>
      <p className="mt-1 max-w-[70ch] text-[12.5px] text-muted-foreground">Server and UI source with your saved settings filled in. Secrets stay as placeholders. Simulated sats only.</p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="grid gap-1.5">
          <span className="text-[13px] font-medium">Runtime</span>
          <div role="radiogroup" aria-label="Runtime" className="inline-flex w-fit gap-1 rounded-full border border-border p-1">
            {(['node', 'python'] as const).map((r) => <button key={r} type="button" role="radio" aria-checked={runtime === r} className={seg(runtime === r)} onClick={() => setRuntime(r)} data-testid={`radio-runtime-${r}`}>{r === 'node' ? 'Node' : 'Python'}</button>)}
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="starter-name">Page name ({pageName.length}/60)</Label>
          <Input id="starter-name" value={pageName} maxLength={60} onChange={(e) => setPageName(e.target.value)} data-testid="input-starter-name" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="starter-return">Return URL (saved)</Label>
          <select id="starter-return" className="h-10 rounded-md border border-input bg-background px-2 text-[13px]" value={returnUrl} onChange={(e) => setReturnUrl(e.target.value)} data-testid="select-starter-return">
            <option value="">Choose a saved URL</option>
            {saved.returnUrls.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div className="grid gap-1.5">
          <span className="flex items-center gap-1 text-[13px] font-medium">Webhook URL (saved) <WebhookHelp /></span>
          <code className="truncate rounded-md border border-input bg-muted px-2 py-2.5 font-mono text-[12px]" data-testid="text-starter-webhook">{webhook || 'not set'}</code>
        </div>
      </div>

      <fieldset className="mt-4 grid gap-2">
        <legend className="mb-1.5 text-[13px] font-medium">API base written into the starter</legend>
        <label className="flex items-start gap-2 text-[13px]"><input type="radio" name="apibase" className="mt-1" checked={mode === 'current'} onChange={() => setMode('current')} data-testid="radio-base-current" /> <span>This deployment: <span className="break-all font-mono">{current}</span></span></label>
        <label className="flex items-start gap-2 text-[13px]"><input type="radio" name="apibase" className="mt-1" checked={mode === 'custom'} onChange={() => setMode('custom')} data-testid="radio-base-custom" /> <span>Custom production base you host</span></label>
        {mode === 'custom' && (
          <div className="ml-6 grid gap-2">
            <Input aria-label="Custom API base" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="https://mainvaultwallet.com/api" data-testid="input-starter-custom-base" />
            <Notice tone="warn">Only use a domain you deployed yourself. Keys and webhook secrets do not migrate between deployments: issue them from the console of that deployment.</Notice>
          </div>
        )}
      </fieldset>

      {missing.length > 0 && <ul className="mt-4 list-disc space-y-0.5 pl-5 text-[12.5px] text-muted-foreground" data-testid="list-starter-missing">{missing.map((m) => <li key={m}>{m}</li>)}</ul>}
      {err && <div className="mt-3"><Notice tone="bad">{err}</Notice></div>}
      {done && <div className="mt-3"><Notice tone="ok" testId="status-starter-done">{done} Fill in .env from the example on your server.</Notice></div>}
      <Button className="mt-4 rounded-full" disabled={!ready} onClick={exportIt} data-testid="button-export-starter">{working ? 'Saving and packaging' : 'Save and download .tar.gz'}</Button>
    </Card>
  );
}

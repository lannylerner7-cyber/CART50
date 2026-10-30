import { useState, type ReactNode } from 'react';
type ApiErr = { name: string; status: number; data: unknown };
const isApiErr = (e: unknown): e is ApiErr => typeof e === 'object' && e !== null && typeof (e as ApiErr).status === 'number' && (e as ApiErr).name === 'ApiError';

export type Rec = Record<string, unknown>;
export const str = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
export const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
export const fmtSats = (v: unknown) => `${num(v).toLocaleString()} sats`;

export function errStatusOf(e: unknown): number | null {
  return isApiErr(e) ? e.status : null;
}
export function errText(e: unknown): string {
  if (isApiErr(e)) {
    const d = e.data as { error?: unknown } | null;
    return typeof d?.error === 'string' ? d.error : `Request failed (${e.status})`;
  }
  return 'Network failure: the local service did not respond. Your input and request key are kept; retry sends the same request.';
}
/** Definitive = server answered with a 4xx (transaction rolled back, nothing applied). */
export const definitive = (e: unknown) => {
  const s = errStatusOf(e);
  return s !== null && s >= 400 && s < 500;
};

export function newKey() {
  return 'wf-' + crypto.randomUUID();
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-mono uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}
export const inputCls = 'h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring';
export const btnCls = 'inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50';
export const ghostCls = 'inline-flex h-8 items-center justify-center rounded-md border border-border px-2.5 text-xs disabled:opacity-40';

export function Section({ id, title, meta, children }: { id?: string; title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={id ? id + '-h' : undefined} className="rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h2 id={id ? id + '-h' : undefined} className="text-sm font-semibold">{title}</h2>
        {meta && <div className="text-xs text-muted-foreground">{meta}</div>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Alert({ text }: { text: string | null }) {
  if (!text) return null;
  return <p role="alert" className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">{text}</p>;
}

export function Tag({ children, tone = 'n' }: { children: ReactNode; tone?: 'n' | 'ok' | 'warn' | 'bad' }) {
  const c = tone === 'ok' ? 'border-emerald-600/40 text-emerald-700' : tone === 'warn' ? 'border-amber-600/40 text-amber-700' : tone === 'bad' ? 'border-destructive/50 text-destructive' : 'border-border text-muted-foreground';
  return <span className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${c}`}>{children}</span>;
}

export const toneFor = (s: string) => (['confirmed', 'complete', 'delivered', 'active'].includes(s) ? 'ok' : ['failed', 'reversed', 'suspended'].includes(s) ? 'bad' : ['pending', 'review', 'reserved', 'unknown', 'broadcast', 'sending', 'frozen'].includes(s) ? 'warn' : 'n') as 'n' | 'ok' | 'warn' | 'bad';

export function ReceiptActions({ record, kind }: { record: Rec; kind: string }) {
  const [open, setOpen] = useState(false);
  const text = [
    'MAINVAULT WALLET FOUNDATION - LOCAL SIMULATION RECEIPT',
    'Not a blockchain receipt. No real funds moved. Not a legal or tax document.',
    `Kind: ${kind}`,
    ...Object.entries(record).map(([k, v]) => `${k}: ${str(v)}`),
    `Generated: ${new Date().toISOString()}`,
  ].join('\n');
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url; a.download = `local-receipt-${kind}-${str(record.id).slice(0, 8)}.txt`; a.click();
    URL.revokeObjectURL(url);
  };
  const print = () => {
    const w = window.open('', '_blank', 'noopener=no,width=640,height=720');
    if (!w) return;
    const pre = w.document.createElement('pre');
    pre.textContent = text; // text only, never HTML
    pre.style.cssText = 'font:12px/1.5 monospace;white-space:pre-wrap;padding:24px';
    w.document.title = 'Local simulation receipt';
    w.document.body.appendChild(pre);
    w.print();
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" className={ghostCls} onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Hide' : 'Receipt'}</button>
      <button type="button" className={ghostCls} onClick={download}>Download</button>
      <button type="button" className={ghostCls} onClick={print}>Print</button>
      {open && <pre className="mt-1 w-full whitespace-pre-wrap rounded border border-dashed border-border bg-muted/40 p-2 font-mono text-[11px]">{text}</pre>}
    </div>
  );
}

export function Pager({ hasPrev, hasNext, onPrev, onNext, count, loading }: { hasPrev: boolean; hasNext: boolean; onPrev: () => void; onNext: () => void; count: number; loading: boolean }) {
  return (
    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
      <span aria-live="polite">{loading ? 'Loading…' : `${count} on this page`}</span>
      <div className="flex gap-1.5">
        <button type="button" className={ghostCls} disabled={!hasPrev || loading} onClick={onPrev}>Previous</button>
        <button type="button" className={ghostCls} disabled={!hasNext || loading} onClick={onNext}>Next</button>
      </div>
    </div>
  );
}

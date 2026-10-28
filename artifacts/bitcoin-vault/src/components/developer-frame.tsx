import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { Check, Copy, Download, KeyRound } from 'lucide-react';
import { BRAND_MARK } from '@/lib/assets';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function useReducedMotion() {
  const q = '(prefers-reduced-motion: reduce)';
  const [r, setR] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const h = () => setR(m.matches);
    m.addEventListener('change', h);
    return () => m.removeEventListener('change', h);
  }, []);
  return r;
}

const STEPS = ['Apply', 'Verify', 'Passkey', 'Provision', 'Key'] as const;
export type Step = (typeof STEPS)[number];

export function DevChip() {
  return <span className="inline-flex items-center gap-1.5 rounded-full border border-cold/30 bg-cold/10 px-2.5 py-1 text-[11.5px] font-semibold text-cold" data-testid="chip-developer"><span className="h-1.5 w-1.5 rounded-full bg-cold" /> Developer</span>;
}

export function DevTopBar({ right }: { right?: ReactNode }) {
  return (
    <header className="mx-auto flex w-full max-w-[1120px] items-center justify-between gap-3 px-5 pt-[max(1rem,env(safe-area-inset-top))] md:px-8">
      <Link href="/" className="flex items-center gap-2.5" data-testid="link-dev-brand">
        <img src={BRAND_MARK} alt="" className="h-9 w-9" />
        <div className="leading-none"><div className="font-display text-[17px] font-bold">main_vault</div><div className="mt-0.5 text-[11px] text-muted-foreground">Developer access</div></div>
      </Link>
      <div className="flex items-center gap-2">{right ?? <DevChip />}</div>
    </header>
  );
}

export function DevFrame({ step, title, desc, children, aside }: { step?: Step; title: string; desc?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  const idx = step ? STEPS.indexOf(step) : -1;
  return (
    <div className="min-h-[100dvh] bg-background pb-16">
      <DevTopBar />
      <main className="mx-auto mt-8 grid w-full max-w-[1120px] gap-8 px-5 md:mt-12 md:px-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {step && (
            <ol className="mb-6 flex flex-wrap gap-1.5" aria-label="Setup progress" data-testid="list-steps">
              {STEPS.map((s, i) => (
                <li key={s} aria-current={i === idx ? 'step' : undefined} className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold', i < idx ? 'bg-ok/10 text-ok' : i === idx ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                  {i < idx ? <Check className="h-3 w-3" /> : <span className="font-mono">{i + 1}</span>}{s}
                </li>
              ))}
            </ol>
          )}
          <h1 className="rise font-display text-[2rem] font-bold leading-[1.05] md:text-[2.6rem]">{title}</h1>
          {desc && <div className="rise rise-1 mt-3 max-w-[60ch] text-[15px] text-muted-foreground">{desc}</div>}
          <div className="rise rise-2 mt-7">{children}</div>
        </div>
        {aside && <aside className="space-y-4 text-[13.5px] text-muted-foreground">{aside}</aside>}
      </main>
    </div>
  );
}

export function Card({ children, className, testId }: { children: ReactNode; className?: string; testId?: string }) {
  return <section className={cn('rounded-[20px] border border-card-border bg-card p-5 md:p-6', className)} data-testid={testId}>{children}</section>;
}

export function Notice({ tone = 'neutral', children, testId }: { tone?: 'neutral' | 'warn' | 'bad' | 'ok'; children: ReactNode; testId?: string }) {
  const t = { neutral: 'border-border bg-muted/50', warn: 'border-warn/40 bg-warn/5', bad: 'border-destructive/30 bg-destructive/5 text-destructive', ok: 'border-ok/30 bg-ok/5' }[tone];
  return <div role={tone === 'bad' ? 'alert' : 'status'} className={cn('rounded-2xl border p-3.5 text-[13.5px]', t)} data-testid={testId}>{children}</div>;
}

/** One-time key display. The key lives only in the caller's component state. */
export function KeyReveal({ value, onDone, doneLabel = 'Continue to Sandbox' }: { value: string; onDone: () => void; doneLabel?: string }) {
  const [copied, setCopied] = useState(false);
  const [copyErr, setCopyErr] = useState(false);
  const [ack, setAck] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setCopyErr(false); setTimeout(() => setCopied(false), 2000); }
    catch { setCopyErr(true); }
  };
  const download = () => {
    const text = ['main_vault developer login key', 'Keep this private. It is shown once and cannot be recovered.', '', value, ''].join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a'); a.href = url; a.download = 'main-vault-developer-login-key.txt'; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <Card testId="card-key-reveal">
      <div className="flex items-center gap-2 text-[13px] font-semibold"><KeyRound className="h-4 w-4 text-cold" /> Login key, shown once</div>
      <div className="mt-3 break-all rounded-2xl bg-muted p-4 font-mono text-[14px] leading-relaxed" data-testid="text-login-key">{value}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="rounded-full" onClick={copy} data-testid="button-copy-key">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Copied' : 'Copy'}</Button>
        <Button type="button" variant="outline" className="rounded-full" onClick={download} data-testid="button-download-key"><Download className="h-4 w-4" /> Download .txt</Button>
      </div>
      {copyErr && <p className="mt-2 text-[12.5px] text-destructive">Clipboard blocked. Select the key and copy it manually, or download it.</p>}
      <div className="mt-4"><Notice tone="warn">This key is never shown again and cannot be recovered. If it is lost, sign in with your passkey and rotate it: a new key is issued and this one stops working.</Notice></div>
      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-border p-3 text-[14px]">
        <Checkbox checked={ack} onCheckedChange={(v) => setAck(!!v)} className="mt-0.5" data-testid="checkbox-key-saved" />
        I saved this key in a password manager or another safe place.
      </label>
      <Button className="mt-4 h-12 w-full rounded-full font-bold" disabled={!ack} onClick={onDone} data-testid="button-key-done">{doneLabel}</Button>
    </Card>
  );
}

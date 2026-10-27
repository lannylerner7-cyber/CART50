import { useState, type ReactNode } from 'react';
import { AlertTriangle, Check, Copy, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { errMsg, errStatus, satsToBtc, satsGrouped } from '@/lib/vault';

export function PageHeader({ kicker, title, desc, actions }: { kicker: string; title: string; desc?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="rise flex flex-col gap-4 pb-2 md:flex-row md:items-end md:justify-between">
      <div>
        <div className="text-[12.5px] font-medium text-muted-foreground">{kicker}</div>
        <h1 className="font-display mt-1 text-[1.85rem] font-bold leading-tight tracking-tight md:text-[2.25rem]" data-testid="text-page-title">{title}</h1>
        {desc && <p className="mt-1.5 max-w-2xl text-[14.5px] leading-relaxed text-muted-foreground">{desc}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

type Tone = 'ok' | 'warn' | 'bad' | 'cold' | 'neutral' | 'ember';
const toneCls: Record<Tone, string> = {
  ok: 'text-ok bg-ok/10 border-ok/30',
  warn: 'text-warn bg-warn/10 border-warn/30',
  bad: 'text-destructive bg-destructive/10 border-destructive/30',
  cold: 'text-cold bg-cold/10 border-cold/30',
  neutral: 'text-muted-foreground bg-muted border-border',
  ember: 'text-primary bg-primary/10 border-primary/30',
};

export function Pill({ tone = 'neutral', children, dot, className, testId }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string; testId?: string }) {
  return (
    <span data-testid={testId} className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold capitalize whitespace-nowrap', toneCls[tone], className)}>
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          {tone === 'ok' && <span className="pulse-dot absolute inset-0 rounded-full bg-current" />}
          <span className="relative h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}

export function statusTone(status: string): Tone {
  const s = status.toLowerCase();
  if (/(active|confirmed|ok|healthy|connected|online|ready|enabled|synced)/.test(s)) return 'ok';
  if (/(expired|pending|unconfirmed|degraded|stale|paused|syncing|mempool)/.test(s)) return 'warn';
  if (/(fail|error|blocked|disabled|offline|replaced|down|rejected)/.test(s)) return 'bad';
  return 'neutral';
}

export function Btc({ sats, className, size = 'md', showSats }: { sats: string | bigint | null | undefined; className?: string; size?: 'sm' | 'md' | 'lg' | 'xl'; showSats?: boolean }) {
  const btc = satsToBtc(sats);
  const [whole, frac] = btc.split('.');
  const sz = { sm: 'text-xs', md: 'text-sm', lg: 'text-2xl', xl: 'text-4xl md:text-5xl' }[size];
  return (
    <span className={cn('font-mono tabular-nums whitespace-nowrap', sz, className)}>
      {whole}.<span>{frac.slice(0, 4)}</span><span className="opacity-50">{frac.slice(4)}</span>
      <span className="ml-1 text-[0.6em] uppercase tracking-wider opacity-60">btc</span>
      {showSats && <span className="ml-2 block text-[11px] opacity-60 md:inline">{satsGrouped(sats)} sats</span>}
    </span>
  );
}

export function ErrorPanel({ error, onRetry, title = 'Request failed' }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <div className="rise flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4" data-testid="status-error">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-destructive">{title}</div>
        <div className="mt-0.5 break-words font-mono text-xs text-muted-foreground">{errMsg(error)}</div>
      </div>
      {onRetry && (
        <button onClick={onRetry} data-testid="button-retry" className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-destructive/40 px-3 text-[12.5px] font-semibold text-destructive hover:bg-destructive/10 transition-colors">
          <RotateCw className="h-3.5 w-3.5" /> Retry
        </button>
      )}
    </div>
  );
}

export function Panel({ title, meta, children, className, bodyClass }: { title?: ReactNode; meta?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={cn('rise rounded-[20px] border border-card-border bg-card', className)}>
      {title && (
        <div className="flex items-center justify-between gap-2 px-5 pt-5 pb-0">
          <h2 className="font-display text-[19px] font-bold tracking-tight text-foreground first-letter:uppercase">{title}</h2>
          {meta && <div className="text-xs text-muted-foreground">{meta}</div>}
        </div>
      )}
      <div className={cn('p-5', bodyClass)}>{children}</div>
    </section>
  );
}

export function Skel({ className }: { className?: string }) {
  return <div className={cn('relative overflow-hidden rounded-[16px] bg-muted animate-pulse', className)} />;
}

export function SkelRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2" data-testid="status-loading">
      {Array.from({ length: rows }).map((_, i) => <Skel key={i} className="h-9" />)}
    </div>
  );
}

export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-border bg-card px-6 py-12 text-center" data-testid="status-empty">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-full border border-border bg-card text-muted-foreground">{icon}</div>
      <div className="font-display text-lg font-semibold">{title}</div>
      <div className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</div>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function CopyText({ value, className, display }: { value: string; className?: string; display?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      data-testid="button-copy"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1200); }).catch(() => undefined);
      }}
      className={cn('group inline-flex max-w-full items-center gap-1.5 font-mono text-xs hover:text-primary transition-colors', className)}
      title="Copy"
    >
      <span className="truncate">{display ?? value}</span>
      {done ? <Check className="h-3 w-3 shrink-0 text-ok" /> : <Copy className="h-3 w-3 shrink-0 opacity-40 group-hover:opacity-100" />}
    </button>
  );
}

export function Stat({ label, children, sub }: { label: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] font-medium capitalize text-muted-foreground">{label}</div>
      <div className="mt-1 truncate">{children}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** Settings and signer-backed policy return 503 when the signing engine is not configured. */
export function PolicyError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (errStatus(error) === 503) {
    return (
      <div className="rise flex items-start gap-3 rounded-2xl border border-warn/30 bg-warn/5 p-4" data-testid="status-signer-unconfigured">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Signing engine not connected</div>
          <div className="mt-0.5 text-[13px] text-muted-foreground">Spending policy and limits are unavailable until the server operator configures the signer. Nothing is assumed; sending stays disabled.</div>
        </div>
        {onRetry && <button onClick={onRetry} className="rounded-full bg-muted px-3 py-1 text-xs font-semibold" data-testid="button-retry-policy">Retry</button>}
      </div>
    );
  }
  return <ErrorPanel error={error} onRetry={onRetry} title="Policy unavailable" />;
}

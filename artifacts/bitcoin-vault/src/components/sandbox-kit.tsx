import type { ReactNode } from 'react';
import { WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOnline } from '@/components/receive';

/** Page header matching Live; the shell supplies the persistent mode indicator. */
export function SandboxHeader({ title, desc, kicker, actions }: { title: string; desc?: ReactNode; kicker?: string; actions?: ReactNode }) {
  return (
    <header className="rise flex flex-col gap-4 pb-1 md:flex-row md:items-end md:justify-between">
      <div>
        {kicker && <div className="text-[12.5px] font-medium text-muted-foreground">{kicker}</div>}
        <h1 className="font-display mt-1 text-[1.95rem] font-bold leading-tight tracking-tight md:text-[2.35rem]" data-testid="text-page-title">{title}</h1>
        {desc && <p className="mt-1 max-w-2xl text-[15px] text-muted-foreground">{desc}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Same surface as Live's Panel, with an optional right-side meta slot. */
export function SandboxCard({ title, meta, children, className, testId }: { title?: ReactNode; meta?: ReactNode; children: ReactNode; className?: string; testId?: string }) {
  return (
    <section data-testid={testId} className={cn('rise rounded-[20px] border border-card-border bg-card p-5 md:p-6', className)}>
      {title && (
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-[19px] font-bold tracking-tight">{title}</h2>
          {meta && <div className="text-xs text-muted-foreground">{meta}</div>}
        </div>
      )}
      <div className={title ? 'mt-4' : ''}>{children}</div>
    </section>
  );
}

export function Reconnecting({ fetching }: { fetching: boolean }) {
  const online = useOnline();
  if (online && !fetching) return null;
  return (
    <div role="status" className="flex items-center gap-2 rounded-2xl border border-border bg-muted/60 px-3.5 py-2.5 text-[13px] text-muted-foreground" data-testid="status-reconnecting">
      <WifiOff className="h-4 w-4" /> {online ? 'Refreshing' : 'Offline. Reconnecting when the network returns; nothing is sent while offline.'}
    </div>
  );
}

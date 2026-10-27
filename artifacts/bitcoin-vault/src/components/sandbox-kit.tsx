import type { ReactNode } from 'react';
import { WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Pill } from '@/components/kit';
import { useOnline } from '@/components/receive';

export function TestTag({ children = 'TEST' }: { children?: ReactNode }) {
  return <Pill tone="warn" className="normal-case">{children}</Pill>;
}

export function SandboxHeader({ title, desc }: { title: string; desc?: ReactNode }) {
  return (
    <header className="rise pb-1">
      <div className="text-[12px] font-medium text-muted-foreground">Sandbox · test values only</div>
      <h1 className="font-display mt-1 text-[2rem] font-bold leading-tight md:text-[2.4rem]" data-testid="text-page-title">{title}</h1>
      {desc && <p className="mt-2 max-w-2xl text-[15px] text-muted-foreground">{desc}</p>}
    </header>
  );
}

export function SandboxCard({ title, tag, children, className, testId }: { title?: ReactNode; tag?: ReactNode; children: ReactNode; className?: string; testId?: string }) {
  return (
    <section data-testid={testId} className={cn('rise rounded-[20px] border border-card-border bg-card p-5 md:p-6', className)}>
      {title && <h2 className="font-display text-[20px] font-bold">{title}</h2>}
      {tag && <div className="mt-2">{tag}</div>}
      <div className={title || tag ? 'mt-4' : ''}>{children}</div>
    </section>
  );
}

export function Reconnecting({ fetching }: { fetching: boolean }) {
  const online = useOnline();
  if (online && !fetching) return null;
  return (
    <div role="status" className="flex items-center gap-2 rounded-2xl border border-border bg-muted/60 px-3.5 py-2.5 text-[13px] text-muted-foreground" data-testid="status-reconnecting">
      <WifiOff className="h-4 w-4" /> {online ? 'Refreshing sandbox ledger' : 'Offline. Reconnecting when the network returns; no sandbox action is sent while offline.'}
    </div>
  );
}

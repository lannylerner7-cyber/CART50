import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { Activity, ArrowUpRight, Boxes, Gauge, Lock, Menu, ScanSearch, Settings2, TrendingDown, X, ListTree } from 'lucide-react';
import { useLockVault, setCsrfToken } from '@workspace/api-client-react';
import { useCsrf, useSession, remaining, errMsg } from '@/lib/vault';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export const NAV = [
  { href: '/', label: 'Overview', icon: Gauge, code: '00' },
  { href: '/wallets', label: 'Wallets', icon: Boxes, code: '01' },
  { href: '/transactions', label: 'Transactions', icon: ListTree, code: '02' },
  { href: '/spending', label: 'Spending', icon: ArrowUpRight, code: '03' },
  { href: '/explorer', label: 'Explorer', icon: ScanSearch, code: '04' },
  { href: '/market', label: 'Market', icon: TrendingDown, code: '05' },
  { href: '/settings', label: 'Settings', icon: Settings2, code: '06' },
];

export function VaultMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="1.5" y="1.5" width="29" height="29" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 7.5v3M16 21.5v3M7.5 16h3M21.5 16h3" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="2.4" fill="hsl(var(--sidebar-primary))" />
    </svg>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const session = useSession();
  const qc = useQueryClient();
  const { toast } = useToast();
  const lock = useLockVault(useCsrf());

  const doLock = () =>
    lock.mutate(undefined, {
      onSettled: (_d, e) => {
        if (e) toast({ title: 'Lock request failed', description: errMsg(e), variant: 'destructive' });
        setCsrfToken(null);
        qc.clear();
      },
    });

  const isActive = (href: string) => (href === '/' ? location === '/' : location.startsWith(href));

  const nav = (
    <nav className="flex flex-col gap-0.5">
      {NAV.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          onClick={() => setOpen(false)}
          data-testid={`link-nav-${n.label.toLowerCase()}`}
          className={cn(
            'group relative flex items-center gap-3 rounded-sm px-3 py-2 text-sm transition-colors',
            isActive(n.href) ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
          )}
        >
          <span className={cn('absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-sidebar-primary transition-transform origin-center', isActive(n.href) ? 'scale-y-100' : 'scale-y-0')} />
          <span className="font-mono text-[10px] opacity-40">{n.code}</span>
          <n.icon className="h-4 w-4" />
          {n.label}
        </Link>
      ))}
    </nav>
  );

  const footer = (
    <div className="space-y-3 border-t border-sidebar-border pt-4">
      <div className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-wider text-sidebar-foreground/60">
        <span>network</span>
        <span className="text-sidebar-primary" data-testid="text-network">{session.network}</span>
      </div>
      <div className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-wider text-sidebar-foreground/60">
        <span>session</span>
        <span data-testid="text-session-expiry">{remaining(session.expiresAt).label}</span>
      </div>
      <button
        onClick={doLock}
        disabled={lock.isPending}
        data-testid="button-lock"
        className="flex w-full items-center justify-center gap-2 rounded-sm border border-sidebar-border px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-sidebar-foreground hover:border-sidebar-primary hover:text-sidebar-primary transition-colors disabled:opacity-50"
      >
        <Lock className="h-3.5 w-3.5" /> {lock.isPending ? 'Locking' : 'Lock vault'}
      </button>
    </div>
  );

  return (
    <div className="min-h-[100dvh] md:pl-60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-sidebar p-4 text-sidebar-foreground md:flex">
        <Brand />
        <div className="mt-8 flex-1">{nav}</div>
        {footer}
      </aside>

      <div className="sticky top-0 z-30 flex items-center justify-between bg-sidebar px-4 py-3 text-sidebar-foreground md:hidden">
        <Brand />
        <button onClick={() => setOpen((o) => !o)} data-testid="button-mobile-menu" className="p-1">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
      </div>
      {open && (
        <div className="fixed inset-x-0 top-[52px] z-30 bg-sidebar p-4 text-sidebar-foreground md:hidden rise">
          {nav}
          <div className="mt-4">{footer}</div>
        </div>
      )}

      <main className="mx-auto max-w-[1400px] px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5" data-testid="link-brand">
      <VaultMark className="h-7 w-7 text-sidebar-foreground" />
      <div className="leading-none">
        <div className="font-display text-[15px] font-extrabold text-sidebar-accent-foreground">Strongroom</div>
        <div className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.2em] text-sidebar-foreground/50">personal btc vault</div>
      </div>
    </Link>
  );
}

export function NodeChip({ connected, label }: { connected: boolean; label: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider', connected ? 'text-ok' : 'text-destructive')}>
      <Activity className="h-3.5 w-3.5" /> {label}
    </span>
  );
}

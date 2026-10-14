import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { Activity, ArrowUpRight, Wallet as WalletIcon, Home, Lock, Menu, ScanSearch, Settings2, LineChart, X, History } from 'lucide-react';
import { useLockVault } from '@workspace/api-client-react';
import { useCsrf, useSession, remaining, errMsg, errStatus } from '@/lib/vault';
import { lockClient } from '@/lib/session-lock';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { NetworkBadge } from '@/components/receive';

export const NAV = [
  { href: '/', label: 'Overview', icon: Home, code: '00' },
  { href: '/wallets', label: 'Wallets', icon: WalletIcon, code: '01' },
  { href: '/transactions', label: 'Transactions', icon: History, code: '02' },
  { href: '/spending', label: 'Spending', icon: ArrowUpRight, code: '03' },
  { href: '/explorer', label: 'Explorer', icon: ScanSearch, code: '04' },
  { href: '/market', label: 'Market', icon: LineChart, code: '05' },
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
      onSuccess: () => {
        lockClient(qc);
        setOpen(false);
      },
      onError: (e) => {
        if (errStatus(e) === 401) { lockClient(qc); setOpen(false); return; }
        toast({ title: 'Logout not confirmed — please retry', description: errMsg(e), variant: 'destructive' });
      },
    });

  const isActive = (href: string) => (href === '/' ? location === '/' : location.startsWith(href));

  const nav = (
    <nav className="flex flex-col gap-1">
      {NAV.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          onClick={() => setOpen(false)}
          data-testid={`link-nav-${n.label.toLowerCase()}`}
          className={cn(
            'flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[14.5px] font-semibold transition-colors',
            isActive(n.href) ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <n.icon className="h-[18px] w-[18px]" />
          {n.label}
        </Link>
      ))}
    </nav>
  );

  const footer = (
    <div className="space-y-3 rounded-3xl bg-muted/70 p-4">
      <div className="flex items-center justify-between text-[12.5px] text-muted-foreground">
        <span>Network</span>
        <span className="font-bold uppercase text-warn" data-testid="text-network">{session.network}</span>
      </div>
      <div className="flex items-center justify-between text-[12.5px] text-muted-foreground">
        <span>Session</span>
        <span className="font-semibold text-foreground" data-testid="text-session-expiry">{remaining(session.expiresAt).label}</span>
      </div>
      <button
        onClick={doLock}
        disabled={lock.isPending}
        data-testid="button-lock"
        className="flex w-full items-center justify-center gap-2 rounded-full bg-card px-3 py-2.5 text-[13px] font-bold shadow-sm transition-transform active:scale-[0.98] disabled:opacity-50"
      >
        <Lock className="h-4 w-4" /> {lock.isPending ? 'Logging out…' : 'Logout'}
      </button>
    </div>
  );

  const TABS = [NAV[0], NAV[1], NAV[3], NAV[2]];

  return (
    <div className="min-h-[100dvh] pb-24 md:pb-0 md:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-card p-5 md:flex">
        <Brand />
        <div className="mt-3"><NetworkBadge network={session.network} /></div>
        <div className="mt-7 flex-1">{nav}</div>
        {footer}
      </aside>

      <div className="sticky top-0 z-30 flex items-center justify-between gap-2 bg-background/85 px-4 py-3 backdrop-blur-md md:hidden">
        <Brand />
        <div className="flex items-center gap-2">
          <NetworkBadge network={session.network} className="text-[10px]" />
          <button onClick={doLock} disabled={lock.isPending} aria-label="Logout" data-testid="button-lock-mobile" className="flex min-h-10 items-center gap-1 rounded-full bg-card px-3 text-xs font-semibold shadow-sm"><Lock className="h-4 w-4" />{lock.isPending ? 'Logging out…' : 'Logout'}</button>
        </div>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 rounded-[26px] border border-border bg-card/95 p-1.5 shadow-[0_12px_32px_-12px_hsl(232_30%_20%/0.35)] backdrop-blur md:hidden">
        {TABS.map((n) => (
          <Link key={n.href} href={n.href} onClick={() => setOpen(false)} data-testid={`tab-nav-${n.label.toLowerCase()}`}
            className={cn('flex flex-col items-center gap-0.5 rounded-2xl py-2 text-[10.5px] font-semibold transition-colors', isActive(n.href) && !open ? 'bg-foreground text-background' : 'text-muted-foreground')}>
            <n.icon className="h-5 w-5" />{n.label === 'Transactions' ? 'Activity' : n.label === 'Spending' ? 'Send' : n.label === 'Overview' ? 'Home' : n.label}
          </Link>
        ))}
        <button onClick={() => setOpen((o) => !o)} data-testid="button-mobile-menu" className={cn('flex flex-col items-center gap-0.5 rounded-2xl py-2 text-[10.5px] font-semibold', open ? 'bg-foreground text-background' : 'text-muted-foreground')}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}More
        </button>
      </nav>
      {open && (
        <div className="fixed inset-x-3 bottom-[88px] z-40 rounded-[26px] border border-border bg-card p-4 shadow-xl md:hidden rise">
          {nav}
          <div className="mt-4">{footer}</div>
        </div>
      )}

      <main className="mx-auto max-w-[1200px] px-4 py-4 md:px-10 md:py-10">{children}</main>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5" data-testid="link-brand">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-foreground text-background"><VaultMark className="h-6 w-6" /></span>
      <div className="leading-none">
        <div className="font-display text-[16px] font-extrabold">Strongroom</div>
        <div className="mt-0.5 hidden text-[11px] text-muted-foreground sm:block">Personal Bitcoin vault</div>
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

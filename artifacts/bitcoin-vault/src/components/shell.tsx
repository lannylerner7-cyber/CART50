import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { Activity, ArrowUpRight, Wallet as WalletIcon, Home, Lock, Menu, ScanSearch, Settings2, LineChart, History, FlaskConical } from 'lucide-react';
import { useLockVault } from '@workspace/api-client-react';
import { useCsrf, useSession, remaining, errMsg, errStatus } from '@/lib/vault';
import { lockClient } from '@/lib/session-lock';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { NetworkBadge } from '@/components/receive';
import { Sheet } from '@/components/sheet';
import { BRAND_MARK } from '@/lib/assets';

export const NAV = [
  { href: '/', label: 'Home', icon: Home, code: '00' },
  { href: '/wallets', label: 'Wallets', icon: WalletIcon, code: '01' },
  { href: '/transactions', label: 'Activity', icon: History, code: '02' },
  { href: '/spending', label: 'Send', icon: ArrowUpRight, code: '03' },
  { href: '/explorer', label: 'Explorer', icon: ScanSearch, code: '04' },
  { href: '/market', label: 'Market', icon: LineChart, code: '05' },
  { href: '/settings', label: 'Settings', icon: Settings2, code: '06' },
];

export function VaultMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path d="M2.5 4H11.5V8.5H7V23.5H11.5V28H2.5V4ZM29.5 4H20.5V8.5H25V23.5H20.5V28H29.5V4Z" fill="currentColor" />
      <path d="M12.5 12H19.5V22.5H12.5V12ZM12 27H20V30H12V27Z" fill="hsl(var(--accent))" />
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

  useEffect(() => {
    const cur = NAV.find((n) => (n.href === '/' ? location === '/' : location.startsWith(n.href)));
    document.title = cur ? `${cur.label} · main_vault` : 'main_vault';
  }, [location]);

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
            'flex items-center gap-3 rounded-[14px] px-3.5 py-2.5 text-[14px] font-medium transition-colors',
            isActive(n.href) ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <n.icon className="h-[18px] w-[18px]" />
          {n.label}
        </Link>
      ))}
    </nav>
  );

  const footer = (
    <div className="space-y-3 rounded-[20px] border border-card-border bg-card p-4">
      <div className="flex items-center justify-between text-[12.5px] text-muted-foreground">
        <span>Network</span>
        <span className="font-semibold text-foreground" data-testid="text-network">{/^(main|mainnet|bitcoin)$/i.test(session.network) ? 'Bitcoin Mainnet' : session.network}</span>
      </div>
      <div className="flex items-center justify-between text-[12.5px] text-muted-foreground">
        <span>Session</span>
        <span className="font-semibold text-foreground" data-testid="text-session-expiry">{remaining(session.expiresAt).label}</span>
      </div>
      <Link href="/sandbox" onClick={() => setOpen(false)} data-testid="link-switch-sandbox"
        className="flex w-full items-center justify-center gap-2 rounded-full border border-warn/40 px-3 py-2.5 text-[13px] font-bold text-warn transition-colors hover:bg-warn/10">
        <FlaskConical className="h-4 w-4" /> Switch to Sandbox
      </Link>
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

  const TABS = [NAV[0], NAV[1], NAV[3], NAV[5], NAV[2]];

  return (
    <div className="min-h-[100dvh] pb-28 md:pb-0 md:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-sidebar p-5 md:flex">
        <Brand />
        <div className="mt-3"><NetworkBadge network={session.network} /></div>
        <div className="mt-7 flex-1">{nav}</div>
        {footer}
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 bg-background/85 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-md md:hidden">
        <button onClick={() => setOpen(true)} aria-label="Open menu" data-testid="button-mobile-menu" className="circle-btn h-12 w-12"><Menu className="h-5 w-5" /></button>
        <Link href="/" className="flex items-center gap-2 rounded-full border border-border bg-card py-1.5 pl-1.5 pr-3.5" data-testid="link-brand-mobile">
          <img src={BRAND_MARK} alt="" className="h-7 w-7" />
          <span className="font-display text-[15px] font-bold">main_vault</span>
        </Link>
        <button onClick={doLock} disabled={lock.isPending} aria-label={lock.isPending ? 'Logging out' : 'Logout'} data-testid="button-lock-mobile" className="circle-btn h-12 w-12 disabled:opacity-50"><Lock className="h-5 w-5" /></button>
      </header>

      <nav aria-label="Primary" className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 grid grid-cols-5 gap-1 rounded-[24px] border border-card-border bg-card/95 p-1.5 shadow-[0_18px_40px_-12px_hsl(220_16%_2%/0.9)] backdrop-blur-xl md:hidden">
        {TABS.map((n) => (
          <Link key={n.href} href={n.href} data-testid={`tab-nav-${n.label.toLowerCase()}`} aria-current={isActive(n.href) ? 'page' : undefined}
            className={cn('flex flex-col items-center gap-1 rounded-[24px] py-2 text-[11px] font-semibold transition-colors', isActive(n.href) ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground')}>
            <n.icon className="h-[22px] w-[22px]" />{n.label}
          </Link>
        ))}
      </nav>
      <Sheet open={open} onOpenChange={setOpen} title="Menu" description={<NetworkBadge network={session.network} />} testId="sheet-menu">
        <div className="mt-4">{nav}</div>
        <div className="mt-4">{footer}</div>
      </Sheet>

      <main className="mx-auto max-w-[1200px] px-4 py-3 md:px-10 md:py-10">{children}</main>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5" data-testid="link-brand">
      <img src={BRAND_MARK} alt="" className="h-9 w-9" />
      <div className="leading-none">
        <div className="font-display text-[17px] font-bold">main_vault</div>
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

import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowLeft, ArrowUpRight, Home, Menu, Wallet as WalletIcon, History, Activity, Radio } from 'lucide-react';
import { BRAND_MARK } from '@/lib/assets';
import { useSession, remaining } from '@/lib/vault';
import { Sheet } from '@/components/sheet';
import { cn } from '@/lib/utils';

const SNAV = [
  { href: '/sandbox', label: 'Home', icon: Home },
  { href: '/sandbox/wallet', label: 'Wallet', icon: WalletIcon },
  { href: '/sandbox/activity', label: 'Activity', icon: History },
  { href: '/sandbox/send', label: 'Send', icon: ArrowUpRight },
  { href: '/sandbox/status', label: 'Status', icon: Activity },
  { href: '/sandbox/signet', label: 'Signet', icon: Radio },
];
const TABS = [SNAV[0], SNAV[1], SNAV[3], SNAV[2], SNAV[4]];

function SandboxChip({ testId }: { testId?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-cold/30 bg-cold/10 px-2.5 py-1 text-[11.5px] font-semibold text-cold" data-testid={testId}>
      <span className="h-1.5 w-1.5 rounded-full bg-cold" /> Sandbox
    </span>
  );
}

export function SandboxShell({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  const [open, setOpen] = useState(false);
  const session = useSession();
  useEffect(() => {
    const cur = [...SNAV].reverse().find((n) => loc === n.href || loc.startsWith(n.href + '/'));
    document.title = `Sandbox ${cur && cur.href !== '/sandbox' ? cur.label : loc.startsWith('/sandbox/receipt') ? 'Receipt' : 'Home'} · main_vault`;
  }, [loc]);
  const active = (h: string) => (h === '/sandbox' ? loc === '/sandbox' : loc.startsWith(h));

  const nav = (
    <nav aria-label="Sandbox" className="flex flex-col gap-1">
      {SNAV.map((n) => (
        <Link key={n.href} href={n.href} onClick={() => setOpen(false)} aria-current={active(n.href) ? 'page' : undefined} data-testid={`link-sandbox-${n.label.toLowerCase()}`}
          className={cn('flex items-center gap-3 rounded-[14px] px-3.5 py-2.5 text-[14px] font-medium transition-colors', active(n.href) ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
          <n.icon className="h-[18px] w-[18px]" />{n.label}
        </Link>
      ))}
    </nav>
  );

  const footer = (
    <div className="space-y-3 rounded-[20px] border border-card-border bg-card p-4">
      <div className="flex items-center justify-between text-[12.5px] text-muted-foreground"><span>Mode</span><span className="font-semibold text-foreground">Sandbox</span></div>
      <div className="flex items-center justify-between text-[12.5px] text-muted-foreground"><span>Session</span><span className="font-semibold text-foreground" data-testid="text-sandbox-session">{remaining(session.expiresAt).label}</span></div>
      <Link href="/" onClick={() => setOpen(false)} data-testid="link-return-live"
        className="flex w-full items-center justify-center gap-2 rounded-full bg-card px-3 py-2.5 text-[13px] font-bold shadow-sm ring-1 ring-border transition-colors hover:bg-muted">
        <ArrowLeft className="h-4 w-4" /> Return to Live
      </Link>
    </div>
  );

  return (
    <div className="min-h-[100dvh] pb-28 md:pb-0 md:pl-64">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-sidebar p-5 md:flex">
        <Link href="/sandbox" className="flex items-center gap-2.5" data-testid="link-sandbox-brand">
          <img src={BRAND_MARK} alt="" className="h-9 w-9" />
          <div className="leading-none"><div className="font-display text-[17px] font-bold">main_vault</div><div className="mt-0.5 text-[11px] text-muted-foreground">Personal Bitcoin vault</div></div>
        </Link>
        <div className="mt-3"><SandboxChip testId="banner-sandbox" /></div>
        <div className="mt-7 flex-1">{nav}</div>
        {footer}
      </aside>

      <header className="no-print sticky top-0 z-30 bg-background/85 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-md md:hidden">
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => setOpen(true)} aria-label="Open menu" data-testid="button-sandbox-menu" className="circle-btn h-12 w-12"><Menu className="h-5 w-5" /></button>
          <Link href="/sandbox" className="flex items-center gap-2 rounded-full border border-border bg-card py-1.5 pl-1.5 pr-3.5" data-testid="link-sandbox-brand-mobile">
            <img src={BRAND_MARK} alt="" className="h-7 w-7" /><span className="font-display text-[15px] font-bold">main_vault</span>
          </Link>
          <Link href="/" aria-label="Return to Live" data-testid="link-return-live-mobile" className="circle-btn h-12 w-12"><ArrowLeft className="h-5 w-5" /></Link>
        </div>
        <div className="mt-2 flex justify-center"><SandboxChip testId="banner-sandbox-mobile" /></div>
      </header>

      <nav aria-label="Sandbox tabs" className="no-print fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 grid grid-cols-5 gap-1 rounded-[24px] border border-card-border bg-card/95 p-1.5 shadow-[0_18px_40px_-12px_hsl(220_16%_2%/0.9)] backdrop-blur-xl md:hidden">
        {TABS.map((n) => (
          <Link key={n.href} href={n.href} aria-current={active(n.href) ? 'page' : undefined} data-testid={`tab-sandbox-${n.label.toLowerCase()}`}
            className={cn('flex flex-col items-center gap-1 rounded-[24px] py-2 text-[11px] font-semibold transition-colors', active(n.href) ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground')}>
            <n.icon className="h-[22px] w-[22px]" />{n.label}
          </Link>
        ))}
      </nav>
      <Sheet open={open} onOpenChange={setOpen} title="Menu" description={<SandboxChip />} testId="sheet-sandbox-menu">
        <div className="mt-4">{nav}</div>
        <div className="mt-4">{footer}</div>
      </Sheet>

      <main className="mx-auto max-w-[1200px] px-4 py-3 md:px-10 md:py-10">{children}</main>
    </div>
  );
}

import { useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowLeft, Home, Send, Wallet as WalletIcon, History, Activity, Radio } from 'lucide-react';
import { BRAND_MARK } from '@/lib/assets';
import { useSession, remaining } from '@/lib/vault';
import { cn } from '@/lib/utils';

const SNAV = [
  { href: '/sandbox', label: 'Home', icon: Home },
  { href: '/sandbox/wallet', label: 'Wallet', icon: WalletIcon },
  { href: '/sandbox/send', label: 'Send', icon: Send },
  { href: '/sandbox/activity', label: 'Activity', icon: History },
  { href: '/sandbox/status', label: 'Status', icon: Activity },
];

export function SandboxShell({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  const session = useSession();
  useEffect(() => {
    const cur = [...SNAV, { href: '/sandbox/signet', label: 'Signet' }].reverse().find((n) => loc === n.href || loc.startsWith(n.href + '/'));
    document.title = `Sandbox ${cur && cur.href !== '/sandbox' ? cur.label : loc.startsWith('/sandbox/receipt') ? 'Receipt' : 'Home'} · main_vault`;
  }, [loc]);
  const active = (h: string) => (h === '/sandbox' ? loc === '/sandbox' : loc.startsWith(h));
  return (
    <div className="min-h-[100dvh] pb-28 md:pb-10">
      <div className="sandbox-band no-print sticky top-0 z-40 px-4 py-1.5 text-center text-[12px] font-bold tracking-wide" data-testid="banner-sandbox">SANDBOX · TEST VALUES, NO REAL VALUE</div>
      <header className="no-print mx-auto flex max-w-[1100px] items-center justify-between gap-3 px-4 pt-4 md:px-10">
        <Link href="/sandbox" className="flex items-center gap-2.5" data-testid="link-sandbox-brand">
          <img src={BRAND_MARK} alt="" className="h-8 w-8" />
          <span className="font-display text-[17px] font-bold">main_vault</span>
        </Link>
        <Link href="/" className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-[13.5px] font-bold hover:bg-muted" data-testid="link-return-live">
          <ArrowLeft className="h-4 w-4" /> Return to Live
        </Link>
      </header>
      <div className="no-print mx-auto mt-2 flex max-w-[1100px] flex-wrap items-center justify-between gap-2 px-4 text-[12px] md:px-10">
        <span className="font-semibold text-warn">Sandbox workspace · simulation ledger</span>
        <span className="text-muted-foreground" data-testid="text-sandbox-session">Session {remaining(session.expiresAt).label}</span>
      </div>
      <nav aria-label="Sandbox" className="no-print mx-auto mt-4 hidden max-w-[1100px] gap-1 px-10 md:flex">
        {[...SNAV, { href: '/sandbox/signet', label: 'Signet', icon: Radio }].map((n) => (
          <Link key={n.href} href={n.href} aria-current={active(n.href) ? 'page' : undefined} data-testid={`link-sandbox-${n.label.toLowerCase()}`}
            className={cn('flex items-center gap-2 rounded-full px-4 py-2 text-[14px] font-semibold', active(n.href) ? 'bg-warn/15 text-warn' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
            <n.icon className="h-4 w-4" /> {n.label}
          </Link>
        ))}
      </nav>
      <main className="mx-auto max-w-[1100px] px-4 py-5 md:px-10">{children}</main>
      <nav aria-label="Sandbox tabs" className="no-print fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 grid grid-cols-5 gap-1 rounded-[30px] border border-warn/30 bg-card/90 p-1.5 backdrop-blur-xl md:hidden">
        {SNAV.map((n) => (
          <Link key={n.href} href={n.href} aria-current={active(n.href) ? 'page' : undefined} data-testid={`tab-sandbox-${n.label.toLowerCase()}`}
            className={cn('flex flex-col items-center gap-1 rounded-[24px] py-2 text-[11px] font-semibold', active(n.href) ? 'bg-warn/15 text-warn' : 'text-muted-foreground')}>
            <n.icon className="h-5 w-5" />{n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

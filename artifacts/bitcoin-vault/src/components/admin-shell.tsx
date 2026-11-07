import type { ReactNode } from 'react';
import { ArrowUpRight, FileClock, LayoutGrid, LogOut, ScrollText, Users } from 'lucide-react';
import { VaultMark } from '@/components/shell';
import { OWNER_BASE } from '@/lib/owner-location';

export type AdminSection = 'overview' | 'accounts' | 'applications' | 'audit';
export const ADMIN_SECTIONS: { id: AdminSection; label: string; icon: typeof Users }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'accounts', label: 'Accounts', icon: Users },
  { id: 'applications', label: 'Applications', icon: ScrollText },
  { id: 'audit', label: 'Audit', icon: FileClock },
];

const PERSONAL_HREF = `${import.meta.env.BASE_URL.replace(/\/$/, '')}${OWNER_BASE}`;

export function AdminShell({ section, onSection, onLogout, status, children }: {
  section: AdminSection; onSection: (s: AdminSection) => void; onLogout: () => void; status: ReactNode; children: ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto grid min-h-[100dvh] max-w-[1440px] grid-cols-1 lg:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="sticky top-0 z-30 min-w-0 border-b border-sidebar-border bg-sidebar/95 backdrop-blur lg:h-[100dvh] lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-3 px-4 py-3 lg:flex-col lg:items-stretch lg:gap-6 lg:px-5 lg:py-6">
            <div className="flex min-w-0 items-center gap-2.5">
              <VaultMark className="h-8 w-8 shrink-0" />
              <div className="min-w-0 leading-tight">
                <div className="truncate font-display text-[15px] font-semibold">MainVaultWallet</div>
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">platform admin</div>
              </div>
            </div>
            <div className="flex items-center gap-2 lg:hidden">{status}</div>
          </div>
          <nav aria-label="Admin sections" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:px-3">
            {ADMIN_SECTIONS.map(({ id, label, icon: Icon }) => {
              const on = id === section;
              return (
                <button key={id} type="button" onClick={() => onSection(id)} aria-current={on ? 'page' : undefined} data-testid={`nav-admin-${id}`}
                  className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors motion-reduce:transition-none ${on ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_2px_0_0_hsl(var(--accent))]' : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'}`}>
                  <Icon className="h-4 w-4" />{label}
                </button>
              );
            })}
          </nav>
          <div className="hidden space-y-1 border-t border-sidebar-border px-3 py-4 lg:absolute lg:inset-x-0 lg:bottom-0 lg:block">
            <a href={PERSONAL_HREF} className="flex items-center justify-between rounded-lg px-3 py-2 text-[13px] text-sidebar-foreground/75 hover:bg-sidebar-accent/60" data-testid="link-personal-vault">Personal vault <ArrowUpRight className="h-3.5 w-3.5" /></a>
            <button type="button" onClick={onLogout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] text-sidebar-foreground/75 hover:bg-sidebar-accent/60" data-testid="button-admin-logout"><LogOut className="h-3.5 w-3.5" /> Lock and sign out</button>
          </div>
        </aside>
        <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
          <div className="mb-4 flex flex-wrap items-center justify-end gap-2 lg:hidden">
            <a href={PERSONAL_HREF} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[12.5px]" data-testid="link-personal-vault-mobile">Personal vault <ArrowUpRight className="h-3 w-3" /></a>
            <button type="button" onClick={onLogout} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[12.5px]" data-testid="button-admin-logout-mobile"><LogOut className="h-3 w-3" /> Lock</button>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

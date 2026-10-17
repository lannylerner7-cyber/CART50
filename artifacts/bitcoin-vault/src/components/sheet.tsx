import type { ReactNode } from 'react';
import * as D from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';

/** Accessible bottom sheet (Radix Dialog: focus trap, Escape, overlay click). Centers as a card on wider screens. */
export function Sheet({ open, onOpenChange, title, description, hideHeader, children, className, testId }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: ReactNode; hideHeader?: boolean; children: ReactNode; className?: string; testId?: string;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-[hsl(228_20%_2%/0.72)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <D.Content data-testid={testId}
          className={cn('fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[30px] border border-b-0 border-border bg-[hsl(var(--sheet))] px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl outline-none sm:bottom-6 sm:rounded-[30px] sm:border-b',
            'data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom duration-300', className)}>
          <div className="mx-auto mb-4 h-1.5 w-11 rounded-full bg-muted-foreground/40" aria-hidden />
          <D.Title className={hideHeader ? 'sr-only' : 'font-display text-[21px] font-bold'}>{title}</D.Title>
          {description ? <D.Description className={hideHeader ? 'sr-only' : 'mt-1 text-sm text-muted-foreground'}>{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export function SheetAction({ icon, label, sub, onClick, disabled, testId }: { icon: ReactNode; label: string; sub?: ReactNode; onClick?: () => void; disabled?: boolean; testId?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} data-testid={testId}
      className="flex w-full items-start gap-4 rounded-2xl px-2 py-3.5 text-left transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-45">
      <span className="mt-0.5 shrink-0 [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      <span className="min-w-0"><span className="block text-[16px] font-medium">{label}</span>{sub && <span className="mt-0.5 block text-xs text-muted-foreground">{sub}</span>}</span>
    </button>
  );
}

export const kindLabel = (k: string) => (k === 'temporary' ? 'Temporary receiving' : k === 'cold' ? 'Watch-only cold' : k === 'reserve' ? 'Main vault, server-held' : 'Spending');

import { useState, type ReactNode } from 'react';
import { AlertTriangle, Download, Printer, ReceiptText } from 'lucide-react';
import { receiptFileName, receiptRows, receiptToText, type ReceiptModel } from '@/lib/receipt-terminal';
import { printText } from '@/lib/print';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { TerminalHousing, useOneShotTimeline, usePrefersReducedMotion } from './terminal';

export function downloadReceipt(m: ReceiptModel) {
  const url = URL.createObjectURL(new Blob([receiptToText(m)], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url; a.download = receiptFileName(m); a.click();
  URL.revokeObjectURL(url);
}

/** Accessible, complete record (always fully rendered; independent of animation). */
export function ReceiptDetails({ m, testPrefix = 'receipt' }: { m: ReceiptModel; testPrefix?: string }) {
  const tone = m.variant === 'order_confirmed' ? 'border-ok/40 bg-ok/10 text-ok' : m.variant === 'payment_failed' ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-warn/40 bg-warn/10 text-warn';
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.14em] ${tone}`} data-testid={`status-${testPrefix}-variant`}>{m.statusText}</span>
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground" data-testid={`text-${testPrefix}-network`}>{m.networkLabel}</span>
      </div>
      {m.notice && <p role="status" className="mt-3 flex gap-2 rounded-xl border border-warn/40 bg-warn/5 p-3 text-[13px]" data-testid={`text-${testPrefix}-notice`}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />{m.notice}</p>}
      <dl className="mt-4 grid gap-2 text-[13px]">
        {receiptRows(m).map((r) => (
          <div key={r.label} className="grid grid-cols-1 gap-0.5 border-b border-dashed border-border/70 pb-2 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-3">
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className={`min-w-0 break-all ${r.mono ? 'font-mono text-[12.5px]' : 'font-medium'}`} data-testid={`text-${testPrefix}-${r.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '')}`}>{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Terminal visual + details + actions. Use on full pages / panels, not in table cells. */
export function ReceiptTerminal({ m, actions, testId = 'card-receipt-terminal', testPrefix = 'receipt', printTestId, downloadTestId, intro }: {
  m: ReceiptModel; actions?: ReactNode; testId?: string; testPrefix?: string; printTestId?: string; downloadTestId?: string; intro?: ReactNode;
}) {
  const reduced = usePrefersReducedMotion();
  const t = useOneShotTimeline(m.variant === 'order_confirmed', reduced);
  const [printErr, setPrintErr] = useState(false);
  return (
    <section className="rt-scope rise min-w-0 overflow-hidden rounded-[22px] border border-card-border bg-card" data-testid={testId} aria-label={`${m.title}: ${m.statusText}`}>
      <div className="grid min-w-0 grid-cols-1 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="rt-backdrop rt-noprint rt-fit overflow-hidden px-2 pb-4 pt-6"><div><TerminalHousing m={m} t={t} reduced={reduced} /></div></div>
        <div className="min-w-0 p-5 md:p-6">
          <div className="flex items-center gap-2 font-mono text-[11.5px] uppercase tracking-[0.18em] text-muted-foreground"><ReceiptText className="h-4 w-4" />{m.title}</div>
          {intro && <div className="mt-2 text-[13px] text-muted-foreground">{intro}</div>}
          <div className="mt-3"><ReceiptDetails m={m} testPrefix={testPrefix} /></div>
          <div className="rt-noprint mt-5 flex flex-wrap gap-2">
            <button type="button" className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground" onClick={() => downloadReceipt(m)} data-testid={downloadTestId ?? `button-download-${testPrefix}`}><Download className="h-4 w-4" /> Download receipt</button>
            <button type="button" className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold" onClick={() => setPrintErr(!printText(m.title, receiptToText(m)))} data-testid={printTestId ?? `button-print-${testPrefix}`}><Printer className="h-4 w-4" /> Print receipt</button>
            {actions}
          </div>
          {printErr && <p role="alert" className="mt-2 text-xs text-destructive">The print window was blocked by the browser. Use Download instead.</p>}
        </div>
      </div>
    </section>
  );
}

/** Accessible modal (focus trap + Escape via Radix) wrapping the terminal. */
export function ReceiptTerminalDialog({ m, open, onOpenChange, testPrefix = 'receipt', trigger }: { m: ReceiptModel; open: boolean; onOpenChange: (o: boolean) => void; testPrefix?: string; trigger?: ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-[1000px] overflow-y-auto overflow-x-hidden rounded-[22px] p-0 sm:rounded-[22px]" data-testid={`dialog-${testPrefix}`}>
        <DialogTitle className="sr-only">{m.title}</DialogTitle>
        <DialogDescription className="sr-only">{m.statusText}. {m.orderReferenceLabel} {m.orderReference}.</DialogDescription>
        {open && <ReceiptTerminal m={m} testPrefix={testPrefix} testId={`card-${testPrefix}-terminal`} actions={<button type="button" className="inline-flex h-10 items-center rounded-full border border-border px-4 text-sm font-semibold" onClick={() => onOpenChange(false)} data-testid={`button-close-${testPrefix}`}>Close</button>} />}
      </DialogContent>
    </Dialog>
  );
}

/** Small trigger + dialog, safe to place in table cells or list detail. */
export function ReceiptButton({ m, label = 'Receipt', className, testPrefix = 'receipt', testId }: { m: ReceiptModel; label?: string; className?: string; testPrefix?: string; testId?: string }) {
  const [open, setOpen] = useState(false);
  return <ReceiptTerminalDialog m={m} open={open} onOpenChange={setOpen} testPrefix={testPrefix} trigger={
    <button type="button" className={className ?? 'inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold'} data-testid={testId ?? `button-open-${testPrefix}`}><ReceiptText className="h-3.5 w-3.5" />{label}</button>
  } />;
}

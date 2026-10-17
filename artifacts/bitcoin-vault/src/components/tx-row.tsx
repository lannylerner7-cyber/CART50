import { useState, type ReactNode } from 'react';
import { ArrowDownLeft, ArrowUpRight, ChevronDown } from 'lucide-react';
import type { Transaction } from '@workspace/api-client-react';
import { Btc } from '@/components/kit';
import { cn } from '@/lib/utils';

export const isIncoming = (d: string) => /^in/i.test(d) || /receiv/i.test(d);
export const txStatusLabel = (s: string) => (s === 'confirmed' ? 'Complete' : s === 'confirming' ? 'Processing' : s === 'pending' ? 'Unconfirmed' : s);
const day = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? 'Unknown date' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };

/** Ledger row styled after a mobile activity list. Optional detail expands in place. */
export function TxRow({ t, detail, testKey }: { t: Transaction; detail?: ReactNode; testKey?: string }) {
  const [open, setOpen] = useState(false);
  const inc = isIncoming(t.direction);
  const replaced = !!t.replacedBy || t.confirmations < 0;
  const head = (
    <>
      <span className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-full', inc ? 'bg-ok/15 text-ok' : 'bg-primary/15 text-primary')}>
        {inc ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[16px] font-medium">{inc ? 'Received bitcoin' : 'Sent bitcoin'}</span>
        <span className="block text-[13px] text-muted-foreground">{day(t.firstSeen)}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className={cn('block text-[15px] font-semibold', replaced ? 'text-muted-foreground line-through' : inc ? 'text-ok' : 'text-foreground')}>{inc ? '+' : '−'}<Btc sats={t.amountSats} size="sm" className="text-[14px]" /></span>
        <span className="block text-[12.5px] capitalize text-muted-foreground">{replaced ? 'Replaced' : txStatusLabel(t.status)} · {t.confirmations < 0 ? 'conflicted' : `${Math.min(t.confirmations, 3)}/3 conf`}</span>
      </span>
    </>
  );
  if (!detail) return <li className="flex items-center gap-4 py-3" data-testid={`row-tx-${testKey ?? t.txid}`}>{head}</li>;
  return (
    <li data-testid={`row-tx-${testKey ?? t.txid}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-4 rounded-2xl px-2 py-3 hover:bg-card">
        {head}
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="rise mb-2 rounded-[20px] bg-card p-4">{detail}</div>}
    </li>
  );
}

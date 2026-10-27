import { useState } from 'react';
import { Eye, Loader2, Printer, Search } from 'lucide-react';
import { useGetRecipient, getGetRecipientQueryKey, type RecipientObservation } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { ErrorPanel, Pill } from '@/components/kit';
import { satsToBtc, stamp, short } from '@/lib/vault';
import { printText } from '@/lib/print';

const signedBtc = (s: string) => (s.startsWith('-') ? `-${satsToBtc(s.slice(1))}` : satsToBtc(s));
const fmtTime = (t: number | null) => (t == null ? 'unconfirmed' : stamp(new Date(t * 1000).toISOString()));

function observationText(o: RecipientObservation) {
  return [
    'main_vault RECIPIENT OBSERVATION (NOT A PAYMENT RECEIPT)',
    `Observed: ${stamp(o.observedAt)}`, `Provider: ${o.provider} (public third-party indexer)`, `Network: ${o.network}`, `Address: ${o.address}`,
    `Confirmed balance: ${signedBtc(o.confirmedSats)} BTC (${o.confirmedSats} sats)`, `Unconfirmed change: ${signedBtc(o.unconfirmedSats)} BTC (${o.unconfirmedSats} sats)`,
    `Transactions: ${o.transactionCount}${o.historyLimited ? ' (history limited; only recent entries listed)' : ''}`, '',
    ...o.transactions.map((t) => `${t.txid}  ${t.confirmed ? 'confirmed' : 'pending'}  ${signedBtc(t.netSats)} BTC  ${fmtTime(t.blockTime)}`), '',
    'Advisory only. This does not prove who owns the address, that it is safe to pay, or anything about your own spendable balance.',
  ].join('\n');
}

/** Advisory, explicit-only lookup of the current destination on a public indexer. Results are bound to the exact address checked. */
export function RecipientCheck({ address, mainnet }: { address: string; mainnet: boolean }) {
  const trimmed = address.trim();
  const current = trimmed.startsWith('BC1') && trimmed === trimmed.toUpperCase() ? trimmed.toLowerCase() : trimmed;
  const [checked, setChecked] = useState('');
  const [printErr, setPrintErr] = useState(false);
  const params = { address: checked };
  const q = useGetRecipient(params, { query: { queryKey: getGetRecipientQueryKey(params), enabled: !!checked, retry: false, staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false, refetchOnMount: false } });
  const matches = !!checked && checked === current;
  const data = mainnet && matches && q.data && q.data.address === current && !q.isFetching && !q.isError ? q.data : null;
  const canCheck = mainnet && current.length >= 14 && current.length <= 90 && !q.isFetching;

  const run = () => { setPrintErr(false); if (checked === current) q.refetch(); else setChecked(current); };

  return (
    <div className="min-w-0 rounded-2xl border border-dashed border-border p-3.5" data-testid="panel-recipient-check">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold"><Eye className="h-4 w-4 text-muted-foreground" />Recipient lookup <Pill tone="neutral">advisory</Pill></div>
        <Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-full" disabled={!canCheck} onClick={run} data-testid="button-check-address">
          {q.isFetching && matches ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}{q.isFetching && matches ? 'Checking' : 'Check address'}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground" data-testid="text-recipient-privacy">
        {mainnet ? 'Checking sends this address through our server to mempool.space, a public indexer that can log the address and our server’s IP. Nothing is sent until you press Check.' : 'Lookup is available for mainnet addresses only.'} The result does not prove who owns the address or that it is safe to pay, and it says nothing about your own spendable balance.
      </p>
      {matches && q.isError && !q.isFetching && <div className="mt-3"><ErrorPanel error={q.error} onRetry={run} title={`Lookup failed for ${short(current, 8)}`} /></div>}
      {data && (
        <div className="rise mt-3 space-y-3" data-testid="result-recipient">
          <div className="font-mono text-[11px] text-muted-foreground">observed {stamp(data.observedAt)} · {data.provider} · {data.network}</div>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
            <div className="min-w-0"><div className="text-[11px] uppercase tracking-wider text-muted-foreground">confirmed</div><div className="font-mono text-sm" data-testid="text-recipient-confirmed">{signedBtc(data.confirmedSats)} BTC</div></div>
            <div className="min-w-0"><div className="text-[11px] uppercase tracking-wider text-muted-foreground">unconfirmed</div><div className="font-mono text-sm" data-testid="text-recipient-unconfirmed">{signedBtc(data.unconfirmedSats)} BTC</div></div>
            <div className="min-w-0"><div className="text-[11px] uppercase tracking-wider text-muted-foreground">transactions</div><div className="font-mono text-sm" data-testid="text-recipient-count">{data.transactionCount}</div></div>
          </div>
          {data.transactionCount === 0 ? <p className="text-xs text-muted-foreground">No history seen by the indexer. A fresh address is normal and is not a warning sign by itself.</p> : (
            <ul className="divide-y divide-border rounded-xl border border-border text-xs">
              {data.transactions.map((t) => (
                <li key={t.txid} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2" data-testid={`row-recipient-tx-${t.txid}`}>
                  <span className="min-w-0 break-all font-mono">{short(t.txid, 8)}</span>
                  <span className="font-mono">{signedBtc(t.netSats)} BTC</span>
                  <Pill tone={t.confirmed ? 'ok' : 'warn'}>{t.confirmed ? fmtTime(t.blockTime) : 'pending'}</Pill>
                </li>
              ))}
            </ul>
          )}
          {data.historyLimited && <p className="text-xs text-warn">History limited: only the most recent transactions are listed.</p>}
          <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => setPrintErr(!printText('Recipient observation', observationText(data)))} data-testid="button-print-observation"><Printer className="h-3.5 w-3.5" />Print observation (not a receipt)</Button>
          {printErr && <p className="text-xs text-destructive">The print window was blocked by the browser.</p>}
        </div>
      )}
    </div>
  );
}

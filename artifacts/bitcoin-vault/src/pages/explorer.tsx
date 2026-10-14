import { useState } from 'react';
import { Link } from 'wouter';
import { ScanSearch, Search } from 'lucide-react';
import { useExploreVault, getExploreVaultQueryKey } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Btc, CopyText, Empty, ErrorPanel, PageHeader, Panel, Pill, SkelRows, Stat, statusTone } from '@/components/kit';
import { stamp } from '@/lib/vault';

export default function Explorer() {
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const params = { query };
  const q = useExploreVault(params, { query: { enabled: query.length > 0, queryKey: getExploreVaultQueryKey(params) } });
  const r = q.data;

  return (
    <div className="space-y-6">
      <PageHeader kicker="Own node" title="Explorer" desc="Look up an address or txid against your node only. No third-party explorer sees the query." />
      <form onSubmit={(e) => { e.preventDefault(); setQuery(draft.trim()); }} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="address or 64-char txid" className="h-12 bg-card pl-10 font-mono" spellCheck={false} data-testid="input-explore" />
        </div>
        <Button type="submit" className="h-12 px-6" disabled={!draft.trim()} data-testid="button-explore">Look up</Button>
      </form>

      {!query && <Empty icon={<ScanSearch className="h-5 w-5" />} title="Nothing queried" body="Paste an address or transaction id. Results come straight from your node's index." />}
      {q.isLoading && <SkelRows rows={4} />}
      {q.isError && <ErrorPanel error={q.error} onRetry={() => q.refetch()} title="Lookup failed" />}
      {r && (
        <Panel title={`result · ${r.kind}`} meta={<Pill tone={r.found ? 'ok' : 'neutral'}>{r.found ? 'found' : 'not found'}</Pill>}>
          <p className="text-sm" data-testid="text-explore-message">{r.message}</p>
          {r.transaction && (
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Stat label="txid"><CopyText value={r.transaction.txid} /></Stat>
              <Stat label="amount"><Btc sats={r.transaction.amountSats} /></Stat>
              <Stat label="status"><Pill tone={statusTone(r.transaction.status)}>{r.transaction.status} · {r.transaction.confirmations} conf</Pill></Stat>
              <Stat label="first seen"><span className="font-mono text-xs">{stamp(r.transaction.firstSeen)}</span></Stat>
              <Stat label="wallet"><Link href={`/wallets/${r.transaction.walletId}`} className="font-mono text-xs hover:text-primary" data-testid="link-explore-tx-wallet">{r.transaction.walletId}</Link></Stat>
            </div>
          )}
          {r.wallet && (
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Stat label="wallet"><Link href={`/wallets/${r.wallet.id}`} className="font-medium hover:text-primary" data-testid="link-explore-wallet">{r.wallet.label}</Link></Stat>
              <Stat label="confirmed"><Btc sats={r.wallet.confirmedSats} /></Stat>
              <Stat label="status"><Pill tone={statusTone(r.wallet.status)}>{r.wallet.status}</Pill></Stat>
            </div>
          )}
          {Object.keys(r.details).length > 0 && (
            <dl className="mt-5 divide-y divide-border rounded-sm border border-border">
              {Object.entries(r.details).map(([k, v]) => (
                <div key={k} className="grid grid-cols-[160px_1fr] gap-3 px-3 py-2 text-xs">
                  <dt className="font-mono uppercase tracking-wider text-muted-foreground">{k}</dt>
                  <dd className="break-all font-mono">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
                </div>
              ))}
            </dl>
          )}
        </Panel>
      )}
    </div>
  );
}

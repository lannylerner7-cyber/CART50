import { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, Boxes, Plus } from 'lucide-react';
import { ReceiveDialog, receiveBlock, useOnline, type Freshness } from '@/components/receive';
import { useListWallets, useCreateWallets, useGetVaultDashboard, getListWalletsQueryKey, getGetVaultDashboardQueryKey, type Wallet } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DataTable, type Column } from '@/components/data-table';
import { Btc, CopyText, Empty, ErrorPanel, PageHeader, Pill, SkelRows, statusTone } from '@/components/kit';
import { POLL_MS, ago, remaining, short, stamp, toBig, useCsrf } from '@/lib/vault';
import { useToast } from '@/hooks/use-toast';

export default function Wallets() {
  const [, nav] = useLocation();
  const q = useListWallets({ query: { queryKey: getListWalletsQueryKey(), refetchInterval: POLL_MS } });
  const [kind, setKind] = useState('all');
  const [status, setStatus] = useState('all');
  const [open, setOpen] = useState(false);

  const rows = useMemo(() => (q.data ?? []).filter((w) => (kind === 'all' || w.kind === kind) && (status === 'all' || w.status === status)), [q.data, kind, status]);
  const statuses = useMemo(() => Array.from(new Set((q.data ?? []).map((w) => w.status))), [q.data]);

  const dash = useGetVaultDashboard({ query: { queryKey: getGetVaultDashboardQueryKey(), refetchInterval: POLL_MS } });
  const online = useOnline();
  const [recvId, setRecvId] = useState<string | null>(null);
  const fresh: Freshness = { nodeConnected: dash.isError ? false : dash.data?.node.connected, dataUpdatedAt: Math.min(q.dataUpdatedAt, dash.dataUpdatedAt || 0), isError: q.isError || dash.isError };
  const recvWallet = (q.data ?? []).find((w) => w.id === recvId) ?? null;

  const cols: Column<Wallet>[] = [
    { key: 'receive', label: '', render: (w) => { const why = receiveBlock(w, fresh, online); return <button disabled={!!why} title={why ?? 'Receive'} onClick={(e) => { e.stopPropagation(); setRecvId(w.id); }} className="inline-flex items-center gap-1 rounded-full bg-foreground px-3 py-1 text-xs font-bold text-background disabled:opacity-30" data-testid={`button-receive-${w.id}`}><ArrowDownToLine className="h-3 w-3" />Receive</button>; } },
    { key: 'label', label: 'Label', render: (w) => <span className="font-medium">{w.label}</span>, sort: (w) => w.label.toLowerCase() },
    { key: 'kind', label: 'Kind', render: (w) => <Pill tone={w.kind === 'cold' ? 'cold' : w.kind === 'spending' ? 'ember' : 'neutral'}>{w.kind}</Pill>, sort: (w) => w.kind },
    { key: 'address', label: 'Address', render: (w) => (w.status === 'expired' ? <span className="text-muted-foreground">Expired · do not receive</span> : w.address ? <CopyText value={w.address} display={short(w.address, 8)} /> : <span className="text-muted-foreground">—</span>) },
    { key: 'status', label: 'Status', render: (w) => <Pill tone={statusTone(w.status)}>{w.status}</Pill>, sort: (w) => w.status },
    { key: 'destruction', label: 'Destruction', render: (w) => <Pill tone={statusTone(w.destructionStatus)}>{w.destructionStatus}</Pill>, sort: (w) => w.destructionStatus, hidden: true },
    { key: 'expires', label: 'Expires in', render: (w) => { const r = remaining(w.expiresAt); return <span className={`font-mono text-xs ${r.ms <= 0 ? 'text-muted-foreground' : r.ms < 12 * 3600000 ? 'text-warn' : ''}`}>{r.label}</span>; }, sort: (w) => (w.expiresAt ? new Date(w.expiresAt).getTime() : Number.MAX_SAFE_INTEGER) },
    { key: 'confirmed', label: 'Confirmed', align: 'right', render: (w) => <Btc sats={w.confirmedSats} size="sm" />, sort: (w) => toBig(w.confirmedSats) },
    { key: 'unconfirmed', label: 'Pending', align: 'right', render: (w) => <Btc sats={w.unconfirmedSats} size="sm" className="text-warn" />, sort: (w) => toBig(w.unconfirmedSats), hidden: true },
    { key: 'received', label: 'Received', align: 'right', render: (w) => <Btc sats={w.totalReceivedSats} size="sm" />, sort: (w) => toBig(w.totalReceivedSats), hidden: true },
    { key: 'swept', label: 'Swept', align: 'right', render: (w) => <Btc sats={w.totalSweptSats} size="sm" />, sort: (w) => toBig(w.totalSweptSats), hidden: true },
    { key: 'created', label: 'Created', render: (w) => <span className="font-mono text-xs text-muted-foreground">{stamp(w.createdAt)}</span>, sort: (w) => w.createdAt },
    { key: 'sync', label: 'Last sync', render: (w) => <span className="text-xs text-muted-foreground">{ago(w.lastSync)}</span>, sort: (w) => w.lastSync ?? '', hidden: true },
  ];

  const sel = 'h-9 rounded-md border border-input bg-card px-2 font-mono text-[11px] uppercase';

  return (
    <div className="space-y-6">
      <PageHeader kicker="Wallets" title="Wallets" desc="Your main vault, spending wallet and temporary receiving wallets. Server-held wallets are online custody. Temporary wallets expire after 120 hours."
        actions={<Button onClick={() => setOpen(true)} className="gap-1.5 rounded-full px-5 font-bold" data-testid="button-open-create"><Plus className="h-4 w-4" /> Batch create</Button>} />
      {q.isError && <ErrorPanel error={q.error} onRetry={() => q.refetch()} />}
      {q.isLoading ? <SkelRows rows={10} /> : q.data && (
        <DataTable testId="wallets" rows={rows} columns={cols} rowKey={(w) => w.id} search={(w) => `${w.label} ${w.address ?? ''} ${w.id} ${w.status}`}
          placeholder="Search label, address, id" initialSort={{ key: 'created', dir: 'desc' }} onRowClick={(w) => nav(`/wallets/${w.id}`)}
          toolbar={<>
            <select className={sel} value={kind} onChange={(e) => setKind(e.target.value)} data-testid="select-kind"><option value="all">all kinds</option><option value="temporary">temporary</option><option value="reserve">main vault (server-held)</option><option value="cold">cold (watch-only)</option><option value="spending">spending</option></select>
            <select className={sel} value={status} onChange={(e) => setStatus(e.target.value)} data-testid="select-status"><option value="all">all status</option>{statuses.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          </>}
          empty={<Empty icon={<Boxes className="h-5 w-5" />} title={q.data.length ? 'No matches' : 'No wallets yet'} body={q.data.length ? 'Adjust search or filters.' : 'Create a batch of receiving wallets to start accepting funds.'}
            action={!q.data.length && <Button size="sm" onClick={() => setOpen(true)} data-testid="button-empty-create">Create wallets</Button>} />} />
      )}
      <CreateDialog open={open} onOpenChange={setOpen} />
      {recvWallet && <ReceiveDialog wallet={recvWallet} freshness={fresh} open={!!recvId} onOpenChange={(o) => !o && setRecvId(null)} />}
    </div>
  );
}

function CreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [label, setLabel] = useState('');
  const [count, setCount] = useState('10');
  const create = useCreateWallets(useCsrf());
  const n = Number(count);
  const valid = label.trim().length >= 1 && label.length <= 64 && Number.isInteger(n) && n >= 1 && n <= 200;

  const submit = () => create.mutate({ data: { label: label.trim(), count: n } }, {
    onSuccess: (ws) => {
      qc.invalidateQueries({ queryKey: getListWalletsQueryKey() });
      qc.invalidateQueries({ queryKey: getGetVaultDashboardQueryKey() });
      toast({ title: `${ws.length} wallets created`, description: 'Each expires in 120 hours.' });
      setLabel(''); setCount('10'); create.reset(); onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Batch create receiving wallets</DialogTitle>
          <DialogDescription>Derived on your node. Up to 200 per batch. Labels get a sequence suffix.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5"><Label>Label</Label><Input value={label} maxLength={64} onChange={(e) => setLabel(e.target.value)} placeholder="invoice-march" data-testid="input-wallet-label" /></div>
          <div className="grid gap-1.5">
            <Label>Count</Label>
            <div className="flex items-center gap-3">
              <input type="range" min={1} max={200} value={Number.isFinite(n) ? n : 1} onChange={(e) => setCount(e.target.value)} className="flex-1 accent-[hsl(var(--primary))]" data-testid="range-count" />
              <Input value={count} onChange={(e) => setCount(e.target.value.replace(/[^0-9]/g, ''))} className="w-20 font-mono" data-testid="input-wallet-count" />
            </div>
          </div>
          {create.isError && <ErrorPanel error={create.error} title="Creation failed" />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-create">Cancel</Button>
          <Button disabled={!valid || create.isPending} onClick={submit} data-testid="button-submit-create">{create.isPending ? 'Deriving' : `Create ${valid ? n : ''}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Pure receipt-terminal model + adapters. No React, no network, no clock reads.
 * Every value shown on a receipt is derived from an authoritative backend record.
 * Missing values are rendered as UNAVAILABLE; nothing is invented.
 */

export const UNAVAILABLE = 'Unavailable';

export type ReceiptVariant =
  | 'order_confirmed'
  | 'awaiting_confirmation'
  | 'transfer_submitted'
  | 'status_unavailable'
  | 'payment_failed';

export type ReceiptSource = 'live' | 'signet' | 'sandbox' | 'foundation' | 'checkout' | 'wallet_tx';

export interface ReceiptLine { label: string; value: string; mono?: boolean }

export interface ReceiptModel {
  source: ReceiptSource;
  variant: ReceiptVariant;
  /** Raw backend status string, unmodified. */
  backendStatus: string;
  /** Short uppercase status for paper/screen. Never "CONFIRMED" unless variant is order_confirmed. */
  statusText: string;
  headline: string;
  subline: string;
  /** e.g. "Bitcoin mainnet", "Signet · no value", "Simulation · no real value". */
  networkLabel: string;
  simulation: boolean;
  /** Merchant order reference, or backend record id. Never generated. */
  orderReference: string;
  orderReferenceLabel: 'Order' | 'Record ID';
  /** Stable recorded time from the record (formatted). */
  recordedAt: string;
  recordedAtLabel: string;
  direction: 'outgoing' | 'incoming' | 'internal' | 'checkout';
  amount: string;
  fee: string;
  /** Gross debit for outgoing; for incoming this is the received amount. */
  total: string;
  totalLabel: string;
  usd: string | null;
  transactionId: string;
  /** Full untruncated Bitcoin address, or UNAVAILABLE. */
  walletAddress: string;
  walletAddressLabel: string;
  /** Present when a non-Bitcoin identifier exists (simulation ledger / internal wallet). */
  nonBitcoinIdentifier: { label: string; value: string } | null;
  confirmations: string;
  extra: ReceiptLine[];
  notice: string | null;
  title: string;
  fileStem: string;
}

const val = (v: unknown): string => {
  if (v === null || v === undefined) return UNAVAILABLE;
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.trim() === '' ? UNAVAILABLE : s;
};
const SATS = 100_000_000n;
/** Integer sats as a decimal string or a *safe* integer number. Unsafe numbers are rejected (never rounded). */
export const isIntStr = (v: unknown): boolean => (typeof v === 'string' && /^-?[0-9]+$/.test(v)) || (typeof v === 'number' && Number.isSafeInteger(v));
/** Parses authoritative sats to BigInt, or null when missing/invalid/unsafe. */
export function satsBig(v: unknown): bigint | null { return isIntStr(v) ? BigInt(v as string | number) : null; }

/** Formats integer sats as "0.00012345 BTC"; returns UNAVAILABLE for missing/non-integer. */
export function btcFromSats(v: unknown, unit = 'BTC'): string {
  const b = satsBig(v);
  if (b === null) return UNAVAILABLE;
  let n = b;
  const neg = n < 0n; if (neg) n = -n;
  return `${neg ? '-' : ''}${n / SATS}.${(n % SATS).toString().padStart(8, '0')} ${unit}`;
}

/** Stable formatting of a recorded ISO timestamp (UTC, so it never drifts by viewer). */
export function formatRecorded(iso: unknown): string {
  if (typeof iso !== 'string' || !iso) return UNAVAILABLE;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return UNAVAILABLE;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`;
}

/**
 * Backend status -> terminal variant. "confirmed"/"complete"/"delivered"/"simulation_paid" are the
 * only success statuses; the threshold is whatever the backend applied. Unknown strings never succeed.
 */
export function variantForStatus(status: unknown, opts: { replaced?: boolean } = {}): ReceiptVariant {
  const s = String(status ?? '').toLowerCase();
  if (opts.replaced) return 'status_unavailable';
  if (['confirmed', 'complete', 'delivered', 'simulation_paid', 'simulation_complete'].includes(s)) return 'order_confirmed';
  if (['confirming', 'pending', 'awaiting_confirmation'].includes(s)) return 'awaiting_confirmation';
  if (['broadcast', 'sending', 'submitted', 'reserved', 'review'].includes(s)) return 'transfer_submitted';
  if (['failed', 'reversed', 'rejected', 'expired', 'cancelled', 'canceled'].includes(s)) return 'payment_failed';
  return 'status_unavailable';
}

const VARIANT_TEXT: Record<ReceiptVariant, { status: string; headline: string; subline: string }> = {
  order_confirmed: { status: 'CONFIRMED', headline: 'Order confirmed', subline: 'Backend reports this record confirmed' },
  awaiting_confirmation: { status: 'AWAITING CONFIRMATION', headline: 'Awaiting confirmation', subline: 'Not confirmed. Do not send a second payment.' },
  transfer_submitted: { status: 'SUBMITTED - NOT CONFIRMED', headline: 'Submitted, awaiting confirmation', subline: 'Not confirmed. Do not send a second payment.' },
  status_unavailable: { status: 'STATUS UNAVAILABLE', headline: 'Status unavailable', subline: 'Outcome unknown. Do not retry or pay again.' },
  payment_failed: { status: 'FAILED - NOT PAID', headline: 'Payment not completed', subline: 'This record did not settle.' },
};

const NOTICE: Record<ReceiptVariant, string | null> = {
  order_confirmed: null,
  awaiting_confirmation: 'Not confirmed. Check Activity for the current status. Do not submit a second payment.',
  transfer_submitted: 'Submitted but not confirmed. Check Activity for the current status. Do not submit a second payment.',
  status_unavailable: 'Status could not be determined from the record. Do not retry or submit a duplicate payment.',
  payment_failed: 'This record did not complete.',
};

function networkLabel(net: unknown): string {
  const n = String(net ?? '').toLowerCase();
  if (n === 'main' || n === 'mainnet' || n === 'bitcoin') return 'Bitcoin mainnet';
  if (n === 'signet') return 'Signet · test coins, no value';
  if (n === 'test' || n === 'testnet' || n === 'testnet4') return 'Testnet · no value';
  if (n === 'regtest') return 'Regtest · no value';
  return n ? `Network ${n}` : `Network ${UNAVAILABLE.toLowerCase()}`;
}

/** Simulation records never claim a real confirmation. */
function simText(m: ReceiptModel): ReceiptModel {
  if (!m.simulation || m.variant !== 'order_confirmed') return m;
  return { ...m, statusText: 'SIMULATION COMPLETED', headline: 'Simulation completed', subline: 'Recorded by the simulation. Not a real Bitcoin confirmation.' };
}

function base(p: Partial<ReceiptModel> & Pick<ReceiptModel, 'source' | 'backendStatus' | 'variant' | 'orderReference' | 'title' | 'fileStem'>): ReceiptModel {
  const t = VARIANT_TEXT[p.variant];
  return {
    statusText: t.status, headline: t.headline, subline: t.subline,
    networkLabel: UNAVAILABLE, simulation: false, orderReferenceLabel: 'Record ID',
    recordedAt: UNAVAILABLE, recordedAtLabel: 'Recorded', direction: 'outgoing',
    amount: UNAVAILABLE, fee: UNAVAILABLE, total: UNAVAILABLE, totalLabel: 'Total debit', usd: null,
    transactionId: UNAVAILABLE, walletAddress: UNAVAILABLE, walletAddressLabel: 'Destination BTC address',
    nonBitcoinIdentifier: null, confirmations: UNAVAILABLE, extra: [], notice: NOTICE[p.variant],
    ...p,
  };
}

const safeStem = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'record';

/* ------------------------------------------------------------------ adapters */

export interface LivePaymentInput {
  tx: { txid: string; status: string; confirmations: number; walletId?: string };
  rv: { id: string; address: string; amountSats: string; feeSats: string; totalSats: string; network: string; walletId?: string };
  /** Time the success response was recorded (stable; captured once). */
  at: string;
}

/** Live mainnet send (spending page). Order reference = review id (no merchant order exists). */
export function fromLivePayment(r: LivePaymentInput): ReceiptModel {
  const variant = variantForStatus(r.tx.status);
  return base({
    source: 'live', backendStatus: r.tx.status, variant,
    networkLabel: networkLabel(r.rv.network), orderReference: val(r.rv.id),
    recordedAt: formatRecorded(r.at), recordedAtLabel: 'Recorded at submission',
    amount: btcFromSats(r.rv.amountSats), fee: btcFromSats(r.rv.feeSats), total: btcFromSats(r.rv.totalSats),
    transactionId: val(r.tx.txid), walletAddress: val(r.rv.address),
    confirmations: `${r.tx.confirmations} at submission`,
    extra: [{ label: 'Source wallet', value: val(r.rv.walletId ?? r.tx.walletId), mono: true }],
    title: 'main_vault payment receipt', fileStem: `main_vault-receipt-${safeStem(r.tx.txid.slice(0, 16))}`,
  });
}

/** Sandbox Signet send. Same shape as live, labelled as no-value test network. */
export function fromSignetPayment(r: LivePaymentInput): ReceiptModel {
  const m = fromLivePayment(r);
  return { ...m, source: 'signet', simulation: true, networkLabel: networkLabel(r.rv.network || 'signet'), title: 'main_vault Sandbox Signet receipt', fileStem: `sandbox-signet-receipt-${safeStem(r.tx.txid.slice(0, 16))}` };
}

export interface SandboxLedgerInput { id: string; amountCents: number; destination: string; createdAt: string; status: string; balanceAfterCents: number; /** Developer sandbox may carry authoritative simulated sats. */ amountSats?: string | number | null;
  /** Present on hosted-checkout settlements: "in" is the merchant credit, "out" the payer debit. */ direction?: 'out' | 'in' | null; checkout?: { id: string; reference: string } | null }

/** Sandbox ledger entry: demoUSD, destination is a ledger identifier and NOT a Bitcoin address. */
export function fromSandboxReceipt(t: SandboxLedgerInput, fmtDemoUsd: (cents: number) => string): ReceiptModel {
  const variant = variantForStatus(t.status);
  const demo = Number.isSafeInteger(t.amountCents) ? fmtDemoUsd(t.amountCents) : UNAVAILABLE;
  const hasSats = t.amountSats !== undefined && t.amountSats !== null;
  const amt = hasSats ? btcFromSats(t.amountSats, 'sim BTC') : demo;
  const incoming = t.direction === 'in';
  const checkout = t.checkout ?? null;
  return simText(base({
    source: 'sandbox', backendStatus: t.status, variant, simulation: true,
    direction: incoming ? 'incoming' : 'outgoing',
    networkLabel: 'Simulation · no real value',
    orderReference: checkout ? val(checkout.reference) : val(t.id), orderReferenceLabel: checkout ? 'Order' : 'Record ID',
    recordedAt: formatRecorded(t.createdAt), recordedAtLabel: checkout ? 'Settled at' : 'Created',
    amount: amt, fee: 'None (simulation ledger)', total: amt, totalLabel: incoming ? 'Total received' : 'Total',
    transactionId: 'None · simulation, no Bitcoin transaction',
    walletAddress: `${UNAVAILABLE} · simulation identifier is not a Bitcoin address`,
    nonBitcoinIdentifier: { label: checkout ? 'Checkout destination (ledger)' : 'Destination identifier (ledger)', value: val(t.destination) },
    confirmations: 'Not applicable (simulation)',
    extra: [
      ...(checkout ? [{ label: 'Checkout ID', value: val(checkout.id), mono: true }, { label: 'Ledger record ID', value: val(t.id), mono: true }, { label: 'Direction', value: incoming ? 'Received from a Sandbox wallet' : 'Paid to a hosted checkout' }] : []),
      ...(hasSats ? [{ label: 'Demo credit amount (demoUSD, not a USD quote)', value: demo }] : []),
      { label: 'Ledger balance after (demoUSD)', value: Number.isSafeInteger(t.balanceAfterCents) ? fmtDemoUsd(t.balanceAfterCents) : UNAVAILABLE },
    ],
    title: 'main_vault Sandbox receipt', fileStem: `sandbox-test-receipt-${safeStem(checkout?.reference || t.id)}`,
  }));
}

export interface WalletTxInput { txid: string; walletId: string; direction: string; amountSats: string; feeSats: string | null; firstSeen: string; confirmations: number; status: string; address: string | null; replacedBy: string | null }

/** Node-observed wallet transaction (Activity). Fee for incoming is not ours; shown as unavailable when null. */
export function fromWalletTransaction(t: WalletTxInput, opts: { network?: string | null; incoming: boolean }): ReceiptModel {
  const replaced = !!t.replacedBy || t.confirmations < 0;
  const variant = variantForStatus(t.status, { replaced });
  const amt = btcFromSats(t.amountSats);
  let total = amt;
  if (!opts.incoming) { const a = satsBig(t.amountSats); const f = satsBig(t.feeSats); total = a !== null && f !== null ? btcFromSats(String(a + f)) : UNAVAILABLE; }
  const m = base({
    source: 'wallet_tx', backendStatus: t.status, variant, direction: opts.incoming ? 'incoming' : 'outgoing',
    networkLabel: opts.network ? networkLabel(opts.network) : `Network ${UNAVAILABLE.toLowerCase()}`,
    orderReference: val(t.txid), recordedAt: formatRecorded(t.firstSeen), recordedAtLabel: 'First seen',
    amount: amt, fee: t.feeSats === null ? UNAVAILABLE : btcFromSats(t.feeSats),
    total, totalLabel: opts.incoming ? 'Total received' : 'Total debit',
    transactionId: val(t.txid), walletAddress: val(t.address),
    walletAddressLabel: opts.incoming ? 'Receiving BTC address' : 'Destination BTC address',
    confirmations: t.confirmations < 0 ? 'Conflicted' : String(t.confirmations),
    extra: [{ label: 'Wallet', value: val(t.walletId), mono: true }, ...(t.replacedBy ? [{ label: 'Replaced by', value: t.replacedBy, mono: true }] : [])],
    title: opts.incoming ? 'main_vault receive receipt' : 'main_vault payment receipt', fileStem: `main_vault-tx-${safeStem(t.txid.slice(0, 16))}`,
  });
  if (replaced) return { ...m, statusText: 'REPLACED / CONFLICTED', headline: 'Replaced or conflicted', subline: 'This transaction will not confirm as recorded.' };
  return m;
}

export type FoundationKind = 'deposit' | 'withdrawal' | 'transfer';
export type FoundationRecord = Record<string, unknown>;

/**
 * Wallet Foundation local simulation records. All destinations are simulation identifiers,
 * never Bitcoin addresses. `context.wallet` / `context.assignment` enrich labels when available.
 */
export function fromFoundationRecord(kind: FoundationKind, r: FoundationRecord, context: { wallet?: FoundationRecord | null; assignment?: FoundationRecord | null } = {}): ReceiptModel {
  const status = val(r.status);
  const variant = variantForStatus(r.status);
  const amount = btcFromSats(r.amountSats, 'sim BTC');
  const extra: ReceiptLine[] = [];
  let ident: ReceiptModel['nonBitcoinIdentifier'] = null;
  let fee = UNAVAILABLE; let total = amount; let totalLabel = 'Total debit';
  let direction: ReceiptModel['direction'] = 'outgoing';
  if (kind === 'deposit') {
    direction = 'incoming'; totalLabel = 'Total received'; fee = 'Not applicable (incoming)';
    extra.push({ label: 'Wallet', value: val(context.wallet?.label ?? r.walletId), mono: true });
    if (context.wallet?.label) extra.push({ label: 'Wallet ID', value: val(r.walletId), mono: true });
    if (r.output !== undefined) extra.push({ label: 'Output', value: val(r.output), mono: true });
    if (context.assignment?.destination !== undefined) ident = { label: 'Assigned deposit identifier (simulation)', value: val(context.assignment.destination) };
  } else if (kind === 'withdrawal') {
    const amt = satsBig(r.amountSats); const dev = satsBig(r.developerFeeSats ?? 0); const actual = satsBig(r.actualFeeSats);
    const final = variantForStatus(r.status) === 'order_confirmed';
    if (final && actual !== null) {
      fee = btcFromSats(String(actual), 'sim BTC');
      total = amt !== null && dev !== null ? btcFromSats(String(amt + actual + dev), 'sim BTC') : UNAVAILABLE;
      totalLabel = 'Actual total debit';
    } else {
      fee = r.networkFeeSats === undefined || r.networkFeeSats === null ? UNAVAILABLE : `${btcFromSats(r.networkFeeSats, 'sim BTC')} (fee cap / estimate, not final)`;
      total = UNAVAILABLE; totalLabel = final ? 'Actual total debit (actual fee not recorded)' : 'Actual total debit (not final)';
    }
    extra.push({ label: 'Approved maximum (reserved)', value: btcFromSats(r.totalSats, 'sim BTC') });
    if (r.networkFeeSats !== undefined && final) extra.push({ label: 'Approved network fee cap', value: btcFromSats(r.networkFeeSats, 'sim BTC') });
    if (r.developerFeeSats !== undefined) extra.push({ label: 'Developer fee', value: btcFromSats(r.developerFeeSats, 'sim BTC') });
    if (r.feeVersion !== undefined) extra.push({ label: 'Fee version', value: val(r.feeVersion) });
    ident = { label: 'Destination identifier (simulation)', value: val(r.destination) };
  } else {
    direction = 'internal'; fee = 'None (internal ledger move)';
    ident = { label: 'Internal transfer', value: `${val(r.from)} -> ${val(r.to)}` };
  }
  if (r.confirmations !== undefined) extra.push({ label: 'Confirmations', value: val(r.confirmations) });
  const recorded = r.createdAt ?? r.observedAt ?? r.updatedAt;
  return simText(base({
    source: 'foundation', backendStatus: status, variant, simulation: true, direction,
    networkLabel: 'Local simulation · no real funds', orderReference: val(r.id),
    recordedAt: formatRecorded(recorded), recordedAtLabel: 'Recorded',
    amount, fee, total, totalLabel,
    transactionId: typeof r.txid === 'string' && r.txid ? `${r.txid} (simulated)` : UNAVAILABLE,
    walletAddress: `${UNAVAILABLE} · simulation records carry no Bitcoin address`,
    nonBitcoinIdentifier: ident,
    confirmations: r.confirmations === undefined ? UNAVAILABLE : val(r.confirmations),
    extra, title: `Local simulation ${kind} receipt`, fileStem: `local-receipt-${kind}-${safeStem(val(r.id).slice(0, 8))}`,
  }));
}

export interface CheckoutInput { id: string; status: string; amount_sats: number; reference: string; expiresAt: string; environment: string;
  /** Settlement facts reported by the backend once paid. Absent on older records. */ paid_at?: string | null; paid_via?: string | null; sandbox_destination?: string | null }

const PAID_VIA: Record<string, string> = { sandbox_transfer: 'Sandbox wallet transfer', manual_simulation: 'Marked paid by the merchant (manual)' };

/** Hosted checkout (simulation). Merchant reference is used as order. QR is a URL, never an address. */
export function fromHostedCheckout(c: CheckoutInput): ReceiptModel {
  const variant = variantForStatus(c.status);
  const amt = btcFromSats(c.amount_sats, 'sim BTC');
  const m = base({
    source: 'checkout', backendStatus: c.status, variant, simulation: true, direction: 'checkout',
    networkLabel: `Simulation · ${val(c.environment)} · no real Bitcoin`,
    orderReference: c.reference ? c.reference : val(c.id), orderReferenceLabel: c.reference ? 'Order' : 'Record ID',
    recordedAt: c.paid_at ? formatRecorded(c.paid_at) : UNAVAILABLE, recordedAtLabel: 'Settled at',
    amount: amt, fee: UNAVAILABLE, total: amt, totalLabel: 'Total',
    transactionId: 'None · simulated checkout',
    walletAddress: `${UNAVAILABLE} · checkout QR is a page link, not a Bitcoin address`,
    nonBitcoinIdentifier: c.sandbox_destination ? { label: 'Sandbox payment destination', value: c.sandbox_destination } : null,
    confirmations: 'Not applicable (simulation)',
    extra: [
      { label: 'Checkout ID', value: val(c.id), mono: true },
      ...(c.paid_at ? [{ label: 'Settled via', value: c.paid_via ? (PAID_VIA[c.paid_via] ?? val(c.paid_via)) : UNAVAILABLE }] : []),
      { label: 'Expires', value: formatRecorded(c.expiresAt) },
    ],
    title: 'main_vault checkout receipt', fileStem: `checkout-receipt-${safeStem(c.reference || c.id)}`,
  });
  if (c.status === 'expired') return { ...m, statusText: 'EXPIRED - NOT PAID', headline: 'Checkout expired', subline: 'No payment was recorded.' };
  return simText(m);
}

/* ------------------------------------------------------------------ export */

/** All rows shown in details/print/download, in order. */
export function receiptRows(m: ReceiptModel): ReceiptLine[] {
  return [
    { label: 'Status', value: m.statusText },
    { label: 'Backend status', value: m.backendStatus, mono: true },
    { label: 'Network', value: m.networkLabel },
    { label: m.orderReferenceLabel === 'Order' ? 'Order reference' : 'Order reference (record ID)', value: m.orderReference, mono: true },
    { label: m.recordedAtLabel, value: m.recordedAt },
    { label: 'Amount', value: m.amount },
    { label: 'Network fee', value: m.fee },
    { label: m.totalLabel, value: m.total },
    ...(m.usd ? [{ label: 'USD estimate', value: m.usd }] : []),
    { label: 'Confirmations', value: m.confirmations },
    { label: 'Transaction ID', value: m.transactionId, mono: true },
    { label: m.walletAddressLabel, value: m.walletAddress, mono: true },
    ...(m.nonBitcoinIdentifier ? [{ ...m.nonBitcoinIdentifier, mono: true }] : []),
    ...m.extra,
  ];
}

/** Plain-text receipt (complete, independent of animation). */
export function receiptToText(m: ReceiptModel): string {
  const lines = [m.title.toUpperCase(), m.simulation ? `${m.networkLabel}. No real value.` : m.networkLabel, ''];
  for (const r of receiptRows(m)) lines.push(`${r.label}: ${r.value}`);
  if (m.notice) lines.push('', m.notice);
  return lines.join('\n');
}

export function receiptFileName(m: ReceiptModel): string { return `${m.fileStem}.txt`; }

/* ------------------------------------------------------------------ motion */

export const FEED_DURATION_SEC = 10;

/** One-shot paper kinematics (0..10s, then hold at 1). Non-confirmed variants are static fully fed. */
export function paperKinematics(t: number, variant: ReceiptVariant): { feed: number; settlePx: number; feeding: boolean } {
  if (variant !== 'order_confirmed' || t >= 8.5) return { feed: 1, settlePx: 0, feeding: false };
  if (t < 3) return { feed: 0, settlePx: 0, feeding: false };
  if (t <= 7) {
    const x = (t - 3) / 4; const e = x < 0.18 ? (x * x) / 0.18 : x - 0.09;
    return { feed: Math.min(1, Math.max(0, e / 0.91)) * 0.78, settlePx: 0, feeding: true };
  }
  const d = Math.min(1, (t - 7) / 1.35);
  const settle = t >= 8.2 ? Math.sin(((t - 8.2) / 0.3) * Math.PI) * 2.2 : 0;
  return { feed: 0.78 + (1 - Math.pow(1 - d, 3)) * 0.22, settlePx: settle, feeding: t < 8.38 };
}

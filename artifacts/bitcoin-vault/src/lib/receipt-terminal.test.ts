import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  btcFromSats, formatRecorded, fromFoundationRecord, fromHostedCheckout,
  fromLivePayment, fromSandboxReceipt, fromSignetPayment, fromWalletTransaction,
  paperKinematics, receiptFileName, receiptRows, receiptToText, variantForStatus,
} from './receipt-terminal';

const address = 'bc1p' + 'q'.repeat(58); // Long payload for lossless display, not address-validation evidence.
const at = '2026-10-31T09:10:11.000Z';
const live = {
  tx: { txid: 'a'.repeat(64), status: 'pending', confirmations: 0, walletId: 'owner-spending' },
  rv: { id: 'review-stable-ORDER-424242', address, amountSats: '10000', feeSats: '500', totalSats: '10500', network: 'main', walletId: 'owner-spending' },
  at,
};

test('receipt sats formatting is exact and rejects unsafe numbers or malformed values', () => {
  assert.equal(btcFromSats('2100000000000000'), '21000000.00000000 BTC');
  assert.equal(btcFromSats('1'), '0.00000001 BTC');
  assert.equal(btcFromSats('0'), '0.00000000 BTC');
  for (const invalid of [undefined, null, '', '1.1', '1e8', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.equal(btcFromSats(invalid), 'Unavailable');
});

test('live receipt binds stable order, full address and recorded time in all export rows', () => {
  const model = fromLivePayment(live);
  assert.equal(model.orderReference, live.rv.id);
  assert.equal(model.walletAddress, address);
  assert.equal(model.recordedAt, '2026-10-31 09:10:11 UTC');
  assert.equal(model.amount, '0.00010000 BTC');
  assert.equal(model.total, '0.00010500 BTC');
  const text = receiptToText(model);
  for (const value of [address, live.rv.id, live.tx.txid, model.recordedAt])
    assert.ok(text.includes(value));
  assert.equal(receiptToText(fromLivePayment(live)), text);
  assert.ok(receiptRows(model).some(row => row.value === address));
  assert.equal(model.usd, null);
});

test('unknown, pending, broadcast, failure and replaced records never become successful', () => {
  for (const status of ['unknown', 'pending', 'broadcast', 'review', 'reserved', 'failed', 'reversed', 'expired', 'unrecognized']) {
    assert.notEqual(variantForStatus(status), 'order_confirmed', status);
    const model = fromLivePayment({ ...live, tx: { ...live.tx, status } });
    assert.notEqual(model.statusText, 'CONFIRMED', status);
  }
  assert.equal(variantForStatus('confirmed', { replaced: true }), 'status_unavailable');
  assert.equal(variantForStatus('confirmed'), 'order_confirmed');
});

test('Signet is distinctly labelled without changing record identity', () => {
  const model = fromSignetPayment({ ...live, rv: { ...live.rv, network: 'signet' } });
  assert.match(model.networkLabel, /Signet/);
  assert.equal(model.orderReference, live.rv.id);
  assert.equal(model.walletAddress, address);
  assert.equal(model.variant, 'awaiting_confirmation');
});

test('sandbox completion is not a Bitcoin confirmation or an invented wallet address', () => {
  const model = fromSandboxReceipt({
    id: 'sim-4242', amountCents: 1000, amountSats: 12345, destination: 'assigned-ledger-id',
    createdAt: at, status: 'simulation_complete', balanceAfterCents: 299000,
  }, n => `${(n / 100).toFixed(2)} demoUSD`);
  assert.equal(model.variant, 'order_confirmed');
  assert.equal(model.statusText, 'SIMULATION COMPLETED');
  assert.equal(model.amount, '0.00012345 sim BTC');
  assert.match(model.walletAddress, /Unavailable/);
  assert.equal(model.nonBitcoinIdentifier?.value, 'assigned-ledger-id');
  assert.ok(receiptToText(model).includes('10.00 demoUSD'));
  assert.equal(model.usd, null);
});

test('confirmed developer withdrawal separates actual debit from approved reservation cap', () => {
  const model = fromFoundationRecord('withdrawal', {
    id: 'withdrawal-1', status: 'confirmed', amountSats: 10000,
    networkFeeSats: 500, actualFeeSats: 300, developerFeeSats: 20,
    totalSats: 10520, destination: 'external-sim-identifier', createdAt: at,
    confirmations: 3, txid: 'b'.repeat(64),
  });
  assert.equal(model.total, '0.00010320 sim BTC');
  assert.equal(model.fee, '0.00000300 sim BTC');
  assert.equal(model.statusText, 'SIMULATION COMPLETED');
  assert.ok(model.extra.some(row => row.value === '0.00010520 sim BTC'));
  assert.match(model.walletAddress, /Unavailable/);
  assert.ok(receiptToText(model).includes('external-sim-identifier'));
});

test('unsettled or incomplete withdrawal data never invents an actual debit', () => {
  for (const status of ['review', 'reserved', 'unknown', 'broadcast', 'confirmed']) {
    const model = fromFoundationRecord('withdrawal', {
      id: 'w', status, amountSats: 10000, totalSats: 10500,
      networkFeeSats: 500, developerFeeSats: 0,
    });
    assert.equal(model.total, 'Unavailable', status);
  }
});

test('personal incoming receipt shows received amount, not a sender fee deduction', () => {
  const model = fromWalletTransaction({
    txid: 'c'.repeat(64), walletId: 'owner-reserve', direction: 'received',
    amountSats: '7536', feeSats: null, firstSeen: at, confirmations: 3,
    status: 'confirmed', address, replacedBy: null,
  }, { network: 'main', incoming: true });
  assert.equal(model.direction, 'incoming');
  assert.equal(model.total, '0.00007536 BTC');
  assert.equal(model.fee, 'Unavailable');
  assert.equal(model.walletAddress, address);
  assert.equal(model.totalLabel, 'Total received');
});

test('hosted checkout uses merchant order and does not mislabel its page QR as a wallet', () => {
  const model = fromHostedCheckout({
    id: 'checkout-1', reference: 'ORDER-999', amount_sats: 12345,
    expiresAt: at, environment: 'sandbox', status: 'simulation_paid',
  });
  assert.equal(model.orderReference, 'ORDER-999');
  assert.equal(model.orderReferenceLabel, 'Order');
  assert.equal(model.statusText, 'SIMULATION COMPLETED');
  assert.match(model.walletAddress, /page link/);
  assert.equal(model.recordedAt, 'Unavailable');
  assert.match(receiptFileName(model), /\.txt$/);
  const settled = fromHostedCheckout({
    id: 'checkout-1', reference: 'ORDER-999', amount_sats: 12345, expiresAt: at, environment: 'simulation',
    status: 'simulation_paid', paid_at: '2026-10-31T09:10:11.000Z', paid_via: 'sandbox_transfer', sandbox_destination: 'checkout:tok',
  });
  assert.equal(settled.recordedAt, '2026-10-31 09:10:11 UTC');
  assert.ok(settled.extra.some((l) => l.label === 'Settled via' && /Sandbox wallet/.test(l.value)));
  assert.equal(settled.nonBitcoinIdentifier?.value, 'checkout:tok');
});

test('sandbox settlement receipts name the order and direction from the ledger record only', () => {
  const fmt = (c: number) => `${(c / 100).toFixed(2)} demoUSD`;
  const credit = fromSandboxReceipt({ id: 'rec-1', amountCents: 250, amountSats: 25000, destination: 'checkout:tok', createdAt: at, status: 'simulation_complete', balanceAfterCents: 10250, direction: 'in', checkout: { id: 'co-1', reference: 'ORDER-1' } }, fmt);
  assert.equal(credit.direction, 'incoming');
  assert.equal(credit.orderReference, 'ORDER-1');
  assert.equal(credit.totalLabel, 'Total received');
  assert.ok(credit.extra.some((l) => l.label === 'Checkout ID' && l.value === 'co-1'));
  const plain = fromSandboxReceipt({ id: 'rec-2', amountCents: 250, destination: 'sandbox-x', createdAt: at, status: 'simulation_complete', balanceAfterCents: 10 }, fmt);
  assert.equal(plain.direction, 'outgoing');
  assert.equal(plain.orderReferenceLabel, 'Record ID');
});

test('animation finishes once and cannot promote payment state', () => {
  assert.deepEqual(paperKinematics(0, 'order_confirmed'), { feed: 0, settlePx: 0, feeding: false });
  assert.equal(paperKinematics(5, 'order_confirmed').feeding, true);
  assert.deepEqual(paperKinematics(10, 'order_confirmed'), { feed: 1, settlePx: 0, feeding: false });
  assert.deepEqual(paperKinematics(100, 'order_confirmed'), paperKinematics(10, 'order_confirmed'));
  assert.deepEqual(paperKinematics(5, 'awaiting_confirmation'), { feed: 1, settlePx: 0, feeding: false });
  assert.equal(formatRecorded('invalid-date'), 'Unavailable');
});

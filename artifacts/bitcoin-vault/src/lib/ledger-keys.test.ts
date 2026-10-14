import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyLedger } from './ledger-keys';

const b = { txid: 'aa', walletId: 'w1', direction: 'incoming', amountSats: '100', address: 'bc1x' };

test('keeps distinct outputs with same txid/wallet', () => {
  const out = keyLedger([b, { ...b, address: 'bc1y' }, { ...b, amountSats: '5' }]);
  assert.equal(out.length, 3);
  assert.equal(new Set(out.map((o) => o.key)).size, 3);
});

test('identical entries get ordinals, not collapsed', () => {
  const out = keyLedger([b, { ...b }, { ...b }]);
  assert.deepEqual(out.map((o) => o.key.split('#')[1]), [undefined, '1', '2']);
});

test('keys are deterministic across refreshes', () => {
  assert.deepEqual(keyLedger([b, { ...b }]).map((o) => o.key), keyLedger([{ ...b }, b]).map((o) => o.key));
});

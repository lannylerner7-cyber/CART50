import test from 'node:test';
import assert from 'node:assert/strict';
import { freshUsdPrice, usdEstimate } from './usd-estimate';
test('USD estimates are exact integer-cent displays, not payment inputs', () => {
  assert.equal(usdEstimate('100000', 80000), '$80.00');
  assert.equal(usdEstimate('2500', 80000), '$2.00');
  assert.equal(usdEstimate('102500', 80000), '$82.00');
  assert.equal(usdEstimate('1', 80000), '< $0.01');
  assert.equal(usdEstimate('0', 80000), '$0.00');
  for (const sats of ['', '-1', '1.5', 'abc', '2100000000000001']) assert.equal(usdEstimate(sats, 80000), null);
  assert.equal(usdEstimate('100', null), null);
});
test('stale, future, unavailable and failed-refresh quotes are hidden', () => {
  const now = Date.now();
  const q = { available: true, stale: false, price: 80000, currency: 'USD', updatedAt: new Date(now).toISOString() };
  assert.equal(freshUsdPrice(q, false, now), 80000);
  assert.equal(freshUsdPrice(q, true, now), null);
  for (const change of [
    { stale: true }, { available: false }, { price: 0 }, { price: NaN },
    { currency: 'EUR' }, { updatedAt: null },
    { updatedAt: new Date(now - 180001).toISOString() },
    { updatedAt: new Date(now + 30001).toISOString() },
  ]) assert.equal(freshUsdPrice({ ...q, ...change }, false, now), null);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transferDelay } from './transfer-delay';
const now = Date.parse('2026-10-15T12:00:00Z');
const tx = { firstSeen: '2026-10-15T11:00:00Z', confirmations: 0, status: 'pending' };
test('threshold is inclusive and configurable', () => {
  assert.match(transferDelay(tx, now - 1, 60), /^Waiting/);
  assert.match(transferDelay(tx, now, 60), /^Delay warning/);
  assert.match(transferDelay(tx, now, 120), /^Waiting/);
});
test('one and two confirmations wait; three complete; reorg reverses completion', () => {
  for (const confirmations of [1, 2]) assert.match(transferDelay({...tx, confirmations, status:'confirming'}, now, 60), /Delay warning/);
  assert.match(transferDelay({...tx, confirmations:3, status:'confirmed'}, now, 60), /^Complete/);
  assert.match(transferDelay({...tx, confirmations:1, status:'confirmed'}, now, 60), /^Delay warning/);
});
test('exceptional states are not mislabeled as slow or complete', () => {
  for (const status of ['replaced', 'failed', 'expired', 'abandoned', 'conflicted', 'broadcast_unknown']) {
    assert.doesNotMatch(transferDelay({...tx, status}, now, 60), /Delay warning|^Complete/);
  }
  assert.match(transferDelay({...tx, confirmations:-1}, now, 60), /^Conflicted/);
});
test('invalid and future timestamps do not produce a false warning', () => {
  for (const firstSeen of ['invalid', '2027-01-01']) assert.match(transferDelay({...tx, firstSeen}, now, 60), /^Timing unavailable/);
});

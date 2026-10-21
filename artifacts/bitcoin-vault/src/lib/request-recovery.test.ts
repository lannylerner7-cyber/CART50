import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import { retryRead, readRetryDelay, requireMonitor } from './request-recovery';

test('read retries are bounded and exclude auth, validation, and cancellation errors', () => {
  for (const status of [400, 401, 403, 404, 409, 422]) assert.equal(retryRead(0, { status }), false);
  for (const status of [408, 429, 500, 502, 503, 504]) assert.equal(retryRead(0, { status }), true);
  assert.equal(retryRead(0, new TypeError('Failed to fetch')), true);
  assert.equal(retryRead(3, new TypeError('Failed to fetch')), false);
  assert.equal(retryRead(0, { name: 'AbortError' }), false);
  assert.deepEqual([0, 1, 2, 10].map(readRetryDelay), [2000, 4000, 8000, 15000]);
});

test('unavailable monitor retries then recovers without a page reload', async () => {
  const client = new QueryClient();
  let calls = 0;
  try {
    const data = await client.fetchQuery({
      queryKey: ['sync'], retry: retryRead, retryDelay: 0,
      queryFn: () => requireMonitor(async () => ({
        available: ++calls === 3, message: 'Temporary outage', progress: 0.4299,
      })),
    });
    assert.equal(calls, 3);
    assert.equal(data.progress, 0.4299);
  } finally { client.clear(); }
});

test('failed observation preserves last successful data and original freshness timestamp', async () => {
  const client = new QueryClient();
  const good = { available: true, message: 'Observed', progress: 0.4299 };
  client.setQueryData(['sync'], good, { updatedAt: 1000 });
  try {
    await assert.rejects(client.fetchQuery({
      queryKey: ['sync'], retry: false,
      queryFn: () => requireMonitor(async () => ({ available: false, message: 'Offline', progress: null })),
    }));
    assert.deepEqual(client.getQueryData(['sync']), good);
    assert.equal(client.getQueryState(['sync'])?.dataUpdatedAt, 1000);
  } finally { client.clear(); }
});

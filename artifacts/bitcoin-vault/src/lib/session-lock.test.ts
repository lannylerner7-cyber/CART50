import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import { lockClient, SESSION_KEY } from './session-lock';

test('locking cancels stale session and wallet responses and removes protected cache', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const session = { authenticated: true, configured: true, network: 'signet', csrfToken: 'test', expiresAt: new Date(Date.now() + 60000).toISOString() };
  client.setQueryData(SESSION_KEY, session);
  client.setQueryData(['/api/vault/wallets'], [{ id: 'private-wallet' }]);
  let resolveSession!: (value: typeof session) => void;
  let resolveWallet!: (value: unknown[]) => void;
  const pendingSession = client.fetchQuery({ queryKey: SESSION_KEY, queryFn: () => new Promise<typeof session>(r => { resolveSession = r; }) }).catch(() => {});
  const pendingWallet = client.fetchQuery({ queryKey: ['/api/vault/wallets'], queryFn: () => new Promise<unknown[]>(r => { resolveWallet = r; }) }).catch(() => {});
  lockClient(client, false);
  resolveSession(session);
  resolveWallet([{ id: 'must-not-return' }]);
  await Promise.all([pendingSession, pendingWallet]);
  assert.equal(client.getQueryData<{authenticated:boolean}>(SESSION_KEY)?.authenticated, false);
  assert.equal(client.getQueryData(['/api/vault/wallets']), undefined);
  assert.equal(client.getQueryData<{csrfToken:null}>(SESSION_KEY)?.csrfToken, null);
  lockClient(client, false);
  assert.equal(client.getQueryData<{authenticated:boolean}>(SESSION_KEY)?.authenticated, false);
  client.clear();
});

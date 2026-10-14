import type { QueryClient } from '@tanstack/react-query';
import { getGetVaultSessionQueryKey, setCsrfToken, type Session } from '@workspace/api-client-react';

export const LOCK_EVENT = 'vault-session-locked';
export const SESSION_KEY = getGetVaultSessionQueryKey();

/** Cancel first so an older successful response cannot restore protected data. */
export function lockClient(client: QueryClient, broadcast = true) {
  const previous = client.getQueryData<Session>(SESSION_KEY);
  void client.cancelQueries();
  setCsrfToken(null);
  client.removeQueries({ predicate: q => q.queryKey[0] !== SESSION_KEY[0] });
  client.getMutationCache().clear();
  client.setQueryData<Session>(SESSION_KEY, {
    authenticated: false, configured: previous?.configured ?? true,
    network: previous?.network ?? 'signet', csrfToken: null, expiresAt: null,
    loginRetryAfterSeconds: 0,
  });
  if (broadcast && typeof window !== 'undefined') {
    // No credentials or wallet data are stored or sent between tabs.
    try { localStorage.setItem(LOCK_EVENT, crypto.randomUUID()); } catch { /* Storage may be disabled. */ }
  }
}

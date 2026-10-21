/** Only transient read failures are retried. Mutations must be reconciled by the caller. */
export function transientReadError(error: unknown): boolean {
  const e = error as { status?: number; name?: string } | null;
  if (e?.name === 'AbortError') return false;
  if (e?.status != null) return e.status === 408 || e.status === 429 || e.status >= 500;
  return error instanceof TypeError || e?.name === 'TimeoutError' || e?.name === 'MonitorUnavailable';
}

export const retryRead = (count: number, error: unknown) => count < 3 && transientReadError(error);
export const readRetryDelay = (attempt: number) => Math.min(2000 * 2 ** attempt, 15000);

export async function requireMonitor<T extends { available: boolean; message: string }>(
  read: () => Promise<T>,
): Promise<T> {
  const result = await read();
  if (!result.available) {
    const error = new Error(result.message);
    error.name = 'MonitorUnavailable';
    throw error;
  }
  return result;
}

import { createContext, useContext, type ReactNode } from 'react';
import { formatDistanceToNowStrict, format } from 'date-fns';
import type { Session } from '@workspace/api-client-react';

export const POLL_MS = 15000;

const SessionCtx = createContext<Session | null>(null);

export function SessionProvider({ session, children }: { session: Session; children: ReactNode }) {
  return <SessionCtx.Provider value={session}>{children}</SessionCtx.Provider>;
}

export function useSession(): Session {
  const s = useContext(SessionCtx);
  if (!s) throw new Error('Session context missing');
  return s;
}

/** Request options that attach the CSRF token to a mutation. */
export function useCsrf() {
  const s = useContext(SessionCtx);
  const token = s?.csrfToken ?? '';
  return { request: { headers: { 'X-CSRF-Token': token } } };
}

export function poll(enabled: boolean) {
  return enabled ? POLL_MS : false;
}

export function errMsg(e: unknown): string {
  if (!e) return 'Unknown error';
  if (e instanceof Error) return e.message;
  return String(e);
}

export function errStatus(e: unknown): number | undefined {
  if (e && typeof e === 'object' && 'status' in e) {
    const s = (e as { status: unknown }).status;
    return typeof s === 'number' ? s : undefined;
  }
  return undefined;
}

/* ---------- Satoshi formatting: BigInt only, no float arithmetic ---------- */
const SATS_PER_BTC = 100000000n;

export function toBig(s: string | null | undefined): bigint {
  if (!s || !/^-?[0-9]+$/.test(s)) return 0n;
  return BigInt(s);
}

function group(n: bigint): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function satsToBtc(s: string | bigint | null | undefined): string {
  const v = typeof s === 'bigint' ? s : toBig(s);
  const neg = v < 0n;
  const a = neg ? -v : v;
  const whole = a / SATS_PER_BTC;
  const frac = (a % SATS_PER_BTC).toString().padStart(8, '0');
  return `${neg ? '-' : ''}${group(whole)}.${frac}`;
}

export function satsGrouped(s: string | bigint | null | undefined): string {
  const v = typeof s === 'bigint' ? s : toBig(s);
  return v < 0n ? `-${group(-v)}` : group(v);
}

/** Parse a BTC decimal string to sats string using string math only. */
export function btcToSats(input: string): string | null {
  const t = input.trim();
  if (!/^[0-9]+(\.[0-9]{1,8})?$/.test(t)) return null;
  const [w, f = ''] = t.split('.');
  return (BigInt(w) * SATS_PER_BTC + BigInt(f.padEnd(8, '0'))).toString();
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${formatDistanceToNowStrict(d)} ${d.getTime() > Date.now() ? 'from now' : 'ago'}`;
}

export function stamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : format(d, 'yyyy-MM-dd HH:mm xxx');
}

export function remaining(iso: string | null | undefined): { label: string; ms: number } {
  if (!iso) return { label: 'no expiry', ms: Infinity };
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return { label: 'expired', ms };
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return { label: `${h}h ${String(m).padStart(2, '0')}m`, ms };
}

export const CREDENTIAL_RE = /^[A-Za-z0-9_-]{86}$/;

export function short(s: string | null | undefined, n = 8): string {
  if (!s) return '—';
  return s.length <= n * 2 + 1 ? s : `${s.slice(0, n)}…${s.slice(-n)}`;
}

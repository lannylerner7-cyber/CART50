// Sandbox helpers. Data comes only from generated /vault/sandbox hooks (demo ledger), never live wallet/engine endpoints.
import { errStatus } from '@/lib/vault';

/** True when a submit outcome is unknown (network, timeout, 5xx): reconcile via snapshot, retry with same review id. */
export function outcomeUnknown(e: unknown): boolean {
  const s = errStatus(e);
  return s === undefined || s >= 500 || s === 408;
}

/** "25.00" -> 2500 using string math only. */
export function parseCents(input: string): number | null {
  const raw = input.trim();
  if (raw.includes(',') && !/^[0-9]{1,3}(,[0-9]{3})+(\.[0-9]{1,2})?$/.test(raw)) return null;
  const t = raw.replace(/,/g, '');
  if (!/^[0-9]{1,9}(\.[0-9]{1,2})?$/.test(t)) return null;
  const [w, f = ''] = t.split('.');
  const v = Number(w) * 100 + Number(f.padEnd(2, '0'));
  return v > 0 ? v : null;
}

export function demoUsd(cents: number): string {
  const neg = cents < 0; const a = Math.abs(cents);
  return `${neg ? '-' : ''}$${Math.floor(a / 100).toLocaleString('en-US')}.${String(a % 100).padStart(2, '0')} demoUSD`;
}

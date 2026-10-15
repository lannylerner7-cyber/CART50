type Transfer = { firstSeen: string; confirmations: number; status: string };
export function transferDelay(t: Transfer, now: number, minutes: number) {
  if (t.status === 'replaced') return 'Replaced — follow the replacement transaction';
  if (t.confirmations < 0 || t.status === 'conflicted') return 'Conflicted — inspect before retrying';
  if (['failed', 'abandoned', 'expired'].includes(t.status)) return `${t.status} — not a confirmation delay`;
  if (t.status === 'broadcast_unknown') return 'Broadcast unknown — reconcile before retrying';
  if (t.confirmations >= 3) return 'Complete — confirmation target reached';
  if (!['pending', 'confirming', 'broadcast', 'confirmed'].includes(t.status)) return 'Status needs inspection';
  const seen = Date.parse(t.firstSeen);
  if (!Number.isFinite(seen) || seen > now) return 'Timing unavailable — check timestamps';
  const age = Math.floor((now - seen) / 60000);
  const stage = t.confirmations === 0 ? 'Awaiting first confirmation' : `Awaiting ${3 - t.confirmations} more confirmation(s)`;
  return `${age >= minutes ? 'Delay warning' : 'Waiting'} · ${age} min since first seen · ${stage}`;
}

import { useMemo, useState } from 'react';
import type { MarketHistoryItem } from '@workspace/api-client-react';
import { cn } from '@/lib/utils';

const RANGES = [
  { k: '1H', ms: 3600e3 }, { k: '24H', ms: 864e5 }, { k: '1W', ms: 6048e5 },
  { k: '1M', ms: 2592e6 }, { k: '1Y', ms: 31536e6 }, { k: 'All', ms: Infinity },
] as const;

/** Draws only real provider history. Ranges without at least two points are disabled, never filled. */
export function PriceChart({ history, currency, className }: { history: MarketHistoryItem[]; currency: string; className?: string }) {
  const pts = useMemo(() => history.map((h) => ({ t: Date.parse(h.time), p: h.price })).filter((x) => Number.isFinite(x.t) && Number.isFinite(x.p)).sort((a, b) => a.t - b.t), [history]);
  const last = pts.length ? pts[pts.length - 1].t : 0;
  const inRange = (ms: number) => pts.filter((x) => ms === Infinity || x.t >= last - ms);
  const avail = RANGES.filter((r) => inRange(r.ms).length >= 2);
  const [sel, setSel] = useState<string | null>(null);
  const active = avail.find((r) => r.k === sel) ?? avail.find((r) => r.k === '24H') ?? avail[avail.length - 1];
  const data = active ? inRange(active.ms) : [];
  const W = 400, H = 180;
  const geo = useMemo(() => {
    if (data.length < 2) return null;
    const t0 = data[0].t, t1 = data[data.length - 1].t;
    const ps = data.map((d) => d.p); const lo = Math.min(...ps), hi = Math.max(...ps);
    const span = hi - lo || 1;
    const xy = data.map((d) => [((d.t - t0) / (t1 - t0 || 1)) * W, H - 8 - ((d.p - lo) / span) * (H - 24)] as const);
    const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
    return { line, area: `${line}L${W},${H}L0,${H}Z`, first: data[0].p, lastP: data[data.length - 1].p };
  }, [data]);
  const fmt = (n: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 2 }).format(n);
  const change = geo ? geo.lastP - geo.first : 0;

  return (
    <div className={className}>
      {geo ? (
        <>
          <div className="px-1 text-[13px] text-muted-foreground" data-testid="text-chart-change">
            BTC/{currency} reference · <span className={change < 0 ? 'text-destructive' : 'text-ok'}>{change < 0 ? '' : '+'}{fmt(change)} ({((change / geo.first) * 100).toFixed(2)}%)</span> {active?.k}
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-3 h-[190px] w-full md:h-[240px]" role="img" aria-label={`Bitcoin reference price over ${active?.k}, ${data.length} provider points`} data-testid="chart-price">
            <defs>
              <pattern id="pc-dots" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.8" fill="hsl(var(--chart-1))" opacity="0.38" /></pattern>
              <linearGradient id="pc-fade" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="white" stopOpacity="1" /><stop offset="1" stopColor="white" stopOpacity="0" /></linearGradient>
              <mask id="pc-mask"><rect width={W} height={H} fill="url(#pc-fade)" /></mask>
            </defs>
            <path d={geo.area} fill="url(#pc-dots)" mask="url(#pc-mask)" />
            <path d={geo.line} fill="none" stroke="hsl(var(--chart-1))" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </svg>
        </>
      ) : (
        <div className="grid h-[190px] place-items-center rounded-[24px] border border-dashed border-border px-6 text-center text-sm text-muted-foreground" data-testid="status-chart-empty">
          No price history recorded yet. The chart draws only real provider data.
        </div>
      )}
      <div className="mt-4 flex justify-between gap-1" role="group" aria-label="Chart range">
        {RANGES.map((r) => {
          const ok = avail.includes(r);
          return (
            <button key={r.k} disabled={!ok} aria-pressed={active?.k === r.k} onClick={() => setSel(r.k)} data-testid={`button-range-${r.k}`}
              className={cn('min-h-11 min-w-[3.25rem] rounded-full px-3 text-[13.5px] font-semibold transition-colors disabled:opacity-30', active?.k === r.k ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {r.k}
            </button>
          );
        })}
      </div>
    </div>
  );
}

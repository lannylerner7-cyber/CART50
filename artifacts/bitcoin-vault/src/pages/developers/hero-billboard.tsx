import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { TerminalHousing, usePrefersReducedMotion } from '@/components/receipt-terminal/terminal';
import { FEED_DURATION_SEC, fromHostedCheckout } from '@/lib/receipt-terminal';
import './hero-billboard.css';

/** Illustrative example only: simulated checkout, no real payment, no Bitcoin address. */
const EXAMPLE = fromHostedCheckout({ id: 'cs_example_0001', status: 'simulation_paid', amount_sats: 25000, reference: 'example-order-123', expiresAt: '2025-01-01T12:30:00Z', environment: 'example' });
const LOOP = FEED_DURATION_SEC + 4; // 14s: print, hold, restart

export function HeroBillboard() {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement | null>(null);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [t, setT] = useState(reduced ? FEED_DURATION_SEC : 0);
  const running = !reduced && !paused && visible;

  useEffect(() => {
    const el = ref.current;
    const onVis = () => setVisible(!document.hidden && (el ? el.dataset.onscreen !== '0' : true));
    let io: IntersectionObserver | null = null;
    if (el && 'IntersectionObserver' in window) {
      io = new IntersectionObserver(([e]) => { el.dataset.onscreen = e.isIntersecting ? '1' : '0'; onVis(); });
      io.observe(el);
    }
    document.addEventListener('visibilitychange', onVis);
    return () => { io?.disconnect(); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  const tRef = useRef(t); tRef.current = t;
  useEffect(() => {
    if (reduced) { setT(FEED_DURATION_SEC); return; }
    if (!running) return;
    let raf = 0; let last: number | null = null; let cur = tRef.current;
    const tick = (now: number) => {
      if (last !== null) { cur = (cur + (now - last) / 1000) % LOOP; setT(Math.min(cur, FEED_DURATION_SEC)); }
      last = now; raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, reduced]);

  return (
    <div ref={ref} className="hb-wrap" data-testid="hero-billboard">
      <div className={`hb-turn rt-scope ${running ? '' : 'hb-paused'}`} aria-hidden="true">
        <TerminalHousing m={EXAMPLE} t={t} reduced={reduced} />
      </div>
      <div className="hb-meta">
        <span className="dl-tag">Illustrative example</span>
        <span className="dl-mono">simulated checkout · no real payment</span>
      </div>
      {!reduced && (
        <button type="button" className="hb-ctl" onClick={() => setPaused((p) => !p)} aria-pressed={paused} data-testid="button-billboard-motion">
          {paused ? <Play className="h-3.5 w-3.5" aria-hidden /> : <Pause className="h-3.5 w-3.5" aria-hidden />}
          {paused ? 'Play animation' : 'Pause animation'}
        </button>
      )}
      <p className="sr-only">Illustration: a point-of-sale terminal prints an example simulation receipt for 25,000 simulated sats. Example data only; no real payment.</p>
    </div>
  );
}

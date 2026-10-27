import { useEffect, useId, useState } from 'react';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { useCoinAudio } from '@/hooks/use-coin-audio';
import { LOGIN_HERO } from '@/lib/assets';

const COINS = Array.from({ length: 42 }, (_, i) => {
  const r = (n: number) => ((Math.sin((i + 1) * n) + 1) / 2);
  return { left: 2 + r(12.9898) * 94, size: 12 + Math.round(r(78.233) * 18), dur: 5 + r(3.7) * 6, delay: -r(9.1) * 14, spin: 4 + r(5.3) * 5, blur: r(2.1) > 0.75 };
});

function CoinSvg({ size }: { size: number }) {
  const gradientId = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden focusable="false">
      <defs>
        <radialGradient id={gradientId} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#ffd27a" /><stop offset="0.55" stopColor="#f7931a" /><stop offset="1" stopColor="#b85e09" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill={`url(#${gradientId})`} stroke="#8a4506" strokeWidth="1" />
      <circle cx="16" cy="16" r="11.5" fill="none" stroke="#ffe2a6" strokeOpacity="0.55" strokeWidth="0.8" />
      <path d="M13 9.5v13M15.5 8v2M15.5 22v2M12 10.5h5.2a2.6 2.6 0 0 1 0 5.2H12m0 0h5.8a2.9 2.9 0 0 1 0 5.8H12" fill="none" stroke="#3b1d02" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LoginBitcoinHero() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [paused, setPaused] = useState(false);
  const { sound, audioErr, toggleSound } = useCoinAudio();
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const fn = () => setReduced(mq.matches);
    mq.addEventListener('change', fn); return () => mq.removeEventListener('change', fn);
  }, []);
  const still = reduced || paused;

  return (
    <>
      <div aria-hidden className={`btc-rain pointer-events-none absolute inset-0 overflow-hidden ${still ? 'is-still' : ''}`}>
        {COINS.map((c, i) => (
          <span key={i} className="btc-drop" style={{ left: `${c.left}%`, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s`, opacity: c.blur ? 0.35 : 0.8, filter: c.blur ? 'blur(1.5px)' : undefined }}>
            <span className="btc-spin" style={{ animationDuration: `${c.spin}s` }}><CoinSvg size={c.size} /></span>
          </span>
        ))}
      </div>
      <figure className="btc-hero relative" data-testid="hero-bitcoin">
        <img src={LOGIN_HERO} alt="" aria-hidden className="aspect-[16/10] w-full rounded-[20px] border border-border object-cover" data-testid="img-login-hero" />
        <figcaption className="mt-2 text-[12px] text-muted-foreground">Decorative image{still ? ' · coin motion paused' : ''}. {sound ? 'Coin sound is looping.' : 'If autoplay is blocked, press play to listen.'}</figcaption>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={toggleSound} aria-pressed={sound} data-testid="button-toggle-coin-sound"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted aria-pressed:border-accent/60 aria-pressed:text-accent">
            {sound ? <Volume2 className="h-4 w-4" aria-hidden /> : <VolumeX className="h-4 w-4" aria-hidden />}
            {sound ? 'Mute coin rain sound' : 'Play coin rain sound'}
          </button>
          <button type="button" onClick={() => setPaused((p) => !p)} aria-pressed={paused} disabled={reduced} data-testid="button-toggle-coin-motion"
            title={reduced ? 'Motion reduced by system setting' : undefined}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50">
            {still ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
            {reduced ? 'Motion reduced' : paused ? 'Resume coins' : 'Pause coins'}
          </button>
        </div>
      </figure>
      {audioErr && <p role="status" className="mt-2 text-[11.5px] text-warn" data-testid="text-audio-error">{audioErr}</p>}
    </>
  );
}

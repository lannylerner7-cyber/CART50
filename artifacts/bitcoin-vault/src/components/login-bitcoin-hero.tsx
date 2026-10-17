import { useEffect, useId, useRef, useState } from 'react';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';

const COINS = Array.from({ length: 14 }, (_, i) => {
  const r = (n: number) => ((Math.sin((i + 1) * n) + 1) / 2);
  return { left: 3 + r(12.9898) * 92, size: 14 + Math.round(r(78.233) * 16), dur: 7 + r(3.7) * 7, delay: -r(9.1) * 14, spin: 4 + r(5.3) * 5, blur: r(2.1) > 0.75 };
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

type AudioRig = { ctx: AudioContext; master: GainNode; noise: AudioBufferSourceNode; timer: number };

function useCoinRainAudio(ctx: AudioContext | null, onFail: (msg: string) => void) {
  const rig = useRef<AudioRig | null>(null);
  const failRef = useRef(onFail); failRef.current = onFail;

  useEffect(() => {
    if (!ctx) return;
    const master = ctx.createGain(); master.gain.value = 0.0001; master.connect(ctx.destination);
    master.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.6);
    // soft rain bed: filtered noise
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
    const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 0.6;
    const ng = ctx.createGain(); ng.gain.value = 0.06;
    noise.connect(bp).connect(ng).connect(master); noise.start();
    const clink = () => {
      if (ctx.state !== 'running') return;
      const t = ctx.currentTime; const base = 2400 + Math.random() * 2200;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09 + Math.random() * 0.05, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      g.connect(master);
      [1, 2.76, 5.4].forEach((m) => {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = base * m;
        o.connect(g); o.start(t); o.stop(t + 0.4);
        o.onended = () => o.disconnect();
      });
      window.setTimeout(() => g.disconnect(), 500);
    };
    const timer = window.setInterval(() => { if (Math.random() < 0.55) clink(); }, 260);
    rig.current = { ctx, master, noise, timer };
    ctx.resume().catch(() => failRef.current('The browser blocked audio playback.'));
    const onVis = () => {
      if (document.hidden) void ctx.suspend().catch(() => {});
      else void ctx.resume().catch(() => failRef.current('Audio paused. Tap the sound button to try again.'));
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.clearInterval(timer);
      try { noise.stop(); } catch { /* already stopped */ }
      noise.disconnect(); master.disconnect();
      void ctx.close().catch(() => {});
      rig.current = null;
    };
  }, [ctx]);
}

export function LoginBitcoinHero() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [paused, setPaused] = useState(false);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const sound = audioContext !== null;
  const [audioErr, setAudioErr] = useState<string | null>(null);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const fn = () => setReduced(mq.matches);
    mq.addEventListener('change', fn); return () => mq.removeEventListener('change', fn);
  }, []);
  useCoinRainAudio(audioContext, (m) => { setAudioErr(m); setAudioContext(null); });
  const toggleSound = () => {
    setAudioErr(null);
    if (audioContext) { setAudioContext(null); return; }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) { setAudioErr('Audio is not supported in this browser.'); return; }
    try {
      // Start within the tap event, required by Safari/iPad audio policies.
      const context = new Ctor();
      void context.resume().catch(() => {
        setAudioErr('The browser blocked audio playback. Tap sound to try again.');
        setAudioContext((current) => current === context ? null : current);
        void context.close().catch(() => {});
      });
      setAudioContext(context);
    } catch { setAudioErr('Audio could not be started.'); }
  };
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
      <div className="btc-hero relative mt-6 flex items-center gap-4" data-testid="hero-bitcoin">
        <div aria-hidden className={`btc-hero-coin pointer-events-none shrink-0 ${still ? 'is-still' : ''}`}>
          <CoinSvg size={72} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setPaused((p) => !p)} aria-pressed={paused} disabled={reduced} data-testid="button-toggle-coin-motion"
            title={reduced ? 'Motion reduced by system setting' : undefined}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-card/80 px-3.5 text-[12px] font-semibold text-muted-foreground backdrop-blur transition-colors hover:text-foreground disabled:opacity-50">
            {still ? <Play className="h-3.5 w-3.5" aria-hidden /> : <Pause className="h-3.5 w-3.5" aria-hidden />}
            {reduced ? 'Motion reduced' : paused ? 'Resume coins' : 'Pause coins'}
          </button>
          <button type="button" onClick={toggleSound} aria-pressed={sound} data-testid="button-toggle-coin-sound"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-card/80 px-3.5 text-[12px] font-semibold text-muted-foreground backdrop-blur transition-colors hover:text-foreground aria-pressed:border-[#f7931a]/60 aria-pressed:text-[#f7b14d]">
            {sound ? <Volume2 className="h-3.5 w-3.5" aria-hidden /> : <VolumeX className="h-3.5 w-3.5" aria-hidden />}
            {sound ? 'Sound on' : 'Coin rain sound'}
          </button>
        </div>
      </div>
      {audioErr && <p role="status" className="mt-2 text-[11.5px] text-warn" data-testid="text-audio-error">{audioErr}</p>}
    </>
  );
}

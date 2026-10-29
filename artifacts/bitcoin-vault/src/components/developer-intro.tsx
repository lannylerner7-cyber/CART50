import { useEffect, useRef, useState } from 'react';
import { Pause, Play, SkipForward } from 'lucide-react';
import { DEVELOPER_INTRO_POSTER, DEVELOPER_INTRO_VIDEO, DEVELOPER_INTRO_WEBM, LOGIN_HERO } from '@/lib/assets';
import { useReducedMotion } from '@/components/developer-frame';
import { cn } from '@/lib/utils';

type Mode = 'playing' | 'paused' | 'ended' | 'still';

/**
 * Portrait intro clip (9:16) framed rather than stretched. Muted, inline, skippable.
 * Reduced motion, decode errors and blocked autoplay all fall back to the poster.
 * Never gates navigation: CTAs render beside it regardless of playback.
 */
export function DeveloperIntro({ video = DEVELOPER_INTRO_VIDEO, poster = DEVELOPER_INTRO_POSTER, fallbackPoster = LOGIN_HERO }: { video?: string | null; poster?: string | null; fallbackPoster?: string }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLVideoElement>(null);
  const [posterSrc, setPosterSrc] = useState(poster || fallbackPoster);
  const [mode, setMode] = useState<Mode>(reduced || !video ? 'still' : 'paused');
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (reduced) { ref.current?.pause(); setMode('still'); setNote('Motion reduced: showing a still frame.'); return; }
    const v = ref.current;
    if (!v || !video) return;
    v.play().then(() => setMode('playing')).catch(() => { setMode('still'); setNote('Autoplay was blocked. Press play to watch the intro.'); });
  }, [reduced, video]);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (mode === 'playing') { v.pause(); setMode('paused'); return; }
    if (mode === 'ended') v.currentTime = 0;
    setNote(null);
    v.play().then(() => setMode('playing')).catch(() => { setMode('still'); setNote('Playback is unavailable in this browser.'); });
  };
  const skip = () => { ref.current?.pause(); setMode('still'); setNote(null); };

  const showVideo = !!video && mode !== 'still';

  return (
    <figure className="relative mx-auto w-full max-w-[min(420px,calc(68dvh*9/16))]" data-testid="figure-developer-intro">
      <div className="relative aspect-[9/16] overflow-hidden rounded-[28px] border border-card-border bg-sidebar shadow-[0_30px_60px_-30px_hsl(220_30%_5%/0.7)]">
        <img src={posterSrc} alt="main_vault developer access" onError={() => setPosterSrc(fallbackPoster)} className="absolute inset-0 h-full w-full object-cover" data-testid="img-intro-poster" />
        {video && (
          <video
            ref={ref}
            src={video}
            poster={posterSrc}
            muted
            playsInline
            preload={reduced ? 'none' : 'metadata'}
            onEnded={() => setMode('ended')}
            onError={() => { setMode('still'); setNote(null); }}
            aria-hidden={!showVideo}
            className={cn('absolute inset-0 h-full w-full object-contain transition-opacity duration-500', showVideo ? 'opacity-100' : 'opacity-0')}
            data-testid="video-developer-intro"
          />
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-sidebar/90 to-transparent" />
        <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2">
          {video && !reduced ? (
            <button type="button" onClick={toggle} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-card/90 px-3.5 text-[12.5px] font-semibold backdrop-blur" aria-label={mode === 'playing' ? 'Pause intro' : 'Play intro'} data-testid="button-intro-toggle">
              {mode === 'playing' ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{mode === 'playing' ? 'Pause' : mode === 'ended' ? 'Replay' : 'Play'}
            </button>
          ) : <span />}
          {showVideo && mode !== 'ended' && (
            <button type="button" onClick={skip} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-card/90 px-3.5 text-[12.5px] font-semibold backdrop-blur" data-testid="button-intro-skip">
              Skip intro <SkipForward className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {note && <figcaption role="status" className="mt-2 text-center text-[12px] text-muted-foreground" data-testid="status-intro">{note}</figcaption>}
    </figure>
  );
}

/**
 * First-arrival gate: the portrait clip plays full screen before sign-in/apply UI.
 * Ends on clip end. Playback problems offer retry/continue,
 * never pretend the clip finished. Reduced motion bypasses the intro.
 */
export function DeveloperIntroGate({ onDone, video = DEVELOPER_INTRO_VIDEO, poster = DEVELOPER_INTRO_POSTER, fallbackPoster = LOGIN_HERO }: { onDone: () => void; video?: string | null; poster?: string | null; fallbackPoster?: string }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLVideoElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [posterSrc, setPosterSrc] = useState(poster || fallbackPoster);
  const [leaving, setLeaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const closing = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const finish = useRef(() => {
    if (closing.current) return;
    closing.current = true;
    ref.current?.pause();
    setLeaving(true);
    closeTimer.current = setTimeout(() => doneRef.current(), 350);
  }).current;

  useEffect(() => {
    if (reduced || !video) { doneRef.current(); return; }
    dialogRef.current?.focus();
    const v = ref.current;
    let active = true;
    let started = false;
    const startTimer = setTimeout(() => { if (active && !started) setProblem('The intro is taking longer to load. You can retry or continue.'); }, 12000);
    v?.play().then(() => { if (active) { started = true; setProblem(null); } }).catch(() => {
      if (active) setProblem('Automatic playback is unavailable. Press Play intro or continue.');
    });
    return () => { active = false; clearTimeout(startTimer); clearTimeout(closeTimer.current); v?.pause(); };
  }, [reduced, video, finish]);

  if (reduced || !video) return null;
  const retry = () => {
    const v = ref.current; if (!v) return;
    if (v.error) v.load();
    setProblem(null);
    void v.play().catch(() => {
      setProblem('This browser could not play the intro. You can continue to the homepage.');
    });
  };

  return (
    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="main_vault developer intro" className={cn('fixed inset-0 z-[100] grid place-items-center overflow-hidden bg-sidebar transition-opacity duration-300', leaving ? 'opacity-0' : 'opacity-100')} data-testid="overlay-developer-intro">
      <img src={posterSrc} alt="" aria-hidden onError={() => setPosterSrc(fallbackPoster)} className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl" />
      <div className="relative aspect-[9/16] h-full max-h-[100dvh] max-w-full">
        <video ref={ref} poster={posterSrc} muted playsInline preload="auto" onEnded={finish}
          onTimeUpdate={e => { const v=e.currentTarget; if(Number.isFinite(v.duration)&&v.duration>0)setProgress(v.currentTime/v.duration); }}
          onError={() => { setProblem('The intro could not load or decode. Retry playback or continue to the homepage.'); }}
          className="h-full w-full object-contain" data-testid="video-developer-intro-gate">
          {video===DEVELOPER_INTRO_VIDEO && <source src={DEVELOPER_INTRO_WEBM} type="video/webm" />}
          <source src={video ?? undefined} type={video===DEVELOPER_INTRO_VIDEO ? 'video/mp4' : undefined} />
        </video>
      </div>
      <div className="absolute inset-x-0 top-0 h-1 bg-white/10"><div className="h-full bg-emerald-300 transition-[width]" style={{width:`${progress*100}%`}} /></div>
      <div className="absolute inset-x-0 bottom-24 px-5 text-center">
        {problem && <p role="status" className="mx-auto mb-3 max-w-md rounded-xl bg-black/85 p-3 text-sm text-white">{problem}</p>}
      </div>
      {problem && <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-sidebar/90 to-transparent px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-10">
        <button type="button" onClick={retry} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-card/90 px-4 text-[13px] font-semibold backdrop-blur" data-testid="button-intro-gate-retry">
          <Play className="h-4 w-4" /> Play intro
        </button>
        <button type="button" onClick={finish} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-5 text-[13px] font-bold text-primary-foreground" data-testid="button-intro-gate-recovery">
          Continue to homepage
        </button>
      </div>}
    </div>
  );
}

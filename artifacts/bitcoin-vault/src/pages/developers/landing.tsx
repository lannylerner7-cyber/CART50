import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { ArrowRight, FileText, KeyRound, Lock, Pause, Play, RotateCcw, ShieldCheck, Wallet, Zap } from 'lucide-react';
import { DevTopBar } from '@/components/developer-frame';
import { asset } from '@/lib/assets';
import { nextStep, useDev } from '@/lib/developer';
import './landing.css';

const F = (n: string) => asset(`assets/strongroom/developer/${n}.jpg`);
const FRAMES = [
  { src: F('storm'), alt: 'Storm clouds over a cracked stone floor', cap: 'The storm gathers' },
  { src: F('rocks'), alt: 'Rocks lifting off the ground', cap: 'The ground lifts' },
  { src: F('strike'), alt: 'Green lightning striking the floor', cap: 'Lightning hits the Sandbox' },
  { src: F('orb'), alt: 'Stone mascot inside a glowing orb marked $3000 bonus', cap: 'Your simulated balance' },
  { src: F('bonus'), alt: 'Stone mascot above a $3000 bonus sign', cap: 'Ready to practice' },
];

function useReduced() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    setR(m.matches);
    const h = () => setR(m.matches);
    m.addEventListener('change', h);
    return () => m.removeEventListener('change', h);
  }, []);
  return r;
}

function Reveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) { setOn(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`dl-reveal ${on ? 'in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
}

function StoryPhone() {
  const reduced = useReduced();
  const [i, setI] = useState(reduced ? 4 : 0);
  const [playing, setPlaying] = useState(!reduced);
  useEffect(() => { if (reduced) { setI(4); setPlaying(false); } }, [reduced]);
  useEffect(() => {
    if (!playing) return;
    if (i >= FRAMES.length - 1) { setPlaying(false); return; }
    const t = setTimeout(() => setI((x) => x + 1), 1900);
    return () => clearTimeout(t);
  }, [i, playing]);
  const done = i === FRAMES.length - 1 && !playing;
  return (
    <figure className="dl-stage relative mx-auto w-[min(72vw,320px)] md:w-[min(34vw,340px)]">
      <div className="dl-phone dl-float">
        {FRAMES.map((f, k) => <img key={f.src} src={f.src} alt={k === i ? f.alt : ''} aria-hidden={k !== i} className={k === i ? 'on' : ''} loading={k < 2 ? 'eager' : 'lazy'} />)}
        <div className="absolute inset-x-0 top-0 flex gap-1 p-3" aria-hidden>
          {FRAMES.map((f, k) => <span key={f.src} className="h-[3px] flex-1 rounded-full transition-colors" style={{ background: k <= i ? 'hsl(138 88% 58%)' : 'hsl(140 20% 95% / .2)' }} />)}
        </div>
        <div className="dl-mono absolute left-3 top-6 text-[10.5px] uppercase tracking-[0.18em] text-[hsl(140_20%_95%/.85)]" aria-live="polite">
          {String(i + 1).padStart(2, '0')} / 05 · {FRAMES[i].cap}
        </div>
        {i >= 3 && <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-[hsl(160_14%_4%/.78)] p-3 text-[12px] leading-snug backdrop-blur" data-testid="text-bonus-disclosure-phone">
          <b className="dl-volt">Simulation credit.</b> The $3,000 bonus is a Sandbox balance for testing, not real BTC or cash, and cannot be withdrawn.
        </div>}
      </div>
      <div className="mt-5 flex justify-center">
        <button type="button" className="dl-ghost !min-h-10 !px-4 text-[13px]" onClick={() => done ? (setI(0), setPlaying(true)) : setPlaying((p) => !p)} data-testid="button-story-toggle"
          aria-label={done ? 'Replay intro frames' : playing ? 'Pause intro frames' : 'Play intro frames'}>
          {done ? <><RotateCcw className="h-4 w-4" /> Replay storm</> : playing ? <><Pause className="h-4 w-4" /> Pause</> : <><Play className="h-4 w-4" /> Play</>}
        </button>
      </div>
      <figcaption className="sr-only">Still frames from the main_vault developer intro.</figcaption>
    </figure>
  );
}

const ROCKS = [[8, 14, 0], [18, 9, 2.5], [82, 16, 1], [91, 10, 4], [70, 8, 6], [30, 6, 5]];
const STEPS = [
  { img: 'rocks', n: '01', t: 'Apply', b: 'Read the terms in full, then share a name and an email. That is all we ask.' },
  { img: 'strike', n: '02', t: 'Verify + passkey', b: 'Confirm with a one-time key, then enroll a passkey before anything opens.' },
  { img: 'orb', n: '03', t: 'Practice', b: 'Your own Sandbox balance, history and destination. Run checkout flows end to end.' },
  { img: 'bonus', n: '04', t: 'Request Live', b: 'Real payments need explicit approval and readiness checks, requested separately.' },
];
const PILLARS = [
  { i: Wallet, t: 'Separate ledger', b: 'Simulated BTC per account. No owner balance is visible or reachable.' },
  { i: ShieldCheck, t: 'Passkey required', b: 'Every account enrolls a passkey before the Sandbox opens.' },
  { i: Lock, t: 'Live stays locked', b: 'Real payments need explicit approval and readiness checks.' },
  { i: FileText, t: 'Plain terms', b: 'Read them in full before you share a name and email.' },
];

export function Landing({ prefix = '' }: { prefix?: string }) {
  const { session } = useDev();
  const authed = session.authenticated;
  const primary = authed
    ? <Link href={prefix + nextStep(session)} className="dl-btn" data-testid="link-resume">Resume setup <ArrowRight className="h-4 w-4" aria-hidden /></Link>
    : <Link href={prefix + '/apply'} className="dl-btn" data-testid="link-apply">Apply for Sandbox <ArrowRight className="h-4 w-4" aria-hidden /></Link>;

  return (
    <div className="dl pb-16">
      <a href="#dl-main" className="dl-skip" data-testid="link-skip">Skip to content</a>
      <div className="dl-clouds" style={{ backgroundImage: `url(${F('storm')})` }} aria-hidden />
      <div className="dl-flash" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[100vh] overflow-hidden" aria-hidden>
        {ROCKS.map(([l, s, d]) => <span key={l} className="dl-rock" style={{ left: `${l}%`, bottom: 0, width: s, height: s * 0.8, animationDelay: `${d}s` }} />)}
      </div>
      <div className="relative">
        <DevTopBar right={authed
          ? <Link href={prefix + nextStep(session)} className="pill-btn" data-testid="link-continue-setup">Continue</Link>
          : <Link href={prefix + '/login'} className="pill-btn" data-testid="link-header-login">Sign in</Link>} />
      </div>

      <main id="dl-main" className="relative mx-auto w-full max-w-[1180px] px-5 md:px-8">
        {/* Hero */}
        <section className="grid items-center gap-12 pt-8 md:grid-cols-[1.2fr_0.8fr] md:gap-8 md:pt-14 lg:pt-20" aria-labelledby="dl-hero">
          <div>
            <div className="rise inline-flex items-center gap-2 rounded-full border border-[hsl(138_88%_58%/.35)] bg-[hsl(138_88%_58%/.06)] px-3 py-1.5 dl-eyebrow">
              <Zap className="h-3.5 w-3.5" aria-hidden /> Bitcoin checkout Sandbox
            </div>
            <h1 id="dl-hero" className="rise rise-1 dl-display mt-6 text-[2.9rem] font-extrabold leading-[0.9] sm:text-[4rem] lg:text-[5.6rem]">
              Break your<br />checkout <span className="dl-volt">here</span>,<br /><span className="text-[hsl(140_20%_95%/.55)]">not in Live.</span>
            </h1>
            <p className="rise rise-2 mt-6 max-w-[46ch] text-[17px] leading-relaxed dl-ash">
              A private, simulated Bitcoin ledger for every developer. Create checkouts, simulate payments and watch status change, all before you ask for Live.
            </p>
            <div className="rise rise-3 mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {primary}
              <Link href={prefix + '/login'} className="dl-ghost" data-testid="link-login">I have an account</Link>
            </div>
            <dl className="rise rise-4 mt-10 grid max-w-[520px] grid-cols-3 gap-4 border-t border-[hsl(140_20%_90%/.12)] pt-5">
              {[['Ledger', 'Simulated'], ['Access', 'Passkey'], ['Live', 'Approval only']].map(([k, v]) => (
                <div key={k}><dt className="dl-mono text-[10.5px] uppercase tracking-[0.18em] text-[hsl(200_8%_58%)]">{k}</dt><dd className="mt-1 text-[14px] font-semibold">{v}</dd></div>
              ))}
            </dl>
          </div>
          <StoryPhone />
        </section>

        {/* Steps */}
        <section className="mt-24 md:mt-32" aria-labelledby="dl-how">
          <Reveal className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="dl-eyebrow">How it works</div>
              <h2 id="dl-how" className="dl-display mt-3 max-w-[16ch] text-[2.2rem] font-bold leading-[0.95] md:text-[3.2rem]">From storm to strike in four steps.</h2>
            </div>
            <p className="max-w-[36ch] text-[15px] dl-ash">Start with the terms, verify your email and set up your passkey. No wallet to fund.</p>
          </Reveal>
          <div className="dl-rule mt-8" />
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, k) => (
              <li key={s.n} className="dl-step" data-testid={`card-step-${s.n}`}>
                <Reveal className="dl-card h-full overflow-hidden" delay={k * 90}>
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <img src={F(s.img)} alt="" loading="lazy" className="h-full w-full object-cover object-[50%_40%]" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[hsl(160_12%_9%)] via-transparent to-transparent" />
                    <span className="dl-mono absolute left-4 top-3 text-[2rem] font-semibold leading-none dl-volt">{s.n}</span>
                  </div>
                  <div className="p-5 pt-3"><h3 className="dl-display text-[1.35rem] font-bold">{s.t}</h3><p className="mt-1.5 text-[14px] leading-relaxed text-[hsl(200_8%_70%)]">{s.b}</p></div>
                </Reveal>
              </li>
            ))}
          </ol>
        </section>

        {/* Bonus + pillars */}
        <section className="mt-24 grid gap-10 md:mt-32 md:grid-cols-[0.85fr_1.15fr] md:items-center lg:gap-16" aria-labelledby="dl-bonus">
          <Reveal>
            <figure className="relative overflow-hidden rounded-[28px] border border-[hsl(138_88%_58%/.3)]">
              <img src={F('bonus')} alt="Stone mascot above the $3000 bonus sign" loading="lazy" className="aspect-[4/5] w-full object-cover" />
              <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[hsl(160_14%_4%/.95)] via-[hsl(160_14%_4%/.7)] to-transparent p-5 pt-20 md:p-6 md:pt-24">
                <div className="dl-eyebrow">Simulation credit only</div>
                <div className="dl-display mt-1 text-[2.1rem] font-extrabold leading-none md:text-[2.5rem]">$3,000 to break things with.</div>
                <p className="mt-3 text-[13px] leading-snug text-[hsl(140_20%_95%/.8)]" data-testid="text-bonus-disclosure">
                  Sandbox balance for testing only. Not real BTC, not cash, cannot be withdrawn.
                </p>
              </figcaption>
            </figure>
          </Reveal>
          <Reveal delay={100}>
            <div className="dl-eyebrow">What you get</div>
            <h2 id="dl-bonus" className="dl-display mt-3 text-[2rem] font-bold leading-[1.02] md:text-[2.8rem]">A real-feeling checkout. <span className="dl-volt">A simulated ledger.</span></h2>
            <p className="mt-4 max-w-[50ch] text-[16px] leading-relaxed dl-ash">Create checkouts, trigger payments explicitly and inspect each status change. Your account is fenced off from the owner's wallet, keys and funds.</p>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {PILLARS.map((x) => (
                <li key={x.t} className="dl-card p-5">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-[hsl(138_88%_58%/.1)]"><x.i className="h-4 w-4 dl-volt" aria-hidden /></span>
                  <h3 className="mt-3 text-[15px] font-semibold">{x.t}</h3>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-[hsl(200_8%_68%)]">{x.b}</p>
                </li>
              ))}
            </ul>
          </Reveal>
        </section>

        {/* Flow preview */}
        <section className="mt-24 md:mt-32" aria-labelledby="dl-flow">
          <Reveal className="grid gap-8 md:grid-cols-[0.9fr_1.1fr] md:items-center">
            <div>
              <div className="dl-eyebrow">The practice loop</div>
              <h2 id="dl-flow" className="dl-display mt-3 text-[2rem] font-bold leading-[1.02] md:text-[2.6rem]">Create. Simulate. Inspect. Repeat.</h2>
              <p className="mt-4 max-w-[44ch] text-[15.5px] leading-relaxed dl-ash">Explicitly simulate a payment, then inspect how your app responds to the checkout status. Practice without moving real Bitcoin.</p>
            </div>
            <div className="dl-term p-5 text-[13px] leading-[1.9] md:p-6" role="img" aria-label="Illustrative checkout lifecycle: created, payment simulated, status updated">
              <div className="mb-3 flex items-center gap-2 border-b border-[hsl(140_20%_90%/.1)] pb-3 dl-mono text-[11px] uppercase tracking-[0.18em] text-[hsl(200_8%_55%)]">
                <KeyRound className="h-3.5 w-3.5 dl-volt" aria-hidden /> illustrative sandbox flow
              </div>
              <div className="dl-mono"><span className="dl-volt">01</span> <span className="text-[hsl(200_8%_55%)]">checkout</span> created</div>
              <div className="dl-mono"><span className="dl-volt">02</span> <span className="text-[hsl(200_8%_55%)]">payment</span> simulated by you</div>
              <div className="dl-mono"><span className="dl-volt">03</span> <span className="text-[hsl(200_8%_55%)]">status</span> updated in your ledger</div>
              <div className="dl-mono text-[hsl(200_8%_55%)]"><span className="dl-volt">--</span> live mode: locked</div>
            </div>
          </Reveal>
        </section>

        {/* Final CTA */}
        <section className="relative mt-24 overflow-hidden rounded-[32px] dl-card px-6 py-16 text-center md:mt-32 md:py-24" aria-labelledby="dl-cta">
          <img src={F('strike')} alt="" aria-hidden loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-30" />
          <div className="absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_100%,hsl(160_14%_4%/.2),hsl(160_14%_4%/.85))]" aria-hidden />
          <div className="relative">
            <div className="dl-eyebrow">Your Sandbox is waiting</div>
            <h2 id="dl-cta" className="dl-display mx-auto mt-3 max-w-[15ch] text-[2.4rem] font-extrabold leading-[0.95] md:text-[4rem]">Let the lightning hit the Sandbox.</h2>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">{primary}<Link href={prefix + '/login'} className="dl-ghost" data-testid="link-cta-login">Sign in</Link></div>
          </div>
        </section>
        <footer className="mt-10 flex flex-col items-center gap-2 text-center dl-mono text-[11px] tracking-widest text-[hsl(200_8%_52%)]">
          <span>mainvaultwallet.com · developer sandbox</span>
          <span className="normal-case tracking-normal">Sandbox balances, including bonus credit, are simulated and have no monetary value.</span>
        </footer>
      </main>
    </div>
  );
}

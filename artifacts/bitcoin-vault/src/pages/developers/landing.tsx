import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { ArrowRight, FileText, Lock, Pause, Play, RotateCcw, ShieldCheck, Wallet, Zap } from 'lucide-react';
import { DevTopBar } from '@/components/developer-frame';
import { asset } from '@/lib/assets';
import { nextStep, useDev } from '@/lib/developer';
import './landing.css';

const F = (n: string) => asset(`assets/strongroom/developer/${n}.jpg`);
const FRAMES = [
  { src: F('storm'), alt: 'Storm clouds over a cracked stone floor' },
  { src: F('rocks'), alt: 'Rocks lifting off the ground' },
  { src: F('strike'), alt: 'Green lightning striking the floor' },
  { src: F('orb'), alt: 'Stone mascot inside a glowing orb marked $3000 bonus' },
  { src: F('bonus'), alt: 'Stone mascot above a $3000 bonus sign' },
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

function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) { setOn(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`dl-reveal ${on ? 'in' : ''} ${className}`}>{children}</div>;
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
    <figure className="relative mx-auto w-[min(78vw,330px)]">
      <div className="dl-phone dl-float" aria-live="polite">
        {FRAMES.map((f, k) => <img key={f.src} src={f.src} alt={k === i ? f.alt : ''} aria-hidden={k !== i} className={k === i ? 'on' : ''} loading={k < 2 ? 'eager' : 'lazy'} />)}
        <div className="absolute inset-x-0 top-0 flex gap-1 p-3">
          {FRAMES.map((f, k) => <span key={f.src} className="h-[3px] flex-1 rounded-full" style={{ background: k <= i ? 'hsl(138 88% 58%)' : 'hsl(0 0% 100% / .2)' }} />)}
        </div>
        {i >= 3 && <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-black/65 p-3 text-[11.5px] leading-snug backdrop-blur">
          <b className="dl-volt">Simulation credit.</b> The $3,000 bonus is a Sandbox balance for testing. It is not real BTC, cash or anything you can withdraw.
        </div>}
      </div>
      <div className="mt-4 flex justify-center gap-2">
        <button type="button" className="dl-ghost !h-10 !px-4 text-[13px]" onClick={() => done ? (setI(0), setPlaying(true)) : setPlaying((p) => !p)} data-testid="button-story-toggle">
          {done ? <><RotateCcw className="h-4 w-4" /> Replay storm</> : playing ? <><Pause className="h-4 w-4" /> Pause</> : <><Play className="h-4 w-4" /> Play</>}
        </button>
      </div>
      <figcaption className="sr-only">Still frames from the main_vault developer intro.</figcaption>
    </figure>
  );
}

const ROCKS = [[8, 14, 0], [18, 9, 2.5], [82, 16, 1], [91, 10, 4], [70, 8, 6], [30, 6, 5]];

export function Landing({ prefix = '' }: { prefix?: string }) {
  const { session } = useDev();
  const authed = session.authenticated;
  const primary = authed
    ? <Link href={prefix + nextStep(session)} className="dl-btn" data-testid="link-resume">Resume setup <ArrowRight className="h-4 w-4" /></Link>
    : <Link href={prefix + '/apply'} className="dl-btn" data-testid="link-apply">Apply for Sandbox <ArrowRight className="h-4 w-4" /></Link>;

  return (
    <div className="dl pb-16">
      <div className="dl-clouds" style={{ backgroundImage: `url(${F('storm')})` }} aria-hidden />
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {ROCKS.map(([l, s, d]) => <span key={l} className="dl-rock" style={{ left: `${l}%`, bottom: 0, width: s, height: s * 0.8, animationDelay: `${d}s` }} />)}
      </div>
      <div className="relative">
        <DevTopBar right={authed
          ? <Link href={prefix + nextStep(session)} className="pill-btn" data-testid="link-continue-setup">Continue</Link>
          : <Link href={prefix + '/login'} className="pill-btn" data-testid="link-header-login">Sign in</Link>} />
      </div>

      <main className="relative mx-auto w-full max-w-[1180px] px-5 md:px-8">
        <section className="grid items-center gap-12 pt-10 md:grid-cols-[1.15fr_0.85fr] md:pt-16">
          <div>
            <div className="rise inline-flex items-center gap-2 rounded-full border border-[hsl(138_88%_58%/.35)] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.2em] dl-volt">
              <Zap className="dl-bolt-static h-3.5 w-3.5" /> Bitcoin checkout Sandbox
            </div>
            <h1 className="rise rise-1 dl-display mt-5 text-[3rem] font-extrabold leading-[0.92] sm:text-[4rem] lg:text-[5.4rem]">
              Break your<br />checkout <span className="dl-volt">here</span>,<br />not in Live.
            </h1>
            <p className="rise rise-2 mt-6 max-w-[48ch] text-[16.5px] leading-relaxed text-[hsl(200_8%_72%)]">
              A private, simulated Bitcoin ledger for every developer. Create checkouts, simulate payments and inspect their status. Nothing touches the owner's wallet, keys or funds, and Live stays locked until it is separately approved.
            </p>
            <div className="rise rise-3 mt-8 flex flex-wrap gap-3">
              {primary}
              <Link href={prefix + '/login'} className="dl-ghost" data-testid="link-login">I have an account</Link>
            </div>
            <p className="rise rise-4 mt-5 max-w-[50ch] text-[12.5px] text-[hsl(200_8%_60%)]">
              The $3,000 bonus shown in our intro is simulation credit inside the Sandbox. It is not real BTC, not cash and cannot be withdrawn.
            </p>
          </div>
          <StoryPhone />
        </section>

        <section className="mt-28" aria-labelledby="dl-how">
          <Reveal>
            <h2 id="dl-how" className="dl-display max-w-[18ch] text-[2.2rem] font-bold leading-none md:text-[3rem]">From storm to strike in four steps.</h2>
          </Reveal>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { img: 'rocks', n: '01', t: 'Apply', b: 'Read the terms in full, then share a name and an email. That is all we ask.' },
              { img: 'strike', n: '02', t: 'Verify + passkey', b: 'Confirm with a one-time key, then enroll a passkey before anything opens.' },
              { img: 'orb', n: '03', t: 'Practice', b: 'Your own Sandbox balance, history and destination. Practice checkout flows in your own account.' },
              { img: 'bonus', n: '04', t: 'Request Live', b: 'Real payments need explicit approval and readiness checks. Separately.' },
            ].map((s, k) => (
              <li key={s.n} className="dl-step">
                <Reveal className="dl-card h-full overflow-hidden" >
                  <div className="relative aspect-[4/3] overflow-hidden" style={{ transitionDelay: `${k * 80}ms` }}>
                    <img src={F(s.img)} alt="" loading="lazy" className="h-full w-full object-cover object-[50%_40%]" />
                    <span className="absolute left-3 top-3 font-mono text-[11px] tracking-widest dl-volt">{s.n}</span>
                  </div>
                  <div className="p-5"><div className="dl-display text-[1.3rem] font-bold">{s.t}</div><p className="mt-1.5 text-[13.5px] text-[hsl(200_8%_68%)]">{s.b}</p></div>
                </Reveal>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-28 grid gap-10 md:grid-cols-[0.9fr_1.1fr] md:items-center">
          <Reveal>
            <div className="relative overflow-hidden rounded-[28px] border border-[hsl(138_88%_58%/.3)]">
              <img src={F('bonus')} alt="Stone mascot above the $3000 bonus sign" loading="lazy" className="aspect-[4/5] w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-5 pt-16">
                <div className="font-mono text-[11px] uppercase tracking-[0.2em] dl-volt">Simulation credit only</div>
                <div className="dl-display text-[2.4rem] font-extrabold leading-none">$3,000 to break things with.</div>
              </div>
            </div>
          </Reveal>
          <Reveal>
            <h2 className="dl-display text-[2rem] font-bold leading-tight md:text-[2.6rem]">Built for practice. <span className="dl-volt">Not real payments.</span></h2>
            <p className="mt-4 max-w-[52ch] text-[15.5px] text-[hsl(200_8%_70%)]">Sandbox credit lives only in your simulated ledger. Practice checkout creation, explicit payment simulation and status updates without spending real Bitcoin. It has no cash value and never converts to BTC.</p>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {[
                { i: Wallet, t: 'Separate ledger', b: 'Simulated BTC per account. No owner balance is visible or reachable.' },
                { i: ShieldCheck, t: 'Passkey required', b: 'Every account enrolls a passkey before the Sandbox opens.' },
                { i: Lock, t: 'Live stays locked', b: 'Real payments need explicit approval and readiness checks.' },
                { i: FileText, t: 'Plain terms', b: 'Read them in full before you share a name and email.' },
              ].map((x) => (
                <li key={x.t} className="dl-card p-4">
                  <x.i className="h-4 w-4 dl-volt" />
                  <div className="mt-2 text-[14.5px] font-semibold">{x.t}</div>
                  <div className="mt-0.5 text-[13px] text-[hsl(200_8%_66%)]">{x.b}</div>
                </li>
              ))}
            </ul>
          </Reveal>
        </section>

        <section className="relative mt-28 overflow-hidden rounded-[32px] dl-card px-6 py-14 text-center md:py-20">
          <img src={F('strike')} alt="" aria-hidden loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-25" />
          <div className="relative">
            <h2 className="dl-display mx-auto max-w-[16ch] text-[2.4rem] font-extrabold leading-none md:text-[3.6rem]">Let the lightning hit the Sandbox.</h2>
            <div className="mt-8 flex flex-wrap justify-center gap-3">{primary}<Link href={prefix + '/login'} className="dl-ghost">Sign in</Link></div>
            <p className="mt-5 text-[12px] text-[hsl(200_8%_62%)]">Sandbox balances, including any bonus credit, are simulated and have no monetary value.</p>
          </div>
        </section>
        <footer className="mt-10 text-center font-mono text-[11px] tracking-widest text-[hsl(200_8%_50%)]">mainvaultwallet.com · developer sandbox</footer>
      </main>
    </div>
  );
}

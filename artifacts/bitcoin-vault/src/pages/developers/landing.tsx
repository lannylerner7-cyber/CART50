import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { ArrowRight, BookOpen, Code2, FileText, Fingerprint, KeyRound, Link2, Mail, QrCode, Repeat, Scale, Shield, ShieldCheck, Webhook } from 'lucide-react';
import { DevTopBar } from '@/components/developer-frame';
import { BRAND_MARK } from '@/lib/assets';
import { nextStep, useDev } from '@/lib/developer';
import { HeroBillboard } from './hero-billboard';
import './landing.css';

function Reveal({ children, className = '', delay = 0, from = 'up' }: { children: ReactNode; className?: string; delay?: number; from?: 'up' | 'left' | 'right' }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) { setOn(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`dl-reveal ${from} ${on ? 'in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
}

function Example() { return <span className="dl-tag">Example</span>; }

const CAPS = [
  { i: Code2, t: 'One server call', b: 'Create a session with integer satoshis, your reference and an approved HTTPS return URL. The response carries the hosted URL.' },
  { i: Repeat, t: 'Idempotent by design', b: 'Send an Idempotency-Key. The same key and body return the original session; a different body returns 409.' },
  { i: QrCode, t: 'Hosted, status-only page', b: 'Shoppers land on a hosted checkout. Its QR encodes the checkout URL, never a Bitcoin payment request.' },
  { i: Webhook, t: 'Signed webhooks', b: 'HMAC-SHA256 over timestamp and raw body. Delivery is at least once, retried with bounded backoff.' },
  { i: Fingerprint, t: 'Passkey-gated keys', b: 'Test keys are checkout-only, hashed at rest, expire after 90 days and require a recent passkey to issue.' },
  { i: ShieldCheck, t: 'Explicit simulation', b: 'Only your authenticated simulate action marks a session paid, once. The shopper button only re-checks status.' },
];

const FLOW = [
  { n: '01', t: 'Create', b: 'Your backend calls POST /api/v1/checkout/sessions with a Bearer sk_test key.', code: 'Authorization: Bearer sk_test_…\nIdempotency-Key: order-123-v1' },
  { n: '02', t: 'Redirect', b: 'Send the shopper to the returned url. Sessions expire after 30 minutes.', code: '302 → session.url' },
  { n: '03', t: 'Simulate', b: 'From your console, explicitly simulate receipt. Duplicate calls never credit twice.', code: 'status: open → paid (simulation)' },
  { n: '04', t: 'Verify', b: 'Fulfil from the verified webhook, not from the return redirect.', code: 'checkout.simulation_paid\nverify v1 · dedupe by id' },
];

export function Landing({ prefix = '' }: { prefix?: string }) {
  const { session } = useDev();
  const authed = session.authenticated;
  const res = (h: string) => prefix + '/resources#' + h;
  const primary = authed
    ? <Link href={prefix + nextStep(session)} className="dl-btn" data-testid="link-resume">Resume setup <ArrowRight className="h-4 w-4" aria-hidden /></Link>
    : <Link href={prefix + '/apply'} className="dl-btn" data-testid="link-apply">Apply for access <ArrowRight className="h-4 w-4" aria-hidden /></Link>;

  return (
    <div className="dl pb-10">
      <a href="#dl-main" className="dl-skip" data-testid="link-skip">Skip to content</a>
      <div className="dl-grid" aria-hidden />
      <div className="relative">
        <DevTopBar right={authed
          ? <Link href={prefix + nextStep(session)} className="pill-btn" data-testid="link-continue-setup">Continue</Link>
          : <Link href={prefix + '/login'} className="pill-btn" data-testid="link-header-login">Sign in</Link>} />
      </div>

      <main id="dl-main" className="relative mx-auto w-full max-w-[1180px] px-5 md:px-8">
        <section className="dl-terminal-hero grid items-center gap-8 md:grid-cols-[1.05fr_0.95fr] md:gap-6" aria-labelledby="dl-hero">
          <div className="relative z-10 min-w-0">
            <div className="rise dl-eyebrow">Bitcoin checkout API</div>
            <h1 id="dl-hero" className="rise rise-1 dl-display mt-5 text-[2.7rem] font-extrabold leading-[0.95] sm:text-[3.6rem] lg:text-[4.6rem]">
              Bitcoin checkout,<br />built around <span className="dl-volt">your server.</span>
            </h1>
            <p className="rise rise-2 mt-6 max-w-[48ch] text-[17px] leading-relaxed dl-ash">
              Create a session from your backend, send shoppers to a hosted checkout, and confirm outcomes through signed webhooks. Build and test the full loop in an isolated simulation workspace.
            </p>
            <div className="rise rise-3 mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {primary}
              <Link href={res('documentation')} className="dl-ghost" data-testid="link-hero-docs"><BookOpen className="h-4 w-4" aria-hidden /> Read the docs</Link>
            </div>
            <p className="rise rise-4 mt-8 max-w-[52ch] border-l-2 border-[hsl(var(--volt)/.5)] pl-4 text-[13.5px] leading-relaxed dl-ash" data-testid="text-environment">
              Current environment: simulation only. Live access is not enabled and will be requested separately, subject to approval.
            </p>
          </div>
          <Reveal from="right" className="min-w-0"><HeroBillboard /></Reveal>
        </section>

        <section className="mt-28 md:mt-36" aria-labelledby="dl-caps">
          <Reveal className="grid gap-6 md:grid-cols-[1fr_1fr] md:items-end">
            <div>
              <div className="dl-eyebrow">Capabilities</div>
              <h2 id="dl-caps" className="dl-display mt-3 text-[2.1rem] font-bold leading-[1] md:text-[3rem]">Fewer moving parts between order and confirmation.</h2>
            </div>
            <p className="max-w-[44ch] text-[15.5px] leading-relaxed dl-ash md:justify-self-end">A small, explicit surface: one creation endpoint, one hosted page, one signed event. Each behaviour is documented and testable.</p>
          </Reveal>
          <div className="dl-rule mt-8" />
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CAPS.map((c, k) => (
              <li key={c.t}>
                <Reveal className="dl-card h-full p-6" delay={(k % 3) * 90} from={k % 2 ? 'right' : 'left'}>
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-[hsl(var(--volt)/.1)]"><c.i className="h-5 w-5 dl-volt" aria-hidden /></span>
                  <h3 className="mt-4 text-[16px] font-semibold">{c.t}</h3>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-[hsl(200_8%_68%)]">{c.b}</p>
                </Reveal>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-28 md:mt-36" aria-labelledby="dl-flow">
          <Reveal>
            <div className="dl-eyebrow">Integration</div>
            <h2 id="dl-flow" className="dl-display mt-3 max-w-[20ch] text-[2.1rem] font-bold leading-[1] md:text-[3rem]">Four steps from request to verified event.</h2>
          </Reveal>
          <ol className="dl-track mt-8" tabIndex={0} aria-label="Integration steps, scroll horizontally on small screens" data-testid="list-flow">
            {FLOW.map((s, k) => (
              <li key={s.n}>
                <Reveal className="dl-card flex h-full flex-col p-6" delay={k * 110} from="right">
                  <span className="dl-mono text-[1.8rem] font-semibold leading-none dl-volt">{s.n}</span>
                  <h3 className="dl-display mt-4 text-[1.4rem] font-bold">{s.t}</h3>
                  <p className="mt-1.5 flex-1 text-[14px] leading-relaxed text-[hsl(200_8%_68%)]">{s.b}</p>
                  <pre className="dl-code mt-5 whitespace-pre-wrap p-3 text-[11.5px]">{s.code}</pre>
                </Reveal>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-24 grid gap-10 md:mt-32 md:grid-cols-[0.9fr_1.1fr] md:items-center" aria-labelledby="dl-verify">
          <Reveal from="left">
            <div className="dl-eyebrow">Webhook verification</div>
            <h2 id="dl-verify" className="dl-display mt-3 text-[2rem] font-bold leading-[1.02] md:text-[2.7rem]">Trust the signature, not the redirect.</h2>
            <p className="mt-4 max-w-[46ch] text-[15.5px] leading-relaxed dl-ash">A return URL tells you the shopper came back. The signed event tells you what happened. Verify the HMAC with constant-time comparison, reject stale timestamps and deduplicate by event id.</p>
            <ul className="mt-6 space-y-2 text-[14px]">
              {['Signing secret shown once, replaceable', 'Retries keep the event id and body', 'Public HTTPS endpoints on port 443'].map((x) => <li key={x} className="flex items-center gap-2"><Shield className="h-4 w-4 dl-volt" aria-hidden />{x}</li>)}
            </ul>
          </Reveal>
          <Reveal from="right" delay={100}>
            <div className="mb-2 flex justify-end"><Example /></div>
            <pre className="dl-code p-5" aria-label="Webhook verification checklist"><code>
<span className="c">{'// Verification checklist — not executable code'}</span>{'\n'}
{'01  Validate signature format and timestamp\n02  Reject stale or future timestamps\n03  HMAC-SHA256(timestamp + "." + raw body)\n04  Compare equal-length signatures in constant time\n05  Validate event type and deduplicate event ID\n06  Update test orders only'}
            </code></pre>
          </Reveal>
        </section>

        <section className="relative mt-28 overflow-hidden rounded-[32px] dl-card px-6 py-16 text-center md:mt-36 md:py-20" aria-labelledby="dl-cta">
          <div className="absolute inset-0 bg-[radial-gradient(60%_90%_at_50%_120%,hsl(var(--volt)/.16),transparent)]" aria-hidden />
          <div className="relative">
            <div className="dl-eyebrow">Get started</div>
            <h2 id="dl-cta" className="dl-display mx-auto mt-3 max-w-[18ch] text-[2.2rem] font-extrabold leading-[1] md:text-[3.4rem]">Build your checkout flow against the simulation workspace.</h2>
            <p className="mx-auto mt-4 max-w-[46ch] text-[15px] dl-ash">Apply with a name and email, verify, enroll a passkey and issue a test key.</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">{primary}<Link href={prefix + '/login'} className="dl-ghost" data-testid="link-cta-login">Sign in</Link></div>
          </div>
        </section>

        <footer className="dl-card mt-10 p-6 md:p-10" data-testid="footer-landing">
          <div className="grid gap-10 md:grid-cols-[1.2fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-3"><img src={BRAND_MARK} alt="" className="h-9 w-9" /><div><div className="dl-display text-[18px] font-bold">main_vault</div><div className="text-[12px] dl-ash">Bitcoin checkout for developers</div></div></div>
              <p className="mt-4 max-w-[36ch] text-[13px] leading-relaxed dl-ash">Simulation environment. Balances and events have no monetary value.</p>
            </div>
            <nav aria-label="Legal">
              <div className="dl-eyebrow !text-[hsl(200_8%_60%)]">Legal</div>
              <ul className="mt-4 space-y-3 text-[14px]">
                {[[Scale, 'Terms', 'terms'], [FileText, 'Policy', 'policy'], [Shield, 'Privacy', 'privacy']].map(([I, l, h]) => {
                  const Icon = I as typeof Scale;
                  return <li key={h as string}><Link href={res(h as string)} className="inline-flex items-center gap-2 hover:text-[hsl(var(--volt))]" data-testid={`link-footer-${h}`}><Icon className="h-4 w-4 dl-ash" aria-hidden />{l as string}</Link></li>;
                })}
              </ul>
            </nav>
            <nav aria-label="Developers">
              <div className="dl-eyebrow !text-[hsl(200_8%_60%)]">Developers</div>
              <ul className="mt-4 space-y-3 text-[14px]">
                {[[BookOpen, 'Documentation', 'documentation'], [Link2, 'Integration', 'integration'], [Mail, 'Contact us', 'contact']].map(([I, l, h]) => {
                  const Icon = I as typeof Scale;
                  return <li key={h as string}><Link href={res(h as string)} className="inline-flex items-center gap-2 hover:text-[hsl(var(--volt))]" data-testid={`link-footer-${h}`}><Icon className="h-4 w-4 dl-ash" aria-hidden />{l as string}</Link></li>;
                })}
              </ul>
            </nav>
          </div>
          <div className="mt-8 flex flex-col gap-2 border-t border-[hsl(var(--line))] pt-5 text-[12px] dl-ash sm:flex-row sm:justify-between">
            <span className="dl-mono">mainvaultwallet.com</span>
            <span className="inline-flex items-center gap-1.5"><KeyRound className="h-3.5 w-3.5" aria-hidden /> Live access not enabled</span>
          </div>
        </footer>
      </main>
    </div>
  );
}

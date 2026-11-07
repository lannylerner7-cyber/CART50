import { useEffect } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, ArrowRight, Blocks, FlaskConical, Layers, Users } from 'lucide-react';
import { DevTopBar } from '@/components/developer-frame';
import './landing.css';

const NAV = [
  ['mainvault', 'What MainVault is', Blocks], ['model', 'How the model works', Layers],
  ['sandbox', 'About the Sandbox', FlaskConical], ['who', 'Who it is for', Users],
] as const;

/** Public, indexable explainer. No session data, no balances, no credentials. */
export default function About() {
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);
  return (
    <div className="dl pb-16">
      <a href="#dl-about" className="dl-skip">Skip to content</a>
      <DevTopBar right={<Link href="/" className="pill-btn" data-testid="link-about-home"><ArrowLeft className="h-4 w-4" aria-hidden /> Overview</Link>} />
      <div className="mx-auto grid w-full max-w-[1120px] grid-cols-1 gap-10 px-5 pt-10 md:grid-cols-[220px_minmax(0,1fr)] md:px-8">
        <nav aria-label="About" className="md:sticky md:top-6 md:self-start">
          <div className="dl-eyebrow">About</div>
          <ul className="mt-4 flex flex-wrap gap-2 md:flex-col md:gap-1">
            {NAV.map(([h, l, I]) => (
              <li key={h}><a href={'#' + h} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[14px] hover:bg-[hsl(140_20%_90%/.06)]" data-testid={`link-about-${h}`}><I className="h-4 w-4 dl-volt" aria-hidden />{l}</a></li>
            ))}
          </ul>
        </nav>
        <main id="dl-about" className="dl-prose min-w-0 space-y-8">
          <header>
            <div className="dl-eyebrow">About MainVault</div>
            <h1 className="dl-display mt-3 text-[2.2rem] font-extrabold leading-[1] md:text-[3rem]">A Bitcoin checkout API you can try end to end before anything real is at stake.</h1>
          </header>
          <section id="mainvault" className="dl-card p-6 md:p-8">
            <h2>What MainVault is</h2>
            <p>MainVault is a Bitcoin checkout service for developers. Your server creates a checkout session, the shopper pays on a hosted page, and your server learns the outcome through a signed webhook. The pieces you integrate are deliberately few: one authenticated API call to create a session, a redirect, and a webhook handler that verifies a signature.</p>
            <p>It is built around your backend. Secrets never leave your server, the hosted page carries no credentials, and nothing on the shopper's screen is treated as proof of payment.</p>
          </section>
          <section id="model" className="dl-card p-6 md:p-8">
            <h2>How the model works</h2>
            <h3>1. Sandbox first</h3>
            <p>Every developer account starts in the Sandbox. You apply with a name and email, verify, enrol a passkey and issue a test key. The Sandbox gives you a simulated balance, a wallet screen that mirrors the Live design, a checkout console and the same hosted checkout page and webhook format you will use later.</p>
            <h3>2. Pay a test checkout from a Sandbox wallet</h3>
            <p>A hosted checkout shows a Sandbox payment destination. Paste it into a Sandbox wallet, confirm the fixed amount, and the session settles: the payer is debited, the merchant is credited, the session becomes <code>simulation_paid</code>, the receipt prints and the signed <code>checkout.simulation_paid</code> event is queued. Your integration is exercised exactly the way a real order would be.</p>
            <h3>3. Review, then Live</h3>
            <p>When your integration behaves correctly in the Sandbox, you can apply for Live access from the console. Approval is recorded by the operator and Live activation is a separate step. Until then, no real Bitcoin is requested, received or sent through a developer account.</p>
          </section>
          <section id="sandbox" className="dl-card p-6 md:p-8">
            <h2>About the Sandbox</h2>
            <ul>
              <li>Balances are simulated and have no monetary value. The demo-credit view uses the exchange rate recorded when the workspace was created.</li>
              <li>Transfers only move between Sandbox accounts. They cannot reach a Bitcoin network or any personal vault.</li>
              <li>A test checkout can be settled from any Sandbox wallet, including your own. Duplicate confirmations never credit twice, and an interrupted transfer is completed or released automatically.</li>
              <li>Marking a session paid by hand remains available in the console as a fallback for automated tests that have no payer wallet.</li>
              <li>The operator can pause checkout creation and freeze, suspend or revoke developer access at any time.</li>
            </ul>
            <p>The full policy is on the <Link href="/resources/policy" className="underline" data-testid="link-about-policy">Sandbox policy</Link> page.</p>
          </section>
          <section id="who" className="dl-card p-6 md:p-8">
            <h2>Who it is for</h2>
            <p>Teams adding Bitcoin checkout to an existing store, developers evaluating an integration before committing to it, and anyone who wants to test order status, receipts and webhook handling without touching real funds.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/apply" className="dl-btn" data-testid="link-about-apply">Apply for access <ArrowRight className="h-4 w-4" aria-hidden /></Link>
              <Link href="/resources/documentation" className="dl-ghost" data-testid="link-about-docs">Read the documentation</Link>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

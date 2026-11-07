import { useEffect } from 'react';
import { Link, useParams } from 'wouter';
import { ArrowLeft, BookOpen, FileText, Info, Link2, Mail, Scale, Shield } from 'lucide-react';
import { DevTopBar } from '@/components/developer-frame';
import { useDev } from '@/lib/developer';
import { ApiGuide } from './api-guide';
import './landing.css';

const NAV = [
  ['terms', 'Terms', Scale], ['privacy', 'Privacy', Shield], ['policy', 'Sandbox policy', FileText],
  ['documentation', 'Documentation', BookOpen], ['integration', 'Integration', Link2], ['contact', 'Contact', Mail],
] as const;

/** One page, six sections. Each section also has its own indexable path (/resources/<section>). */
export default function Resources() {
  const { session } = useDev();
  const terms = session.terms;
  const { section } = useParams<{ section?: string }>();
  useEffect(() => {
    const id = section ?? window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [section]);

  return (
    <div className="dl pb-16">
      <a href="#dl-res" className="dl-skip">Skip to content</a>
      <DevTopBar right={<Link href="/" className="pill-btn" data-testid="link-resources-home"><ArrowLeft className="h-4 w-4" aria-hidden /> Overview</Link>} />
      <div className="mx-auto grid w-full max-w-[1120px] grid-cols-1 gap-10 px-5 pt-10 md:grid-cols-[220px_minmax(0,1fr)] md:px-8">
        <nav aria-label="Resources" className="md:sticky md:top-6 md:self-start">
          <div className="dl-eyebrow">Resources</div>
          <ul className="mt-4 flex flex-wrap gap-2 md:flex-col md:gap-1">
            {NAV.map(([h, l, I]) => (
              <li key={h}><Link href={'/resources/' + h} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[14px] hover:bg-[hsl(140_20%_90%/.06)] ${section === h ? 'bg-[hsl(140_20%_90%/.08)]' : ''}`} aria-current={section === h ? 'page' : undefined} data-testid={`link-resource-${h}`}><I className="h-4 w-4 dl-volt" aria-hidden />{l}</Link></li>
            ))}
            <li><Link href="/about" className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[14px] hover:bg-[hsl(140_20%_90%/.06)]" data-testid="link-resource-about"><Info className="h-4 w-4 dl-volt" aria-hidden />About MainVault</Link></li>
          </ul>
        </nav>
        <main id="dl-res" className="dl-prose min-w-0 space-y-8">
          <section id="terms" className="dl-card p-6 md:p-8">
            <h2>Terms</h2>
            <p data-testid="text-terms-meta">Version <code>{terms.version}</code> · {terms.approved ? 'Approved' : 'Not yet approved'}</p>
            {!terms.approved && <p>These terms are pending approval. Production terms and disclosures have not been finalised.</p>}
            <pre className="dl-code mt-4 max-h-[420px] whitespace-pre-wrap p-4 text-[13px]" tabIndex={0} data-testid="text-terms-body">{terms.text}</pre>
          </section>
          <section id="privacy" className="dl-card p-6 md:p-8">
            <h2>Privacy</h2>
            <p><b>Draft privacy summary.</b> This summary describes the current Sandbox. Final legal notices are pending approval.</p>
            <ul>
              <li>Applications collect a name and an email address for verification and access.</li>
              <li>Sign-in uses passkeys. API keys are stored as hash verifiers; webhook signing secrets are encrypted at rest.</li>
              <li>The public hosted checkout page contains no personal data, credentials or secrets. Avoid placing sensitive data in order references.</li>
            </ul>
          </section>
          <section id="policy" className="dl-card p-6 md:p-8">
            <h2>Sandbox policy</h2>
            <p><b>Draft Sandbox policy.</b> Final policy terms are pending approval.</p>
            <ul>
              <li>This environment is simulation only. No real Bitcoin moves, and simulated balances have no monetary value.</li>
              <li>A simulated receipt event must never be used to fulfil a real order.</li>
              <li>Live access is not enabled. Approval of an application records a decision only.</li>
              <li>The operator may pause, freeze, suspend or revoke developer access and keys.</li>
            </ul>
          </section>
          <ApiGuide />
          <section id="integration" className="dl-card p-6 md:p-8">
            <h2>Integration</h2>
            <ul>
              <li>Configure exact HTTPS return URLs (no wildcards, fragments or custom ports) and a public HTTPS webhook endpoint on port 443.</li>
              <li>Issue a test key from the checkout console. Keys are checkout-only, expire after 90 days, and are shown once.</li>
              <li>Redirect shoppers to the returned <code>url</code>. The QR encodes that checkout URL, not a Bitcoin payment request.</li>
              <li>The hosted page shows a Sandbox payment destination (<code>sandbox_destination</code>). Paying it from a Sandbox wallet settles the session automatically; the "I've made the payment" button only re-reads status. Marking a session paid from the console is a fallback for tests without a payer wallet.</li>
              <li>Fulfil test orders only from a webhook whose signature you verified: check the timestamp, compare the HMAC in constant time, ignore repeated event IDs and confirm the amount and reference against your own order. A return redirect or a status shown in the browser is never proof of payment.</li>
            </ul>
          </section>
          <section id="contact" className="dl-card p-6 md:p-8">
            <h2>Contact</h2>
            <p data-testid="text-contact-status">Looking to build with MainVaultWallet? Start with the developer access application.</p>
            <p>For integration guidance, explore the documentation and setup steps above.</p>
            <Link href="/apply" className="dl-btn mt-4" data-testid="link-contact-apply">Go to application</Link>
          </section>
        </main>
      </div>
    </div>
  );
}

import { useEffect } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, BookOpen, FileText, Link2, Mail, Scale, Shield } from 'lucide-react';
import { DevTopBar } from '@/components/developer-frame';
import { useDev } from '@/lib/developer';
import './landing.css';

const NAV = [
  ['terms', 'Terms', Scale], ['privacy', 'Privacy', Shield], ['policy', 'Sandbox policy', FileText],
  ['documentation', 'Documentation', BookOpen], ['integration', 'Integration', Link2], ['contact', 'Contact', Mail],
] as const;

export default function Resources() {
  const { session } = useDev();
  const terms = session.terms;
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);

  return (
    <div className="dl pb-16">
      <a href="#dl-res" className="dl-skip">Skip to content</a>
      <DevTopBar right={<Link href="/" className="pill-btn" data-testid="link-resources-home"><ArrowLeft className="h-4 w-4" aria-hidden /> Overview</Link>} />
      <div className="mx-auto grid w-full max-w-[1120px] grid-cols-1 gap-10 px-5 pt-10 md:grid-cols-[220px_minmax(0,1fr)] md:px-8">
        <nav aria-label="Resources" className="md:sticky md:top-6 md:self-start">
          <div className="dl-eyebrow">Resources</div>
          <ul className="mt-4 flex flex-wrap gap-2 md:flex-col md:gap-1">
            {NAV.map(([h, l, I]) => (
              <li key={h}><a href={'#' + h} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[14px] hover:bg-[hsl(140_20%_90%/.06)]" data-testid={`link-resource-${h}`}><I className="h-4 w-4 dl-volt" aria-hidden />{l}</a></li>
            ))}
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
            <p><b>Preview summary, not approved legal text.</b> A factual description of what the simulation workspace handles today.</p>
            <ul>
              <li>Applications collect a name and an email address for verification and access.</li>
              <li>Sign-in uses passkeys. API keys are stored as hash verifiers; webhook signing secrets are encrypted at rest.</li>
              <li>The public hosted checkout page contains no personal data, credentials or secrets. Avoid placing sensitive data in order references.</li>
            </ul>
          </section>
          <section id="policy" className="dl-card p-6 md:p-8">
            <h2>Sandbox policy</h2>
            <p><b>Preview summary, not approved legal text.</b></p>
            <ul>
              <li>This environment is simulation only. No real Bitcoin moves, and simulated balances have no monetary value.</li>
              <li>A simulated receipt event must never be used to fulfil a real order.</li>
              <li>Live access is not enabled. Approval of an application records a decision only.</li>
              <li>The operator may pause, freeze, suspend or revoke developer access and keys.</li>
            </ul>
          </section>
          <section id="documentation" className="dl-card p-6 md:p-8">
            <h2>Documentation</h2>
            <h3>Create a session</h3>
            <p>From your server only, never browser code. Amounts are integer satoshis, up to 10,000,000 per checkout. The return URL must exactly match one you configured.</p>
            <pre className="dl-code mt-3 p-4">{`curl -X POST https://<host>/api/v1/checkout/sessions \\
  -H "Authorization: Bearer sk_test_YOUR_KEY" \\
  -H "Idempotency-Key: order-123-v1" \\
  -H "Content-Type: application/json" \\
  -d '{"amount_sats":25000,"reference":"order-123","return_url":"https://merchant.example/result"}'`}</pre>
            <p>The response includes <code>id</code>, <code>url</code>, <code>status</code>, <code>environment: "simulation"</code>, <code>amount_sats</code>, <code>reference</code>, <code>expiresAt</code>, <code>qrPayload</code> and <code>return_url</code>. Sessions expire after 30 minutes. Reusing a key with a different body returns 409.</p>
            <h3>Read status</h3>
            <p><code>GET /api/v1/checkout/sessions/:id</code> with the same bearer key returns your session's status.</p>
            <h3>Webhooks</h3>
            <p>Header <code>X-Vault-Signature: t=&lt;unix_seconds&gt;,v1=&lt;hex_hmac_sha256&gt;</code>. Compute HMAC-SHA256 over <code>&lt;t&gt;.&lt;raw_body&gt;</code>, compare in constant time, reject timestamps older than about five minutes, deduplicate by <code>X-Vault-Event-Id</code>. Event type: <code>checkout.simulation_paid</code>. Delivery is at least once.</p>
          </section>
          <section id="integration" className="dl-card p-6 md:p-8">
            <h2>Integration</h2>
            <ul>
              <li>Configure exact HTTPS return URLs (no wildcards, fragments or custom ports) and a public HTTPS webhook endpoint on port 443.</li>
              <li>Issue a test key from the checkout console. Keys are checkout-only, expire after 90 days, and are shown once.</li>
              <li>Redirect shoppers to the returned <code>url</code>. The QR encodes that checkout URL, not a Bitcoin payment request.</li>
              <li>The shopper's "I've sent" button only re-checks status. Mark a session paid with the explicit simulate action in your console.</li>
              <li>Use verified simulation webhooks to update test orders only, never to fulfil real orders. A return redirect is not proof of payment.</li>
            </ul>
          </section>
          <section id="contact" className="dl-card p-6 md:p-8">
            <h2>Contact</h2>
            <p data-testid="text-contact-status">A public contact channel has not been configured yet.</p>
            <p>To request access, use the application page.</p>
            <Link href="/apply" className="dl-btn mt-4" data-testid="link-contact-apply">Go to application</Link>
          </section>
        </main>
      </div>
    </div>
  );
}

import { Link } from 'wouter';
import { CheckoutFlowGuide } from './checkout-flow-guide';

const steps = [
  ['setup', '1. Prepare your account'],
  ['addresses', '2. Understand the three URLs'],
  ['credentials', '3. Configure keys securely'],
  ['create', '4. Create a checkout'],
  ['status', '5. Display and reconcile status'],
  ['webhook-guide', '6. Receive signed webhooks'],
  ['recovery', '7. Handle retries and errors'],
  ['launch', '8. Test your integration'],
  ['live-scope', '9. What Live has not defined yet'],
];
const curl = `curl "$VAULT_API_BASE/v1/checkout/sessions" \\
  --request POST \\
  --header "Authorization: Bearer $VAULT_CHECKOUT_KEY" \\
  --header "Idempotency-Key: order-123-v1" \\
  --header "Content-Type: application/json" \\
  --data '{"amount_sats":25000,"reference":"order-123","return_url":"https://yourshop.com/thanks"}'`;
const node = `// Server-side JavaScript. Persist this ID with the order BEFORE calling.
const response = await fetch(process.env.VAULT_API_BASE + "/v1/checkout/sessions", {
  method: "POST",
  headers: {
    Authorization: "Bearer " + process.env.VAULT_CHECKOUT_KEY,
    "Content-Type": "application/json",
    "Idempotency-Key": order.checkoutRequestId
  },
  body: JSON.stringify({
    amount_sats: order.amountSats,
    reference: order.id,
    return_url: "https://yourshop.com/thanks"
  }),
  signal: AbortSignal.timeout(10000)
});
if (!response.ok) throw new Error("Checkout HTTP " + response.status);
const checkout = await response.json();
// Save checkout.id and checkout.url on the order; redirect to checkout.url.
// A timeout is unknown, not proof of failure. Retry with the SAME ID/body.`;
const python = `# Server-side Python; install requests in your application.
import os, requests
response = requests.post(
    os.environ["VAULT_API_BASE"] + "/v1/checkout/sessions",
    headers={
        "Authorization": "Bearer " + os.environ["VAULT_CHECKOUT_KEY"],
        "Idempotency-Key": order["checkout_request_id"],
    },
    json={
        "amount_sats": order["amount_sats"],
        "reference": order["id"],
        "return_url": "https://yourshop.com/thanks",
    },
    timeout=10,
)
response.raise_for_status()
checkout = response.json()
# Save the ID and URL before redirecting the customer.
# Reuse the stored request ID and unchanged body after a timeout.`;
const verifier = `// Node.js verification helper; run BEFORE parsing JSON.
import { createHmac, timingSafeEqual } from "node:crypto";
function verifyWebhook(rawBody, signature, secret) {
  if (!Buffer.isBuffer(rawBody) || !secret) return false;
  const match = /^t=(\\d{1,12}),v1=([a-f0-9]{64})$/.exec(signature || "");
  if (!match) return false;
  const timestamp = Number(match[1]);
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const expected = createHmac("sha256", secret)
    .update(match[1] + ".").update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(match[2], "hex"));
}
// In Express, mount express.raw({type:"application/json", limit:"64kb",
// inflate:false}) on /webhooks/mainvault BEFORE express.json().
// Verify first, then JSON.parse(rawBody.toString("utf8")).
// This helper verifies authenticity only; implement the database steps below.`;

export function ApiGuide() {
  const base = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/api`;
  return <section id="documentation" className="dl-card p-6 md:p-8">
    <h2>Hosted checkout integration</h2>
    <p>Build a checkout from your server, send your customer to the payment page, and receive signed order updates. Follow this guide in order.</p>
    <p><b>Current scope:</b> checkout sessions and Sandbox order events. These keys do not create live Bitcoin wallets, authorize withdrawals, or access the personal vault. Live activation is a separate process.</p>
    <nav aria-label="API guide chapters"><ol className="!list-none !pl-0">{steps.map(([id, label]) => <li key={id}><a className="underline" href={`#${id}`}>{label}</a></li>)}</ol></nav>
    <h3 id="setup">1. Prepare your account</h3>
    <ol>
      <li>Apply for developer access, read the current terms, and verify your email with the emailed key. Check your inbox, spam and junk folders.</li>
      <li>Enroll your passkey, complete workspace setup, and save your developer login key securely. A login key is not a server API key.</li>
      <li>Open the <Link href="/checkout" className="underline" data-testid="link-docs-checkout">checkout console</Link>. Add your exact return URL and optionally a webhook URL, then save.</li>
      <li>Confirm your passkey when requested and issue your server API key. Save the one-time key reveal on your backend.</li>
    </ol>
    <h3 id="addresses">2. Understand the three URLs</h3>
    <p><b>MainVaultWallet API base for this website:</b></p>
    <pre className="dl-code overflow-x-auto p-4">{base}</pre>
    <p>For the mainvaultwallet.com service, the API base is <code>https://mainvaultwallet.com/api</code>. Preview accounts and keys belong to the preview service; they do not automatically work on another deployment. Use the base shown in the console where you issued your key.</p>
    <ul>
      <li><b>API base:</b> your server sends authenticated requests here. Hosting your shop on another domain does not change this address.</li>
      <li><b>Return URL:</b> for example <code>https://yourshop.com/thanks</code>. This is a browser page customers visit after completion. The hosted page appends two query parameters when it sends the shopper there: <code>checkout_id</code> (the session <code>id</code>) and <code>status</code> (<code>simulation_paid</code>). Any query string already in your saved URL is kept. Accept these parameters in your route validation, but use them only to look the order up on your server; a visit does not prove payment.</li>
      <li><b>Webhook URL:</b> for example <code>https://yourshop.com/webhooks/mainvault</code>. This is a server POST handler, not the page where customers enter an amount.</li>
    </ul>
    <p>An existing-domain path needs no new DNS record. Implement the route on your hosting. An optional <code>webhook.yourshop.com</code> subdomain needs DNS pointing to your hosting and a valid HTTPS certificate; DNS alone does not implement the handler. Do not point your merchant webhook DNS to MainVaultWallet.</p>
    <p>Save up to five exact HTTPS return URLs. Wildcards, embedded credentials, fragments and nonstandard ports are not accepted. Webhooks require publicly reachable IPv4 HTTPS on port 443; private addresses and IPv6-only destinations are unsupported. Do not put a login page, browser challenge or redirect in front of the webhook handler.</p>
    <h3 id="credentials">3. Configure keys securely</h3>
    <pre className="dl-code overflow-x-auto p-4">{`VAULT_API_BASE=${base}
VAULT_CHECKOUT_KEY=sk_test_REPLACE_ON_YOUR_SERVER
# Save the separately revealed webhook signing secret in your secret manager.`}</pre>
    <p>Keep credentials out of HTML, browser JavaScript, public repositories, screenshots, URLs and logs. Do not use a VITE_ variable for a secret. API keys expire after 90 days; issuing a replacement invalidates the previous key. A recent passkey confirmation is required. If a reveal is lost, replace the key rather than trying to retrieve it.</p>
    <p>The webhook signing secret is different from the API key. Save it when shown. During rotation, retain the previous signing secret for queued events created before the change. Changing the webhook URL does not reroute existing queued events.</p>
    <h3 id="create">4. Create a checkout</h3>
    <p><code>POST /api/v1/checkout/sessions</code> accepts uncompressed JSON. Authenticate with <code>Authorization: Bearer …</code> and supply <code>Idempotency-Key</code>.</p>
    <ul>
      <li><code>amount_sats</code>: positive integer, maximum 10,000,000. One BTC equals 100,000,000 sats. Calculate the amount on your server; never trust a browser-supplied order total. This endpoint does not accept USD.</li>
      <li><code>reference</code>: trimmed order reference, 1–100 characters. Avoid personal or confidential information.</li>
      <li><code>return_url</code>: exact saved HTTPS URL, maximum 1,000 characters.</li>
      <li><code>Idempotency-Key</code>: 8–100 characters using letters, digits, underscores, periods, colons or hyphens. Persist one key per checkout attempt before sending.</li>
    </ul>
    <pre className="dl-code overflow-x-auto p-4">{curl}</pre>
    <details><summary>Node.js server example</summary><pre className="dl-code overflow-x-auto p-4">{node}</pre></details>
    <details><summary>Python server example</summary><pre className="dl-code overflow-x-auto p-4">{python}</pre></details>
    <p>Success returns JSON with <code>id</code>, <code>url</code>, <code>status</code>, <code>environment</code>, <code>amount_sats</code>, <code>reference</code>, <code>expiresAt</code>, <code>qrPayload</code>, <code>sandbox_destination</code>, <code>paid_at</code>, <code>paid_via</code> and <code>return_url</code>. Save the ID and redirect to the returned URL. The return URL in the response stays null until completion. Sessions expire after 30 minutes.</p>
    <p>The same idempotency key and body return the original checkout. Reusing the key with different input returns 409. Never generate a new key merely because the first response was lost.</p>
    <CheckoutFlowGuide />
    <h3 id="webhook-guide">6. Receive signed webhooks</h3>
    <p>MainVaultWallet sends an HTTPS POST with JSON, <code>X-Vault-Event-Id</code> and <code>X-Vault-Signature: t=unix_seconds,v1=hex_hmac_sha256</code>. The signed bytes are the timestamp, a period, and the exact raw request body.</p>
    <pre className="dl-code overflow-x-auto p-4">{`{
  "id": "event-uuid",
  "type": "checkout.simulation_paid",
  "created_at": "ISO-8601 timestamp",
  "data": {
    "id": "checkout-uuid", "reference": "order-123",
    "amount_sats": 25000, "environment": "simulation",
    "status": "simulation_paid", "paid_via": "sandbox_transfer"
  }
}`}</pre>
    <details><summary>Node.js signature verification helper</summary><pre className="dl-code overflow-x-auto p-4">{verifier}</pre></details>
    <ol>
      <li>Read a bounded raw body. Do not parse and reserialize JSON before verifying.</li>
      <li>Verify HMAC-SHA256 in constant time and reject timestamps more than five minutes in the past or future. Keep your server clock synchronized.</li>
      <li>Check the signed body ID matches X-Vault-Event-Id. Validate type, environment, checkout ID, stored reference and expected amount against your order database.</li>
      <li>In one database transaction, insert the event ID under a unique constraint and update the matching test order. An already-processed valid event should return 2xx without repeating side effects.</li>
      <li>Return 2xx only after a durable commit or durable queue admission. Perform slow work in a worker. Invalid signatures should be rejected; temporary storage failures should return a non-2xx response so delivery can retry.</li>
    </ol>
    <p>Delivery is at least once. Retries keep the event ID and body but use a new signature timestamp. The dispatcher checks every 30 seconds, processes up to ten due deliveries per sweep, and uses bounded backoff up to one hour. Automatic delivery stops after eight attempts; inspect the console and retry explicitly once the receiver is fixed. Network delivery has a five-second request timeout; redirects are not followed.</p>
    <h4 id="spoofing">Why a forged webhook cannot mark your order paid</h4>
    <p>Anyone who learns your webhook URL can POST JSON to it. The checks above are what stop that request from changing an order:</p>
    <ul>
      <li><b>Signature:</b> the HMAC is computed with a secret only your server and MainVaultWallet hold, over the timestamp and the exact bytes received. A forged or edited body fails constant-time comparison. Treat a missing signature exactly like a wrong one.</li>
      <li><b>Freshness:</b> a captured, genuine delivery replayed later fails the five-minute timestamp window.</li>
      <li><b>Uniqueness:</b> a genuine delivery replayed inside the window is rejected by the unique event-ID insert, so it cannot update twice.</li>
      <li><b>Binding:</b> the event must name a checkout ID your server created, with the stored reference, the expected <code>amount_sats</code>, <code>environment: "simulation"</code> and <code>type: "checkout.simulation_paid"</code>. An event for a different or unknown session changes nothing.</li>
      <li><b>Independent confirmation:</b> read <code>GET /api/v1/checkout/sessions/:id</code> over HTTPS from your backend with its bearer key. This endpoint returns pending and expired sessions too: require <code>simulation_paid</code> and match the order's stored amount, reference and ID before recording success.</li>
    </ul>
    <p>The public checkout and return pages cannot set a session to paid. Completion requires an authenticated Sandbox wallet payment, an authenticated merchant console action, or the owning merchant's server API key. The webhook receiver must implement all verification checks; knowing the webhook URL alone grants no authority.</p>
    <h3 id="recovery">7. Handle retries and errors</h3>
    <ul>
      <li><b>400:</b> invalid JSON or input. Fix the request; do not loop on validation failures.</li>
      <li><b>401:</b> missing, invalid, expired or revoked key. Verify the service and rotate securely if required.</li>
      <li><b>403:</b> access or account policy blocks the action. Check account status and requested capability.</li>
      <li><b>404:</b> resource not found for this account. Check the ID and API base.</li>
      <li><b>409:</b> conflict, including an idempotency key reused with different input. Reconcile the original order.</li>
      <li><b>413 / 415:</b> body too large or unsupported encoding. Send uncompressed JSON under 64 KB.</li>
      <li><b>429:</b> request budget reached. Honor Retry-After and add jitter; avoid aggressive polling.</li>
      <li><b>503 or timeout:</b> outcome may be unknown. Read status or retry the identical create request with its original idempotency key. Never assume a failed response means no operation occurred.</li>
    </ul>
    <p>Responses use an <code>error</code> message for failures. Bound retries and alert on repeated failure. Keep internal order IDs, checkout IDs and event IDs for reconciliation, but redact keys and public checkout tokens from logs.</p>
    <h3 id="launch">8. Test your integration</h3>
    <ol>
      <li>Create one order, store its checkout ID, open the returned page and verify its amount.</li>
      <li>Repeat the exact create request and confirm the same checkout; change the amount with the same key and confirm rejection.</li>
      <li>Confirm the customer's status button does not complete the order. Pay the session from a Sandbox wallet (your own account works), then verify the signed event, the printed receipt and the return page.</li>
      <li>Replay a valid event and confirm only one order update. Reject wrong signatures, stale timestamps and mismatched amounts.</li>
      <li>Make your receiver temporarily return 500; confirm retries and recovery in the delivery console. Test a missing webhook using server-side status reconciliation.</li>
      <li>Test expiration, wrong-account reads, revoked keys, lost responses and mobile checkout. Confirm no secret appears in browser requests or downloadable public assets.</li>
    </ol>
    <p>For a self-hosted interface, use the Node or Python starter download in the checkout console. Configure its API base, return page and secrets on your hosting, retain its persistent data volume, and implement your shop's order authorization. The starter does not replace your user accounts or financial ledger.</p>
    <h3 id="live-scope">9. What Live has not defined yet</h3>
    <p>Developer Live payments are not activated, and a passing Sandbox integration is not approval to take real customer payments. The developer API has no published contract for confirmation depth, underpayment and overpayment, late funds after expiry, refunds, network and service fees, settlement timing and payout, or real-payment events. Do not infer these from Sandbox. Operator review and activation are separate steps; confirm the published Live contract before enabling real-money fulfilment.</p>
  </section>;
}

/** Public documentation for the implemented hosted Sandbox checkout contract. */
export function CheckoutFlowGuide() {
  return <>
    <h3 id="status">5. Pay, display and reconcile status</h3>
    <p><code>GET /api/v1/checkout/sessions/:id</code> uses a current server API key for the merchant account that owns the session. Query from your server; never put the key in a browser polling widget. A rotated key for the same account can read existing sessions.</p>
    <h4>Pay from a developer Sandbox wallet</h4>
    <ol>
      <li>Create the checkout on your backend, store its <code>id</code> against your order, then redirect the shopper to <code>url</code>.</li>
      <li>On the hosted page choose <b>Open Sandbox wallet</b>, or copy <code>sandbox_destination</code> into the wallet's Send screen. The destination starts with <code>checkout:</code>; it is not a Bitcoin address. The QR opens the hosted page, not a payment request.</li>
      <li>Sign in to a provisioned developer Sandbox account. Check the order reference and exact satoshi amount. The amount is locked; the demoUSD display uses that wallet's saved quote and rounds up to a cent, but the transfer always uses the session's exact <code>amount_sats</code>.</li>
      <li>Choose Review, acknowledge the simulation and confirm. The payer must have enough simulated balance. A review expires after five minutes; the checkout expires after 30 minutes.</li>
      <li>Settlement debits the payer and credits the merchant once. Both accounts get an Activity entry. You can pay your own checkout for testing: outgoing and incoming entries appear, and your net balance is unchanged. The owner's personal vault is not a payer for developer checkout.</li>
      <li>The hosted page checks pending status every five seconds while open. <b>I've made the payment</b> checks immediately; clicking it cannot approve payment. On confirmation, the receipt prints inline and the page returns to the merchant after about 14 seconds, or when the shopper chooses Continue to merchant.</li>
    </ol>
    <p>If a response is lost, reconcile the existing review/session rather than starting another payment. Interrupted debits are recovered by later requests or the background worker; a refused merchant credit releases the payer's debit. Do not assume a timeout means that nothing happened.</p>
    <h4>Automated tests and the console fallback</h4>
    <p>Your backend test suite can call <code>POST /api/v1/checkout/sessions/:id/simulate</code> with a current <code>sk_test</code> key for the owning merchant account. No body is required. This creates a manual simulation credit without debiting a payer wallet; it is not evidence of a wallet transfer.</p>
    <pre className="dl-code overflow-x-auto p-4">{`curl "$VAULT_API_BASE/v1/checkout/sessions/$CHECKOUT_ID/simulate" \\
  --request POST \\
  --header "Authorization: Bearer $VAULT_CHECKOUT_KEY"`}</pre>
    <p>The response is the checkout object. Repeating completion on an already-paid session leaves its status, timestamp and payment method unchanged and does not credit twice. An unpaid expired session returns 409, another tenant's session returns 404, and the 10,000,000-sat daily manual-credit cap returns 429. Pauses, account policy, balance/history limits and request-rate limits can also block completion. In the console, <b>Mark paid manually → Confirm</b> uses this same manual-credit behaviour.</p>
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left text-[14px]">
        <caption className="mb-2 text-left font-semibold">Session states and settlement evidence</caption>
        <thead><tr><th className="p-2">Status</th><th className="p-2">Meaning</th><th className="p-2">Your server's action</th></tr></thead>
        <tbody>
          <tr><td className="p-2"><code>pending</code></td><td className="p-2">No completion recorded; paid fields and return URL are null.</td><td className="p-2">Keep the order pending.</td></tr>
          <tr><td className="p-2"><code>simulation_paid</code></td><td className="p-2"><code>paid_at</code> is set. <code>paid_via</code> is <code>sandbox_transfer</code> or <code>manual_simulation</code>.</td><td className="p-2">Validate the expected ID, reference, amount and environment; complete the test order once.</td></tr>
          <tr><td className="p-2"><code>expired</code></td><td className="p-2">The unpaid session's 30-minute window ended.</td><td className="p-2">Do not mark paid. Create a new attempt with a new idempotency key if needed.</td></tr>
        </tbody>
      </table>
    </div>
    <p>All completion paths set <code>simulation_paid</code>. A signed <code>checkout.simulation_paid</code> event is queued only if a webhook URL and signing secret are configured at completion. Adding a webhook later does not backfill earlier completions.</p>
    <h4>Return page and polling without a webhook</h4>
    <p>A completed return URL looks like <code>https://yourshop.com/thanks?checkout_id=SESSION_ID&amp;status=simulation_paid</code>. Existing query parameters are preserved, except reserved <code>checkout_id</code> and <code>status</code> values are overwritten. Your return-route validator must accept these parameters while preserving the original origin, path and merchant-owned parameters.</p>
    <p>Use <code>checkout_id</code> only to find an order belonging to the current shopper. Your server must read the session with its bearer key, match its stored ID, reference, exact amount and <code>environment: "simulation"</code>, and persist success idempotently. Never trust the returned <code>status</code> parameter, a screenshot, a customer claim or the payment button.</p>
    <p>Without webhooks, poll the authenticated GET from your backend—for example every 30 seconds while the order is open—and honour <code>Retry-After</code> on 429. Browser-driven polling stops when the customer closes the page; use a server-side reconciliation job if orders must update while they are away. A webhook can update your backend without an open browser. A successful test order must not trigger real shipment, a paid license, or other real-money fulfilment.</p>
  </>;
}

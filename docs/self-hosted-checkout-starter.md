# Self-hosted checkout starter

Open Developer → Checkout, save exact HTTPS return and webhook URLs, issue the
server API key, and choose Node or Python in **Download a starter**. The archive
contains source, a Dockerfile, Compose, a setup guide and an environment template.
Configure secrets on your host; downloads never recover or embed saved secrets.

## URL examples

- API: `https://mainvaultwallet.com/api` for that external deployment, or the
  explicit current preview origin shown in the console. Keys belong to the
  deployment that issued them. Changing the URL does not migrate an account.
- Return: `https://shop.example.com/thanks` — buyer browser navigation.
- Webhook: `https://shop.example.com/webhooks/mainvault` — signed POST receiver.

Use a domain you control, point DNS at your hosting service, enable HTTPS, and
deploy the receiver code. Merely typing a subdomain does not create an endpoint.
The generated server handles the saved webhook path. It requires raw-body HMAC
verification, timestamp tolerance, event ID and order/amount checks. Duplicate
event IDs are persisted in SQLite. Never fulfil real goods for simulated events.
Before rotating signing secrets, resolve queued deliveries signed with the old
secret; the sample accepts one configured signing secret at a time.

The starter's QR encodes the hosted checkout URL. It is not a Bitcoin payment
address. USD conversion uses fresh public Coinbase prices, cached for at most
60 seconds and rejected after 180 seconds. Simulation is explicitly labelled.
The status button is read-only, as is polling. Merchants simulate receipt from
their MainVault console; neither a pasted wallet address nor a buyer's assertion
changes payment status.

Both implementations preserve an order UUID, amount and checkout in SQLite;
the browser preserves its draft ID for reconciliation after a lost response.
Keep the Docker data volume. Never delete it casually or create a new order ID
after a timeout. Add merchant/order authorization, shared abuse limits, backup,
retention and host-specific controls before public exposure.

## Local evidence and reproduction

`scripts/test-starter-export.mjs` tests generated archives and both runtimes with
mocked upstream requests and disposable credentials. It does not contact the
hosted checkout or send crypto. Prerequisites: Node 24, Python, qrcode@1.5.4 in
`/tmp/mainvault-starter-deps/node_modules`, and Flask/requests/qrcode dependencies
in `/tmp/mainvault-python-deps`. These test dependencies are not app dependencies.

```sh
pnpm --filter @workspace/api-server exec esbuild \
  ../bitcoin-vault/src/lib/starter-archive.ts --bundle --platform=node \
  --format=esm --loader:.txt=text --outfile=/tmp/mainvault-archive.mjs
node scripts/test-starter-export.mjs
```

Passed locally: archive structure, Node/Python creation and amount locking,
same-order retries including lost responses, QR output, duplicate signed event,
invalid signature and Origin rejection. Docker execution, signed-in browser
download/redirect acceptance and hosted HTTPS delivery remain unverified.

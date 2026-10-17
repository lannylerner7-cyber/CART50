# Mainnet sync monitor

The signed-in Home page independently polls `/api/vault/node/sync` every 15 seconds.
This owner-authenticated route only reads the private engine's `/sync` endpoint.
It does not change the wallet network, create addresses, reconcile wallets or send funds.
Failed reads never fabricate progress; observations older than 60 seconds are marked stale.
Verification percentage is Core's work estimate, not blocks divided by headers or an ETA.

## Coolify activation

1. Deploy the updated mainnet **engine** image (with GET `/sync`). Keep the Core data
   volumes intact; no Core restart or blockchain redownload is required for this feature.
2. Deploy the updated website/API image.
3. On the website/API service, set `MAINNET_MONITOR_URL` to
   `http://vault-mainnet-engine:9090` and securely set `MAINNET_MONITOR_TOKEN` to
   the existing mainnet engine token. Do not paste tokens into chat or commit them.
   The website and engine must share their existing private Docker network.
4. Keep `BITCOIN_NETWORK`, `ALLOW_MAINNET`, `VAULT_ENGINE_URL` and
   `VAULT_ENGINE_TOKEN` unchanged. Monitoring works independently of the Signet wallet.
5. After login, verify that Home shows Mainnet, live block counts and a recent update
   time. If not connected, check the service network, token and engine version.

When the wallet is already configured for mainnet, its engine connection is used
by default unless a separate monitor URL is specified. A separate URL requires
its own monitor token. The token is server-only; the browser never receives it.
This is a read-only API path using the engine's existing authentication, not a new
reduced-privilege engine credential.

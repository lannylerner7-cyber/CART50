import node from './starter-templates/server.mjs.txt?raw';
import python from './starter-templates/server.py.txt?raw';
import html from './starter-templates/index.html.txt?raw';
import css from './starter-templates/style.css.txt?raw';
import js from './starter-templates/app.js.txt?raw';

export type StarterConfig = {runtime:'node'|'python';apiBase:string;returnUrl:string;webhookUrl:string;pageName:string};
export function starterFiles(input: StarterConfig): Record<string,string> {
  function https(value:string) {
    const url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search)throw Error('Use HTTPS URLs without credentials, queries or fragments.');
    return url;
  }
  if(!['node','python'].includes(input.runtime)||!input.pageName.trim()||input.pageName.length>60)throw Error('Choose runtime and a page name (1–60 characters).');
  const base=https(input.apiBase),hook=https(input.webhookUrl);
  // Exact saved return URLs may include merchant query parameters.
  const back=new URL(input.returnUrl);
  if(back.protocol!=='https:'||back.username||back.password||back.hash)throw Error('Return URL must use HTTPS.');
  if(!base.pathname.endsWith('/api')||hook.pathname==='/'||hook.pathname.startsWith('/api/')||['/app.js','/style.css'].includes(hook.pathname))throw Error('API base must end in /api. Use a dedicated webhook path, e.g. /webhooks/mainvault.');
  const config={...input,apiBase:base.href.replace(/\/$/,''),pageName:input.pageName.trim()};
  const nodeRuntime=input.runtime==='node';
  return {
    'config.json':JSON.stringify(config,null,2)+'\n',
    '.env.mainvaultwallet.example':`# Copy to .env.mainvaultwallet; keep outside source control.\n# Use secrets issued by the SAME deployment as MAINVAULT_API_BASE.\nMAINVAULT_API_BASE=${config.apiBase}\nMAINVAULT_API_KEY=REPLACE_WITH_SK_TEST_KEY\nMAINVAULT_WEBHOOK_SECRET=REPLACE_WITH_WEBHOOK_SIGNING_SECRET\nPUBLIC_ORIGIN=${hook.origin}\nPORT=3000\n`,
    '.gitignore':'.env*\n!.env.mainvaultwallet.example\ndata/\nnode_modules/\n__pycache__/\n',
    '.dockerignore':'.env*\ndata\nnode_modules\n.git\n__pycache__\n',
    'compose.yaml':'services:\n  checkout:\n    build: .\n    env_file: .env.mainvaultwallet\n    ports:\n      - "127.0.0.1:3000:3000"\n    volumes:\n      - checkout-data:/app/data\n    restart: unless-stopped\nvolumes:\n  checkout-data:\n',
    'Dockerfile':nodeRuntime
      ? 'FROM node:24-bookworm-slim\nWORKDIR /app\nCOPY package.json ./\nRUN npm install --omit=dev\nCOPY . .\nRUN mkdir -p /app/data && chown -R node:node /app\nUSER node\nEXPOSE 3000\nCMD ["node","server.mjs"]\n'
      : 'FROM python:3.12-slim\nWORKDIR /app\nCOPY requirements.txt ./\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nRUN useradd -u 10001 app && mkdir -p /app/data && chown -R app:app /app\nUSER app\nEXPOSE 3000\nCMD ["gunicorn","--bind","0.0.0.0:3000","--workers","1","--threads","4","server:app"]\n',
    ...(nodeRuntime
      ? {'server.mjs':node,'package.json':JSON.stringify({name:'mainvault-checkout-starter',private:true,type:'module',scripts:{start:'node --env-file=.env.mainvaultwallet server.mjs'},engines:{node:'>=24'},dependencies:{qrcode:'1.5.4'}},null,2)}
      : {'server.py':python,'requirements.txt':'Flask==3.1.2\nrequests==2.32.5\nqrcode[pil]==8.2\ngunicorn==23.0.0\n'}),
    'public/index.html':html,'public/style.css':css,'public/app.js':js,
    'README.md':`# MainVault ${nodeRuntime?'Node':'Python'} checkout starter

## What this is
A self-hosted **simulation-only** checkout UI and server. It calls ${config.apiBase}/v1/checkout/sessions with a server-side sk_test key. Source files are editable. This download neither deploys a service nor enables real BTC custody.

## Configure and host
1. On the API deployment shown above, save the exact return URL and webhook URL in Developer → Checkout. Issue an API key and save the one-time webhook signing secret. They are NOT recoverable from this archive.
2. Copy .env.mainvaultwallet.example to .env.mainvaultwallet and replace both placeholders. Never put keys in public/app.js, HTML, URLs or Git.
3. config.json contains your page name, return URL and webhook URL. Keep these aligned with the saved MainVault configuration.
4. Run docker compose up --build -d on your Docker host. The app listens on container port 3000 and the Compose example binds only host loopback. On a managed hosting platform, build the Dockerfile, attach a persistent /app/data volume, supply the environment variables and configure HTTPS through your hosting provider. Do not expose Bitcoin RPC.
5. Point a domain you own at that host and configure a valid HTTPS certificate. DNS alone does not create a webhook. Your deployed server handles POST ${hook.pathname}; no manual route code is needed.
6. Set PUBLIC_ORIGIN to the actual checkout website origin (scheme + host, no path). For local testing only, use http://localhost:3000. MainVault cannot deliver callbacks to your localhost. Do not tunnel a real vault to test this.
7. Keep /app/data persistent. It contains order/idempotency mappings and webhook event tombstones, not private Bitcoin keys. Back up SQLite with its online backup facilities, not by copying an active database file.

## Buyer flow
Enter a USD reference amount. The server obtains a fresh Coinbase quote, rounds up to the nearest satoshi and locks the simulated BTC amount for the order (max 0.1 simulated BTC). A QR opens the MainVault hosted simulation page; it is **not a Bitcoin payment address**. No wallet address is generated or tracked by this starter.

The “I've made the payment” button and polling only READ the existing checkout status. They cannot mark it paid. A session settles when it is paid from a MainVault Sandbox wallet (the merchant console can also mark it paid for automated tests). When status becomes simulation_paid, this page returns to the configured merchant page. Returning never proves a real payment. Do not fulfil real products for simulation events.

The order UUID is generated once and persisted in browser storage plus SQLite. Retries reuse it and the same locked amount, including lost responses. Do not create a fresh UUID on a timeout. The browser's order reference is an unguessable status capability: do not publish it.

## Webhook verification
Uses X-Vault-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256>. Verify timestamp ±300 seconds and HMAC over timestamp + "." + exact raw body. Check X-Vault-Event-Id equals payload id, simulation environment, checkout id, reference and sats against the saved order. SQLite stores event IDs and raw bodies atomically with status updates. Duplicate identical events return 200; mismatches are rejected. Signature timestamps must be current on each retry. Keep system time accurate.

Your return URL is ${config.returnUrl}. Webhook URL is ${config.webhookUrl}. They do different jobs: return is browser navigation; webhook is a signed server event. If an event arrives before a lost-response order has reconciled, this sample returns a retryable error. Retry creation with the same saved order, then retry delivery in the console.

## Before public or live use
This is an editable starter, not a production payments certification. Test the configured HTTPS receiver, signatures, duplicate deliveries, timeouts and backups on your host. Add merchant authentication, trusted proxy/rate limits, order authorization, resource limits, retention and operational monitoring before public exposure. Prices are references, not exchange commitments. Quote or API outages fail explicitly. This package accepts sk_test keys only; changing a URL does not authorize Live.

Docker build and hosted delivery are not executed by this download. Dependencies are pinned, but rebuild and audit them regularly. No secrets are included. Never add .env.mainvaultwallet to your image.
`,
  };
}
export function tarBytes(files:Record<string,string>):Uint8Array {
  const encoder=new TextEncoder(), chunks:Uint8Array[]=[];
  for(const [name,content] of Object.entries(files)){
    const body=encoder.encode(content), header=new Uint8Array(512);
    const put=(offset:number,value:string)=>header.set(encoder.encode(value),offset);
    put(0,name);put(100,'0000644\0');put(108,'0000000\0');put(116,'0000000\0');
    put(124,body.length.toString(8).padStart(11,'0')+'\0');put(136,'00000000000\0');
    put(148,'        ');put(156,'0');put(257,'ustar\0');put(263,'00');
    put(148,header.reduce((a,b)=>a+b,0).toString(8).padStart(6,'0')+'\0 ');
    chunks.push(header,body,new Uint8Array((512-body.length%512)%512));
  }
  chunks.push(new Uint8Array(1024));
  const output=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let offset=0;
  for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.length;}
  return output;
}
export async function createStarterArchive(config:StarterConfig):Promise<Blob>{
  if(typeof CompressionStream==='undefined')throw Error('This browser cannot create gzip downloads. Use an up-to-date browser.');
  const data=tarBytes(starterFiles(config));
  return new Response(new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
}

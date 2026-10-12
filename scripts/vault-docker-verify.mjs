// Offline image smoke tests. Images must already be built with linux/amd64.
// No host ports, external network, real credentials, wallets or durable volumes.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const appImage = process.argv[2] || "vault-app-verify";
const engineImage = process.argv[3] || "vault-engine-verify";
const app = `vault-check-app-${process.pid}`;
const signer = `vault-check-signer-${process.pid}`;
const token = "disposable-offline-engine-test-token";
function docker(args, expected = 0) {
  const r = spawnSync("docker", args, { encoding: "utf8", timeout: 90000 });
  assert.equal(r.status, expected, `${args[0]}: ${r.stderr}\n${r.stdout}`);
  return r.stdout;
}
try {
  for (const image of [appImage, engineImage]) {
    const [config] = JSON.parse(docker(["image", "inspect", image]));
    assert.equal(config.Architecture, "amd64");
    assert.ok(config.Config.User && !["root", "0", "0:0"].includes(config.Config.User));
  }
  const rejected = docker(["run", "--rm", "--network", "none", appImage], 1);
  // Configuration errors go to stderr; the process must exit before remote D1.
  assert.ok(!rejected.includes("Server listening"));
  docker(["run", "--rm", "--network", "none", engineImage], 1);
  docker(["run", "--rm", "--network", "none", "-e", `VAULT_ENGINE_TOKEN=${token}`,
    "-e", "BITCOIN_NETWORK=mainnet", engineImage], 1);
  const verifier = createHash("sha256").update(Buffer.alloc(164, 7)).digest("hex");
  docker(["run", "--rm", "--name", app, "--network", "none", "--read-only",
    "--tmpfs", "/tmp:rw,noexec,nosuid,nodev", "-e", "NODE_ENV=development",
    "-e", "VAULT_DATA_DIR=/tmp/state", "-e", "PUBLIC_ORIGIN=https://vault.test",
    "-e", `VAULT_OWNER_VERIFIER=${verifier}`, appImage, "node", "--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    import {spawn} from 'node:child_process';
    const child=spawn(process.execPath,['/app/dist/index.mjs'],{stdio:'inherit'});
    try {
    const base='http://127.0.0.1:3000';
    for(let n=0;n<30;n++){try{await fetch(base+'/api/healthz');break;}catch{await new Promise(r=>setTimeout(r,200));}}
    assert.deepEqual(await (await fetch(base+'/api/healthz')).json(),{status:'ok'});
    assert.match(await (await fetch(base+'/')).text(),/<html/);
    assert.equal((await fetch(base+'/settings')).status,200);
    assert.equal((await fetch(base+'/api/unknown')).status,404);
    assert.equal((await fetch(base+'/api/vault/dashboard')).status,401);
    const r=await fetch(base+'/api/vault/login',{method:'POST',headers:{Origin:'https://vault.test','Content-Type':'application/json'},body:JSON.stringify({credential:Buffer.alloc(164,7).toString('base64url')})});
    assert.equal(r.status,200);
    assert.equal((await r.json()).authenticated,true);
    assert.match(r.headers.get('set-cookie'),/Secure/);
    console.log('PASS app image: liveness, SPA, routing, owner gate and disposable-key login.');
    } finally { child.kill('SIGTERM'); }
  `]);
  docker(["run", "--rm", "--name", signer, "--network", "none", "--read-only",
    "--tmpfs", "/tmp:rw,noexec,nosuid,nodev",
    "--tmpfs", "/var/lib/personal-vault:rw,noexec,nosuid,nodev,uid=10001,gid=10001",
    "-e", `VAULT_ENGINE_TOKEN=${token}`, "--entrypoint", "/bin/bash", engineImage, "-c", `
    set -e
    /usr/local/bin/vault-engine >/tmp/engine-check.log 2>&1 & pid=$!
    trap 'kill "$pid" 2>/dev/null || true' EXIT
    for n in {1..30}; do (echo >/dev/tcp/127.0.0.1/9090) 2>/dev/null && break; sleep 0.2; done
    exec 3<>/dev/tcp/127.0.0.1/9090
    printf 'GET /status HTTP/1.1\\r\\nHost: localhost\\r\\nConnection: close\\r\\n\\r\\n' >&3
    result=$(cat <&3)
    [[ "$result" == *"401 Unauthorized"* ]]
    exec 3>&-
    exec 4<>/dev/tcp/127.0.0.1/9090
    printf 'GET /status HTTP/1.1\\r\\nHost: localhost\\r\\nAuthorization: Bearer ${token}\\r\\nConnection: close\\r\\n\\r\\n' >&4
    result=$(cat <&4)
    [[ "$result" == *"200 OK"* && "$result" == *'"network":"signet"'* && "$result" == *'"connected":false'* ]]
    echo 'PASS signer image: unauthorized rejected; signet-only, disconnected safely.'
  `]);
  console.log("PASS: both amd64 images run without public ports or outbound network; production configuration and mainnet rejection checked.");
  console.log("NOT PROVEN: real D1/SMTP/Core connectivity, Coolify proxy, live recovery or funding.");
} finally {
  for (const name of [app, signer]) spawnSync("docker", ["rm", "-f", name], { stdio: "ignore", timeout: 15000 });
}

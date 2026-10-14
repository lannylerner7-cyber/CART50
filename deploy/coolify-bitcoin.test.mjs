import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const compose = fileURLToPath(new URL('./coolify-bitcoin.compose.yaml', import.meta.url));
const env = {
  PATH: process.env.PATH, HOME: process.env.HOME,
  VAULT_ENGINE_TOKEN: 'disposable-compose-validation-token-only',
  COLD_DESCRIPTOR: 'disposable-public-descriptor',
  COLD_DESCRIPTOR_SHA256: 'disposable-fingerprint',
  COOLIFY_NETWORK: 'existing-app-network',
};
const available = spawnSync('docker', ['compose', 'version'], { env }).status === 0;

test('private Signet stack renders without published ports or secret build arguments', { skip: !available }, () => {
  const config = JSON.parse(execFileSync('docker', ['compose', '-f', compose, 'config', '--format', 'json'], { env, encoding: 'utf8' }));
  const core = config.services['bitcoin-core'], signer = config.services['vault-engine'];
  for (const service of [core, signer]) {
    assert.equal(service.ports, undefined);
    assert.equal(service.privileged, undefined);
    assert.equal(service.build.args, undefined);
    assert.equal(service.labels['traefik.enable'], 'false');
    assert.equal(service.platform, 'linux/amd64');
  }
  assert.equal(config.networks.rpc.internal, true);
  assert.equal(config.networks['app-network'].external, true);
  assert.equal(core.networks['app-network'], undefined);
  assert.ok(Object.hasOwn(signer.networks, 'app-network'));
  assert.equal(signer.environment.BITCOIN_NETWORK, 'signet');
  assert.equal(signer.environment.BTC_RPC_COOKIE_FILE, '/run/bitcoin/.cookie');
  const cookie = signer.volumes.find(v => v.target === '/run/bitcoin');
  assert.equal(cookie.read_only, true);
  assert.ok(core.volumes.some(v => v.source === cookie.source));
  assert.ok(signer.volumes.some(v => v.target === '/var/lib/personal-vault'));
  assert.ok(core.volumes.some(v => v.target === '/var/lib/bitcoin'));
});

test('missing operator inputs block compose rendering', { skip: !available }, () => {
  for (const field of ['VAULT_ENGINE_TOKEN', 'COLD_DESCRIPTOR', 'COLD_DESCRIPTOR_SHA256', 'COOLIFY_NETWORK']) {
    const missing = { ...env };
    delete missing[field];
    const result = spawnSync('docker', ['compose', '-f', compose, 'config', '--quiet'], { env: missing, encoding: 'utf8' });
    assert.notEqual(result.status, 0, field);
    assert.ok(result.stderr.includes(field), field);
  }
});

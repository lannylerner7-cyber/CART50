import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const html = readFileSync(new URL('../artifacts/bitcoin-vault/public/signet-setup.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function page(protocol) {
  const elements = Object.fromEntries(['generate', 'understand', 'network', 'result', 'download', 'share', 'saved', 'copy', 'clear', 'status', 'private-backup'].map(id =>
    [id, { value: '', checked: false, disabled: true, textContent: '' }]));
  elements.network.value = 'coolify';
  vm.runInNewContext(script, {
    document: { getElementById: id => elements[id] },
    location: { protocol }, navigator: {}, crypto: webcrypto,
    TextEncoder, Uint8Array, Uint32Array, DataView, ArrayBuffer, setTimeout,
  });
  return elements;
}
test('HTTPS generates only after consent; backup confirmation gates variables; clear removes displayed material', async () => {
  const el = page('https:');
  assert.equal(el.generate.disabled, false);
  await el.generate.onclick();
  assert.match(el.status.textContent, /Confirm/);
  el.understand.checked = true;
  await el.generate.onclick();
  assert.equal(el.result.value, '');
  assert.equal(el.download.disabled, false);
  assert.equal(el.generate.disabled, true);
  const backup = JSON.parse(el['private-backup'].value);
  assert.match(backup.privateReceiveDescriptor, /^wpkh\(tprv/);
  el.saved.checked = true; el.saved.onchange();
  assert.match(el.result.value, /VAULT_ENGINE_TOKEN=[a-f0-9]{64}\n/);
  assert.ok(el.result.value.includes('COOLIFY_NETWORK=coolify'));
  assert.ok(!el.result.value.includes('tprv'));
  const descriptor = el.result.value.split('COLD_DESCRIPTOR=')[1].split('\n')[0];
  const expected = Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(descriptor))).toString('hex');
  assert.ok(el.result.value.includes(`COLD_DESCRIPTOR_SHA256=${expected}`));
  el.clear.onclick();
  assert.equal(el.result.value, '');
  assert.equal(el['private-backup'].value, '');
  assert.equal(el.saved.disabled, true);
  assert.equal(el.copy.disabled, true);
});
test('plain HTTP is blocked; no network or storage APIs are needed', async () => {
  const el = page('http:');
  assert.equal(el.generate.disabled, true);
  await el.generate.onclick();
  assert.equal(el.result.value, '');
  assert.match(el.status.textContent, /HTTPS/);
  assert.ok(html.includes("connect-src 'none'"));
});

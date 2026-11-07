import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const root = new URL('../artifacts/bitcoin-vault/public/', import.meta.url);
test('favicon variants are reproducible, square and linked from the HTML shell', () => {
  execFileSync(process.execPath, [new URL('./build-favicons.mjs', import.meta.url).pathname, '--check']);
  for (const [name, size] of [...[16, 32, 48, 96, 192, 512].map(n => [`favicon-${n}.png`, n]), ['apple-touch-icon.png', 180]]) {
    const b = readFileSync(new URL(name, root));
    assert.equal(b.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(b.readUInt32BE(16), size);
    assert.equal(b.readUInt32BE(20), size);
  }
  const ico = readFileSync(new URL('favicon.ico', root));
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 3);
  assert.deepEqual([ico[6], ico[22], ico[38]], [16, 32, 48]);
  const html = readFileSync(new URL('../artifacts/bitcoin-vault/index.html', import.meta.url), 'utf8');
  for (const name of ['favicon.svg', 'favicon.ico', 'favicon-16.png', 'favicon-32.png', 'favicon-96.png', 'apple-touch-icon.png', 'site.webmanifest', 'safari-pinned-tab.svg']) {
    assert.ok(html.includes(`%BASE_URL%${name}"`), name);
    assert.ok(readFileSync(new URL(name, root)).length > 0);
  }
  const manifest = JSON.parse(readFileSync(new URL('site.webmanifest', root)));
  assert.equal(manifest.scope, './');
  assert.deepEqual(manifest.icons.map(i => i.sizes), ['192x192', '512x512']);
});

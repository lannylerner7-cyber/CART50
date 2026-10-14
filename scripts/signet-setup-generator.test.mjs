import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { descriptorChecksum, testWallet } from './signet-setup-generator.mjs';
import { HDKey } from '@scure/bip32';

test('descriptor checksum reference vector and test-network derivation', () => {
  assert.equal(descriptorChecksum('raw(deadbeef)'), '89f8spxm');
  // Publicly known deterministic test seed, never used for a real wallet.
  const wallet = testWallet(new Uint8Array(32).fill(1));
  assert.match(wallet.descriptor, /^wpkh\(tpub/);
  assert.match(wallet.privateDescriptor, /^wpkh\(tprv/);
  assert.ok(!wallet.descriptor.includes('tprv'));
  const pub = wallet.descriptor.split('(')[1].split('/')[0];
  const priv = wallet.privateDescriptor.split('(')[1].split('/')[0];
  const versions = { private: 0x04358394, public: 0x043587cf };
  assert.deepEqual(HDKey.fromExtendedKey(pub, versions).derive('m/0/0').publicKey,
    HDKey.fromExtendedKey(priv, versions).derive('m/0/0').publicKey);
});

const coreAvailable = spawnSync('docker', ['image', 'inspect', 'vault-core-signet-check:local'], { stdio: 'ignore' }).status === 0;
test('Bitcoin Core accepts generated public descriptor and can derive a Signet address', { skip: !coreAvailable }, () => {
  const wallet = testWallet(new Uint8Array(32).fill(1));
  const script = `set -eu
bitcoind -conf=/etc/bitcoin/bitcoin.conf >/tmp/core.log 2>&1 & pid=$!
trap 'kill "$pid" 2>/dev/null || true' EXIT
ready=0
for n in $(seq 1 30); do
  if bitcoin-cli -conf=/etc/bitcoin/bitcoin.conf getblockchaininfo >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
test "$ready" = 1
bitcoin-cli -conf=/etc/bitcoin/bitcoin.conf getdescriptorinfo "$1" > /tmp/info
bitcoin-cli -conf=/etc/bitcoin/bitcoin.conf deriveaddresses "$1" '[0,0]' > /tmp/address
cat /tmp/info
echo DELIMITER
cat /tmp/address
bitcoin-cli -conf=/etc/bitcoin/bitcoin.conf stop >/dev/null
wait "$pid"`;
  const output = execFileSync('docker', ['run', '--rm', '--network', 'none', '--entrypoint', 'sh',
    'vault-core-signet-check:local', '-c', script, 'check', wallet.descriptor], { encoding: 'utf8', timeout: 60000 });
  const [info, addresses] = output.split('DELIMITER');
  const parsed = JSON.parse(info);
  assert.equal(parsed.isrange, true);
  assert.equal(parsed.issolvable, true);
  assert.equal(parsed.hasprivatekeys, false);
  assert.match(JSON.parse(addresses)[0], /^tb1q/);
});

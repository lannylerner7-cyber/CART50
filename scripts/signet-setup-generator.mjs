import { HDKey } from '@scure/bip32';

// Bitcoin Core descriptor checksum (not a wallet/address checksum).
export function descriptorChecksum(input) {
  const charset = "0123456789()[],'/*abcdefgh@:$%{}IJKLMNOPQRSTUVWXYZ&+-.;<=>?!^_|~ijklmnopqrstuvwxyzABCDEFGH`#\"\\ ";
  const output = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const generators = [0xf5dee51989n, 0xa9fdca3312n, 0x1bab10e32dn, 0x3706b1677an, 0x644d626ffdn];
  let c = 1n, cls = 0, count = 0;
  const step = (value) => {
    const top = c >> 35n;
    c = ((c & 0x7ffffffffn) << 5n) ^ BigInt(value);
    for (let i = 0; i < 5; i++) if ((top >> BigInt(i)) & 1n) c ^= generators[i];
  };
  for (const ch of input) {
    const pos = charset.indexOf(ch);
    if (pos < 0) throw new Error('Unsupported descriptor character');
    step(pos & 31);
    cls = cls * 3 + (pos >> 5);
    if (++count === 3) { step(cls); cls = 0; count = 0; }
  }
  if (count) step(cls);
  for (let i = 0; i < 8; i++) step(0);
  c ^= 1n;
  return Array.from({ length: 8 }, (_, i) => output[Number((c >> BigInt(5 * (7 - i))) & 31n)]).join('');
}

export function testWallet(seed) {
  const account = HDKey.fromMasterSeed(seed, { private: 0x04358394, public: 0x043587cf }).derive("m/84'/1'/0'");
  const pub = `wpkh(${account.publicExtendedKey}/0/*)`;
  const priv = `wpkh(${account.privateExtendedKey}/0/*)`;
  return { descriptor: `${pub}#${descriptorChecksum(pub)}`, privateDescriptor: `${priv}#${descriptorChecksum(priv)}` };
}

if (typeof document !== 'undefined') {
  const byId = id => document.getElementById(id);
  let backup;
  const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  byId('generate').onclick = async () => {
    try {
      if (location.protocol !== 'file:') throw new Error('Save this HTML file and open it locally first. Generation is disabled on websites.');
      if (!byId('understand').checked) throw new Error('Confirm this is for Signet test coins only.');
      const network = byId('network').value.trim();
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(network)) throw new Error('Enter the actual Docker network name from your server.');
      byId('result').value = '';
      byId('download').disabled = true;
      const seed = crypto.getRandomValues(new Uint8Array(32));
      const wallet = testWallet(seed);
      seed.fill(0);
      const fingerprint = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(wallet.descriptor))));
      const token = hex(crypto.getRandomValues(new Uint8Array(32)));
      backup = {
        warning: 'SIGNET TEST COINS ONLY. Private material: never upload to Coolify, GitHub or chat.',
        privateReceiveDescriptor: wallet.privateDescriptor,
        publicReceiveDescriptor: wallet.descriptor,
        derivation: "m/84'/1'/0'/0/*",
        recovery: 'Import the private receive descriptor into a separate trusted Signet Bitcoin Core descriptor wallet using importdescriptors, timestamp 0 and the used address range. A pruned node may need old blocks downloaded again for a rescan. This file is unencrypted; keep it offline. This is not a seed phrase or a mainnet wallet.',
      };
      byId('result').value = `VAULT_ENGINE_TOKEN=${token}\nCOLD_DESCRIPTOR=${wallet.descriptor}\nCOLD_DESCRIPTOR_SHA256=${fingerprint}\nCOOLIFY_NETWORK=${network}`;
      byId('download').disabled = false;
      byId('status').textContent = 'Generated locally. Download and securely save the PRIVATE test-wallet backup before deploying. No values have been sent anywhere.';
    } catch (e) { byId('status').textContent = e.message; }
  };
  byId('download').onclick = () => {
    if (!backup) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'PRIVATE-signet-test-wallet-backup.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
}

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
  let variables = '';
  const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  const supported = (location.protocol === 'file:' || location.protocol === 'https:') && !!globalThis.crypto?.subtle;
  byId('generate').disabled = !supported;
  byId('status').textContent = supported
    ? 'Ready. Generation stays in this browser. Save the private backup before revealing the variables.'
    : 'Blocked: open this page over HTTPS in Safari/Chrome, or as a local file in a supported computer browser.';
  byId('saved').onchange = () => {
    const ready = !!backup && byId('saved').checked;
    byId('result').value = ready ? variables : '';
    byId('copy').disabled = !ready;
  };
  byId('copy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(byId('result').value);
      byId('status').textContent = 'Variables copied. Paste only into secure Coolify settings.';
    } catch {
      byId('result').focus(); byId('result').select();
      byId('status').textContent = 'Automatic copy is unavailable. Select and copy the variables manually.';
    }
  };
  byId('clear').onclick = () => {
    backup = undefined; variables = '';
    byId('result').value = ''; byId('private-backup').value = '';
    byId('saved').checked = false; byId('saved').disabled = true;
    byId('download').disabled = true; byId('share').disabled = true; byId('copy').disabled = true;
    byId('generate').disabled = !supported;
    byId('status').textContent = 'Screen cleared. Your downloaded backup and clipboard are not erased. Generating again creates a different wallet.';
  };
  byId('generate').onclick = async () => {
    try {
      if (!supported) throw new Error('Use HTTPS or a supported local-file browser.');
      if (backup || byId('generate').disabled) return;
      if (!byId('understand').checked) throw new Error('Confirm this is for Signet test coins only.');
      const network = byId('network').value.trim();
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(network)) throw new Error('Enter the actual Docker network name from your server.');
      byId('result').value = '';
      byId('download').disabled = true;
      byId('generate').disabled = true;
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
      variables = `VAULT_ENGINE_TOKEN=${token}\nCOLD_DESCRIPTOR=${wallet.descriptor}\nCOLD_DESCRIPTOR_SHA256=${fingerprint}\nCOOLIFY_NETWORK=${network}`;
      byId('private-backup').value = JSON.stringify(backup, null, 2);
      byId('download').disabled = false;
      byId('share').disabled = typeof navigator.share !== 'function';
      byId('saved').disabled = false;
      byId('status').textContent = 'Generated locally. Download and securely save the PRIVATE test-wallet backup before deploying. No values have been sent anywhere.';
    } catch (e) { byId('generate').disabled = !supported || !!backup; byId('status').textContent = e.message; }
  };
  byId('share').onclick = async () => {
    if (!backup) return;
    const file = new File([JSON.stringify(backup, null, 2)], 'PRIVATE-signet-test-wallet-backup.json', { type: 'application/json' });
    try {
      if (!navigator.canShare?.({ files: [file] })) throw new Error('File sharing is unavailable. Use Download or the manual backup below.');
      await navigator.share({ files: [file], title: 'PRIVATE Signet test-wallet backup' });
    } catch (e) {
      byId('status').textContent = e.name === 'AbortError' ? 'Save cancelled. Save your backup before continuing.' : e.message;
    }
  };
  byId('download').onclick = () => {
    if (!backup) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'PRIVATE-signet-test-wallet-backup.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
}

import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

// Run OFFLINE. Supply file paths, never a secret directly as a command argument.
const [mode, input, output, keyPath] = process.argv.slice(2);
function writeNew(file, value) { writeFileSync(file, value, { mode: 0o600, flag: "wx" }); }
function validate(data) {
  const allowed = new Set(["version", "createdAt", "coldDescriptor", "coldIndex", "spendingWalletBackupBase64", "reserveWalletBackupBase64"]);
  if (!data || typeof data !== "object" || Object.keys(data).some(k => !allowed.has(k)) || data.version !== 1 || !Number.isSafeInteger(data.coldIndex) || data.coldIndex < 0 || typeof data.coldDescriptor !== "string" || /[tx]prv/.test(data.coldDescriptor)) {
    throw new Error("Backup accepts only version, createdAt, public coldDescriptor, coldIndex and spending/reserve wallet backups. Temporary wallet keys/history are prohibited.");
  }
  for (const key of ["spendingWalletBackupBase64", "reserveWalletBackupBase64"]) {
    if (key in data && (typeof data[key] !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data[key]) || data[key].length === 0)) {
      throw new Error("Wallet backups must be nonempty base64 strings");
    }
  }
  return data;
}
try {
  if (mode === "key" && input) {
    writeNew(input, randomBytes(32)); process.stdout.write("Independent 32-byte backup key saved. Keep offline, separate from the vault login key.\n");
  } else if ((mode === "encrypt" || mode === "decrypt") && input && output && keyPath) {
    const key = readFileSync(keyPath); if (key.length !== 32) throw new Error("AES-256-GCM needs an independent 32-byte key");
    const bytes = readFileSync(input); if (bytes.length > 16 * 1024 * 1024) throw new Error("Backup exceeds 16 MiB limit");
    const header = Buffer.from("VAULTB01");
    if (mode === "encrypt") {
      validate(JSON.parse(bytes.toString("utf8")));
      const nonce = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, nonce);
      cipher.setAAD(header);
      const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
      writeNew(output, Buffer.concat([header, nonce, cipher.getAuthTag(), encrypted]));
    } else {
      if (!bytes.subarray(0, 8).equals(header) || bytes.length < 36) throw new Error("Invalid backup format");
      const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(8, 20));
      decipher.setAAD(header); decipher.setAuthTag(bytes.subarray(20, 36));
      const decrypted = Buffer.concat([decipher.update(bytes.subarray(36)), decipher.final()]);
      validate(JSON.parse(decrypted.toString("utf8"))); writeNew(output, decrypted);
    }
    key.fill(0); process.stdout.write("Backup operation complete. Temporary wallets were not exported by this tool.\n");
  } else throw new Error("Usage: node scripts/vault-backup.mjs key <new-key-file> | encrypt/decrypt <input> <new-output> <key-file>");
} catch (error) { process.stderr.write((error instanceof Error ? error.message : "Backup failed") + "\n"); process.exitCode = 1; }

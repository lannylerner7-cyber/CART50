import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("backup roundtrip, tampering rejection and temporary-history exclusion", () => {
  const dir = mkdtempSync(join(tmpdir(), "vault-backup-test-"));
  const script = resolve("scripts/vault-backup.mjs");
  const run = (...args) => execFileSync(process.execPath, [script, ...args], {stdio:"pipe"});
  const key=join(dir,"key"), input=join(dir,"recovery.json"), encrypted=join(dir,"recovery.vault"), output=join(dir,"restored.json");
  try {
    writeFileSync(input, JSON.stringify({version:1,coldDescriptor:"public-test-descriptor",coldIndex:10,createdAt:new Date().toISOString()}));
    run("key",key); run("encrypt",input,encrypted,key); run("decrypt",encrypted,output,key);
    assert.deepEqual(readFileSync(input),readFileSync(output));
    const tampered=readFileSync(encrypted);tampered[tampered.length-1]^=1;writeFileSync(encrypted,tampered);
    assert.notEqual(spawnSync(process.execPath,[script,"decrypt",encrypted,join(dir,"bad"),key]).status,0);
    writeFileSync(input,JSON.stringify({version:1,coldDescriptor:"public",coldIndex:0,temporaryWalletKeys:[]}));
    assert.notEqual(spawnSync(process.execPath,[script,"encrypt",input,join(dir,"bad2"),key]).status,0);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

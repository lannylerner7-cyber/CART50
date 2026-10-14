import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('mainnet uses isolated volumes, explicit approval and no public ports',()=>{
  const env={PATH:process.env.PATH,HOME:process.env.HOME,ALLOW_MAINNET:'true',MAINNET_ENGINE_TOKEN:'disposable-test-token-not-for-deployment',COOLIFY_NETWORK:'coolify'};
  const config=JSON.parse(execFileSync('docker',['compose','--project-directory',root,'-f',path.join(root,'deploy/coolify-mainnet.compose.yaml'),'config','--format','json'],{env,encoding:'utf8'}));
  assert.deepEqual(Object.keys(config.volumes).sort(),['mainnet-bitcoin-cookie','mainnet-bitcoin-data','mainnet-signer-data']);
  const engine=config.services['vault-mainnet-engine'];
  assert.equal(engine.environment.BITCOIN_NETWORK,'main');
  assert.equal(engine.environment.VAULT_CUSTODY_MODE,'server');
  assert.equal(engine.environment.ALLOW_MAINNET,'true');
  assert.equal(engine.environment.COLD_DESCRIPTOR,undefined);
  for(const service of Object.values(config.services)) {
    assert.equal(service.ports,undefined);
    assert.equal(service.build.args,undefined);
    assert.ok(existsSync(path.join(service.build.context,service.build.dockerfile)));
  }
  assert.equal(config.networks['mainnet-rpc'].internal,true);
  assert.equal(config.services['bitcoin-mainnet'].networks['app-network'],undefined);
});

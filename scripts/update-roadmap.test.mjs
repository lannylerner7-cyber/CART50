import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

test('roadmap detects added, changed and removed files, stays stable, and excludes private material', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'roadmap-test-'));
  const env = { ...process.env, DANGEROUSLY_ALLOW_GIT: '1' };
  try {
    execFileSync('git', ['init', '-q', root], { env });
    mkdirSync(path.join(root, 'scripts'));
    copyFileSync(new URL('./update-roadmap.mjs', import.meta.url), path.join(root, 'scripts/update-roadmap.mjs'));
    writeFileSync(path.join(root, 'project road map.Rmd'), '# Test\n<!-- ROADMAP-INVENTORY:START -->\n<!-- ROADMAP-INVENTORY:END -->\n');
    writeFileSync(path.join(root, 'sample.ts'), 'export const value = 1;\n');
    writeFileSync(path.join(root, '.env'), 'TEST_ONLY=placeholder');
    writeFileSync(path.join(root, 'backup.key'), 'disposable fixture');
    const run = (...args) => spawnSync(process.execPath, ['scripts/update-roadmap.mjs', ...args], { cwd: root, env, encoding: 'utf8' });
    assert.equal(run('--check').status, 1);
    assert.equal(run().status, 0);
    assert.equal(run('--check').status, 0);
    const first = readFileSync(path.join(root, 'project road map.Rmd'), 'utf8');
    assert.match(first, /sample\.ts/);
    assert.doesNotMatch(first, /backup\.key|`\.env`|disposable fixture/);
    assert.equal(run().status, 0);
    assert.equal(readFileSync(path.join(root, 'project road map.Rmd'), 'utf8'), first);
    writeFileSync(path.join(root, 'sample.ts'), 'export const value = 2;\n');
    assert.match(run('--check').stderr, /Changed: sample\.ts/);
    assert.equal(run().status, 0);
    rmSync(path.join(root, 'sample.ts'));
    assert.match(run('--check').stderr, /Removed\/excluded: sample\.ts/);
    assert.equal(run().status, 0);
    writeFileSync(path.join(root, 'new.ts'), '// new source\n');
    assert.match(run('--check').stderr, /Added: new\.ts/);
    assert.equal(run().status, 0);
    assert.equal(run('--check').status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

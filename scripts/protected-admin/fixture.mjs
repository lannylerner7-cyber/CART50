import { test as base, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, existsSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, sep } from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

export const origin = 'https://localhost:4443';
const scripts = fileURLToPath(new URL('../', import.meta.url));

export const test = base.extend({
  isolated: [async ({ playwright }, use) => {
    // Refuse to attach to any pre-existing listener, even another fixture.
    const probe = net.createServer();
    await new Promise((ok, fail) => { probe.once('error', fail); probe.listen(4443, '127.0.0.1', ok); });
    await new Promise(ok => probe.close(ok));
    const root = mkdtempSync(join(tmpdir(), 'protected-admin-suite-'));
    let child, api;
    try {
      child = spawn(process.execPath, ['--import', './protected-admin/local-only.mjs', '--import', 'tsx', './developer-ui-fixture.mts'], {
        cwd: scripts, detached: true, stdio: 'ignore',
        env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: root,
          VAULT_UI_FIXTURE: '1', VAULT_UI_FIXTURE_HTTPS: '1', VAULT_UI_FIXTURE_ADMIN: '1' },
      });
      api = await playwright.request.newContext({ baseURL: origin, ignoreHTTPSErrors: true });
      let state;
      await expect.poll(async () => {
        if (child.exitCode !== null) throw new Error('Disposable fixture exited before readiness');
        try {
          const r = await api.get('/__admin-fixture', { timeout: 1000 });
          state = await r.json();
          return r.ok() && state.disposable === true && r.headers()['x-developer-fixture'] === state.fixtureRunId;
        } catch { return false; }
      }, { timeout: 30_000 }).toBe(true);
      const dir = realpathSync(state.evidenceDir);
      expect(dir.startsWith(realpathSync(root) + sep)).toBe(true);
      const manifest = await (await api.get('/__developer-fixture')).json();
      expect(resolve(manifest.ownerCredentialFile)).toBe(join(dir, 'disposable-owner.txt'));
      await use({ api, state, dir, credentialFile: manifest.ownerCredentialFile });
    } finally {
      await api?.dispose();
      if (child?.pid) {
        const exited = once(child, 'exit');
        try { process.kill(-child.pid, 'SIGTERM'); } catch {}
        await Promise.race([exited, new Promise(ok => setTimeout(ok, 3000).unref())]);
        try { process.kill(-child.pid, 'SIGKILL'); } catch {}
      }
      // Parent-owned root also covers startup failure and interrupted child cleanup.
      rmSync(root, { recursive: true, force: true });
      expect(existsSync(root)).toBe(false);
      const socket = net.connect({ host: '127.0.0.1', port: 4443 });
      const closed = await new Promise(ok => {
        socket.once('connect', () => { socket.destroy(); ok(false); });
        socket.once('error', () => ok(true));
      });
      expect(closed, 'fixture listener stopped').toBe(true);
    }
  }, { scope: 'worker' }],
  securedPage: async ({ page, context, isolated }, use) => {
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin !== origin) return route.abort('blockedbyclient');
      return route.continue();
    });
    const response = await page.goto('/__admin-fixture');
    expect(new URL(page.url()).origin).toBe(origin);
    expect(response.headers()['x-developer-fixture']).toBe(isolated.state.fixtureRunId);
    expect((await response.json()).fixtureRunId).toBe(isolated.state.fixtureRunId);
    const cdp = await context.newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
      protocol: 'ctap2', transport: 'internal', hasResidentKey: true,
      hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true,
    } });
    try { await use(page); }
    finally {
      await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId }).catch(() => {});
      await cdp.detach();
    }
  },
});
export { expect, readFileSync };

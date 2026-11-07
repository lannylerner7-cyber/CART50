import { test, expect, readFileSync, origin } from './fixture.mjs';
import { join } from 'node:path';

const owner = '/mainvaultwallet/personal/admin';

test('protected owner admin acceptance matrix', async ({ securedPage: page, isolated }) => {
  const ui = id => page.getByTestId(id);
  const accounts = isolated.state.accounts;
  const account = name => accounts.find(a => a.email.startsWith(name.toLowerCase() + '-'));
  const snapshot = async name => (await (await isolated.api.get('/__admin-fixture')).json()).accounts.find(a => a.id === account(name).id);
  const confirm = ui('button-admin-submit');
  const reason = ui('input-admin-reason');
  const open = async (action, name) => {
    await ui('nav-admin-' + (['approve', 'reject'].includes(action) ? 'applications' : 'accounts')).click();
    await ui(`button-${action}-${account(name).id}`).click();
  };
  const submit = async (action, status = 200) => {
    const response = page.waitForResponse(r => r.url() === `${origin}/api/admin/developers/${action}` && r.request().method() === 'POST');
    await confirm.click();
    expect((await response).status()).toBe(status);
    if (status === 200) await expect(page.getByRole('dialog')).toBeHidden();
  };
  await test.step('fixture fingerprint, owner login, and real passkey enrollment', async () => {
    await page.goto(owner + '/settings');
    // File upload avoids ever including the disposable secret in test assertion output.
    await page.locator('input[type=file]').setInputFiles(isolated.credentialFile);
    await ui('button-unlock').click();
    await ui('input-passkey-name').fill('Disposable acceptance authenticator');
    await ui('button-enroll-passkey').click();
    await expect(page.locator('[data-testid^="row-passkey-"]')).toHaveCount(1);
    await page.goto(owner + '/admin');
  });
  await test.step('step-up, required reason, and typed email gates', async () => {
    await open('suspend', 'Suspension');
    await reason.fill('Acceptance suspension');
    await ui('input-admin-confirm').fill(account('Suspension').email);
    await expect(confirm).toBeDisabled();
    await ui('button-dialog-passkey').click();
    await expect(confirm).toBeEnabled();
    for (const value of ['', 'abc']) {
      await reason.fill(value);
      await expect(confirm).toBeDisabled();
    }
    await reason.fill('Acceptance suspension');
    for (const value of ['', 'wrong@example.invalid']) {
      await ui('input-admin-confirm').fill(value);
      await expect(confirm).toBeDisabled();
    }
    await ui('input-admin-confirm').fill(account('Suspension').email);
    await expect(confirm).toBeEnabled();
    await submit('suspend');
    await expect(ui(`status-account-${account('Suspension').id}`)).toHaveText('suspended');
    expect(await snapshot('Suspension')).toMatchObject({ status: 'suspended', sessions: 0, hasApiKey: false, hasLoginKey: true });
  });
  await test.step('approve and reject distinct applications without enabling Live', async () => {
    for (const [action, name, result] of [['approve', 'Approval', 'approved'], ['reject', 'Rejection', 'rejected']]) {
      await open(action, name);
      await reason.fill(`Acceptance ${action}`);
      await submit(action);
      await expect(ui(`status-application-${account(name).id}`)).toHaveText(`live: ${result}`);
      expect((await snapshot(name)).liveApplication).toBe(result);
    }
    await ui('nav-admin-overview').click();
    await expect(ui('status-live')).toHaveText('unavailable');
    const response = await page.request.get(origin + '/api/admin/developers');
    expect((await response.json()).liveEnabled).toBe(false);
  });
  await test.step('revoke credentials without suspending the account; merged audit in UI', async () => {
    await open('revoke', 'Revocation');
    await reason.fill('Acceptance revocation');
    await ui('input-admin-confirm').fill(account('Revocation').email);
    await submit('revoke');
    expect(await snapshot('Revocation')).toMatchObject({ status: 'active', sessions: 0, hasApiKey: false, hasLoginKey: true });
    await expect(ui(`status-account-${account('Revocation').id}`)).toHaveText('active');
    for (const [name, action, text] of [['Suspension', 'suspend', 'Acceptance suspension'], ['Revocation', 'revoke', 'Acceptance revocation']]) {
      await ui(`card-account-${account(name).id}`).getByText(/^Account audit/).click();
      const audit = ui(`list-audit-${account(name).id}`);
      await expect(audit).toContainText(`${action}:requested`);
      await expect(audit).toContainText(`${action}:applied`);
      await expect(audit).toContainText(text);
    }
  });
  await test.step('integer validation and same-request retry after committed response loss', async () => {
    await open('adjust', 'Adjustment');
    await reason.fill('Acceptance adjustment');
    await ui('input-admin-confirm').fill(account('Adjustment').email);
    for (const value of ['1.5', '+250', '0']) {
      await ui('input-adjust-amount').fill(value);
      await expect(confirm).toBeDisabled();
    }
    await ui('input-adjust-amount').fill('250');
    await expect(confirm).toBeEnabled();
    await isolated.api.post('/__admin-fixture', { data: { loseAdjustmentResponse: true } });
    await confirm.click();
    await expect(ui('text-admin-error')).toBeVisible();
    await expect(reason).toHaveValue('Acceptance adjustment');
    await expect(ui('input-adjust-amount')).toHaveValue('250');
    await expect(ui('input-admin-confirm')).toHaveValue(account('Adjustment').email);
    expect((await snapshot('Adjustment')).balanceSats).toBe(10250);
    const lost = JSON.parse(readFileSync(join(isolated.dir, 'lost-response.json'), 'utf8'));
    expect(lost.phase).toBe('after-commit');
    expect(lost.fixtureRunId).toBe(isolated.state.fixtureRunId);
    await submit('adjust');
    const after = await snapshot('Adjustment');
    expect(after.balanceSats).toBe(10250);
    expect(after.audit.filter(a => a.action === 'adjust:250')).toHaveLength(1);
    const evidence = readFileSync(join(isolated.dir, 'admin-evidence.jsonl'), 'utf8').trim().split('\n').map(JSON.parse).filter(e => e.path.endsWith('/adjust'));
    expect(evidence).toHaveLength(2);
    expect(evidence.map(e => e.body.requestId)).toEqual([lost.body.requestId, lost.body.requestId]);
    expect(evidence.every(e => e.status === 200)).toBe(true);
    await expect(ui(`card-account-${account('Adjustment').id}`)).toContainText('10,250');
  });
  await test.step('server expiry preserves dialog and allows real passkey recovery', async () => {
    await open('freeze', 'Revocation');
    await reason.fill('Acceptance expired confirmation');
    await isolated.api.post('/__admin-fixture', { data: { expireStepUp: true } });
    await submit('freeze', 403);
    await expect(reason).toHaveValue('Acceptance expired confirmation');
    await expect(ui('text-admin-error')).toContainText('confirmation required or expired');
    expect((await snapshot('Revocation')).status).toBe('active');
    await ui('button-dialog-passkey').click();
    await expect(confirm).toBeEnabled();
    await submit('freeze');
    await expect(ui(`status-account-${account('Revocation').id}`)).toHaveText('frozen');
  });
  await test.step('client expiry disables submission without ending server authentication', async () => {
    await open('activate', 'Revocation');
    await reason.fill('Acceptance client expiry');
    await expect(confirm).toBeEnabled();
    await page.clock.install();
    await page.clock.fastForward(301_000);
    await expect(confirm).toBeDisabled();
    await expect(ui('button-dialog-passkey')).toBeVisible();
    await expect(reason).toHaveValue('Acceptance client expiry');
    const response = await page.request.get(origin + '/api/vault/session');
    expect(response.status()).toBe(200);
    expect((await response.json()).authenticated).toBe(true);
  });
});

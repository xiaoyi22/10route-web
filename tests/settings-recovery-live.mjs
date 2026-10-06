import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { openLiveSession } from './live-support.mjs';

// Password changes and database replacement are restricted to the dedicated real snapshot instance.
assert.equal(process.env.PREVIEW_URL, 'http://127.0.0.1:4319', '恢复测试仅允许专用真实副本入口 4319');
const live = await openLiveSession('settings-recovery');
const { base, page, context, read, check } = live;
const credentials = parseEnv(await readFile(resolve(process.env.USERPROFILE || process.env.HOME, '.codex/credentials/10router-web.env'), 'utf8'));
const originalPassword = credentials.TENROUTER_TEST_PASSWORD;
const temporaryPassword = randomBytes(24).toString('base64url');
const sanitize = error => new Error(error.message.replaceAll(originalPassword, '[已隐藏]').replaceAll(temporaryPassword, '[已隐藏]'));
let activePassword = originalPassword;
let baseline;
let failure;
let needsRecovery = false;
try {
  const settings = await read('/api/settings');
  assert.equal(settings.enableTranslator, true, '必须连接独立测试实例');
  baseline = await live.backupDatabase();
  assert(baseline.providerConnections.length > 0 && baseline.proxyPools.length > 0, '必须使用真实数据库副本');
  await page.goto(base + '/dashboard/settings?tab=security', { waitUntil: 'domcontentloaded' });
  const form = page.getByRole('form', { name: '管理员密码', exact: true });
  await form.waitFor();
  async function changePassword(current, next) {
    await form.getByLabel('当前密码', { exact: true }).fill(current);
    await form.getByLabel('新密码', { exact: true }).fill(next);
    await form.getByLabel('确认新密码', { exact: true }).fill(next);
    const response = page.waitForResponse(response => new URL(response.url()).pathname === '/api/settings' && response.request().method() === 'PATCH');
    await form.getByRole('button', { name: '更新密码', exact: true }).click();
    assert.equal((await response).status(), 200);
    activePassword = next;
    await page.getByText('管理员密码已更新', { exact: true }).waitFor();
  }
  needsRecovery = true;
  await changePassword(originalPassword, temporaryPassword);
  assert.equal((await context.request.post(base + '/api/auth/login', { data: { password: temporaryPassword } })).status(), 200);
  const oldLogin = await context.request.post(base + '/api/auth/login', { data: { password: originalPassword } });
  assert.equal(oldLogin.status(), 401);
  assert.equal((await read('/api/auth/status')).authenticated, true);
  check('真实副本：界面修改密码成功，新密码登录返回 200，旧密码被拒绝且现有会话保留');
  await changePassword(temporaryPassword, originalPassword);
  assert.equal((await context.request.post(base + '/api/auth/login', { data: { password: originalPassword } })).status(), 200);
  check('真实副本：已通过界面恢复原管理员密码并重新登录');

  await page.getByRole('button', { name: '备份与恢复', exact: true }).click();
  await page.getByRole('button', { name: '导出备份', exact: true }).click();
  await page.getByLabel('确认管理员密码', { exact: true }).fill(originalPassword);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载备份', exact: true }).click();
  const exported = await downloadPromise;
  const privateDir = resolve(process.env.USERPROFILE || process.env.HOME, '.codex/credentials/full-integration-backups');
  await mkdir(privateDir, { recursive: true });
  const file = resolve(privateDir, `browser-export-${Date.now()}.json`);
  await exported.saveAs(file);
  const payload = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(payload.providerConnections.length, baseline.providerConnections.length);
  assert.deepEqual(payload.providerConnections.map(c => c.id).sort(), baseline.providerConnections.map(c => c.id).sort());
  check('真实副本：通过页面下载完整备份，账号数量与 ID 和真实数据库一致');
  const realPool = baseline.proxyPools[0];
  const created = await context.request.post(base + '/api/proxy-pools', { data: { name: `恢复验证-${Date.now()}`, proxyUrl: realPool.proxyUrl, type: realPool.type, isActive: false } });
  assert.equal(created.status(), 201);
  const extraId = (await created.json()).proxyPool.id;
  assert((await read('/api/proxy-pools')).proxyPools.some(pool => pool.id === extraId));
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '恢复备份', exact: true }).click();
  await page.getByLabel('备份文件', { exact: true }).setInputFiles(file);
  await page.getByLabel('确认管理员密码', { exact: true }).fill(originalPassword);
  const preRestoreDownload = page.waitForEvent('download');
  const restored = page.waitForResponse(response => new URL(response.url()).pathname === '/api/settings/database' && response.request().method() === 'POST');
  await page.getByRole('button', { name: '备份并恢复配置', exact: true }).click();
  await (await preRestoreDownload).saveAs(resolve(privateDir, `before-restore-${Date.now()}.bak.json`));
  assert.equal((await restored).status(), 200);
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert(!(await read('/api/proxy-pools')).proxyPools.some(pool => pool.id === extraId));
  const final = await context.request.get(base + '/api/settings/database', { headers: { 'x-10r-password': originalPassword } });
  assert.equal(final.status(), 200);
  const finalData = await final.json();
  for (const key of ['providerConnections', 'providerNodes', 'proxyPools', 'apiKeys', 'combos', 'modelAliases', 'customModels', 'mitmAlias', 'pricing']) assert.deepEqual(finalData[key], payload[key], `恢复不一致：${key}`);
  assert.equal((await context.request.post(base + '/api/auth/login', { data: { password: originalPassword } })).status(), 200);
  check('真实副本：恢复前自动备份，真实导入返回 200，额外记录被移除，逐项核对恢复数据一致且原密码可登录');
  assert.deepEqual(live.report.errors, []);
} catch (error) { failure = sanitize(error); console.error(failure.message); }
finally {
  if (needsRecovery && baseline) {
    try {
      assert.equal((await context.request.post(base + '/api/settings/database', { data: { ...baseline, password: activePassword } })).status(), 200);
      assert.equal((await context.request.post(base + '/api/auth/login', { data: { password: originalPassword } })).status(), 200);
      check('独立真实副本已恢复本次测试前的完整配置');
    } catch (error) { failure ||= sanitize(error); console.error('副本恢复失败：' + sanitize(error).message); }
  }
  await live.finish(failure);
}
if (failure) throw failure;

import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

const base = 'http://192.168.11.150:4317';
const directory = 'reports/combo-sticky/production';
const name = 'release-sticky-' + Date.now().toString(36);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(45000);
const report = { base, statuses: {}, checks: [], errors: [], temporaryComboRemoved: false };
page.on('pageerror', error => report.errors.push(error.message));
let id;
const read = async path => {
  const response = await page.request.get(base + path);
  assert.equal(response.status(), 200, path);
  return response.json();
};
try {
  const env = parseEnv(await readFile('C:/Users/Administrator/.codex/credentials/10router-web.env', 'utf8'));
  const login = await page.request.post(base + '/api/auth/login', { data: { password: env.TENROUTER_TEST_PASSWORD } });
  assert.equal(login.status(), 200);
  report.statuses.login = login.status();
  assert(!(await read('/api/auth/status')).demo);
  assert.equal((await read('/api/health')).driver, 'better-sqlite3');
  const before = await read('/api/settings');
  const combos = (await read('/api/combos')).combos;
  assert(combos.length);
  const invalid = await page.request.patch(base + '/api/settings', { data: { comboStrategies: { [name]: { comboStickyRoundRobinLimit: 1.5 } } } });
  assert.equal(invalid.status(), 400);
  assert.equal((await invalid.json()).code, 'COMBO_STICKY_LIMIT_INVALID');
  assert.deepEqual((await read('/api/settings')).comboStrategies, before.comboStrategies);
  report.statuses.invalidCount = invalid.status();
  const created = await page.request.post(base + '/api/combos', { data: { name, models: combos[0].models, kind: combos[0].kind || null } });
  assert.equal(created.status(), 201);
  id = (await created.json()).id;
  assert(id);
  await page.goto(base + '/dashboard/combos');
  await page.getByRole('button', { name: `编辑组合 ${name}`, exact: true }).click();
  await page.getByLabel('调度方式', { exact: true }).selectOption('round-robin');
  await page.getByLabel('自定义粘性轮询次数').check();
  await page.getByLabel('粘性轮询次数', { exact: true }).fill('9');
  await mkdir(directory, { recursive: true });
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const checkbox = await page.getByLabel('自定义粘性轮询次数').boundingBox();
    assert(checkbox.width <= 20 && checkbox.height <= 20);
    await page.screenshot({ path: `${directory}/editor-${width}.png`, fullPage: true });
  }
  const comboResponse = page.waitForResponse(response => response.url().endsWith('/api/combos/' + id) && response.request().method() === 'PUT');
  const settingsResponse = page.waitForResponse(response => response.url().endsWith('/api/settings') && response.request().method() === 'PATCH');
  await page.getByRole('button', { name: '保存组合模型', exact: true }).click();
  assert.equal((await comboResponse).status(), 200);
  assert.equal((await settingsResponse).status(), 200);
  report.statuses.comboSave = 200;
  report.statuses.settingsSave = 200;
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const saved = await read('/api/settings');
  assert.deepEqual(saved.comboStrategies[name], { fallbackStrategy: 'round-robin', comboStickyRoundRobinLimit: 9 });
  assert.equal(saved.comboStrategy, before.comboStrategy);
  assert.equal(saved.comboStickyRoundRobinLimit, before.comboStickyRoundRobinLimit);
  assert.equal(saved.stickyRoundRobinLimit, before.stickyRoundRobinLimit);
  await page.reload();
  await page.getByRole('button', { name: `编辑组合 ${name}`, exact: true }).click();
  assert.equal(await page.getByLabel('调度方式', { exact: true }).inputValue(), 'round-robin');
  assert.equal(await page.getByLabel('粘性轮询次数', { exact: true }).inputValue(), '9');
  await page.getByLabel('调度方式', { exact: true }).selectOption('fallback');
  await page.getByRole('button', { name: '保存组合模型', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.deepEqual((await read('/api/settings')).comboStrategies[name], { fallbackStrategy: 'fallback', comboStickyRoundRobinLimit: 9 });
  await page.getByRole('button', { name: `编辑组合 ${name}`, exact: true }).click();
  await page.getByLabel('调度方式', { exact: true }).selectOption('round-robin');
  await page.getByLabel('自定义粘性轮询次数').uncheck();
  await page.getByRole('button', { name: '保存组合模型', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.deepEqual((await read('/api/settings')).comboStrategies[name], { fallbackStrategy: 'round-robin' });
  await page.getByRole('button', { name: `编辑组合 ${name}`, exact: true }).click();
  await page.getByLabel('调度方式', { exact: true }).selectOption('');
  await page.getByRole('button', { name: '保存组合模型', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.deepEqual((await read('/api/settings')).comboStrategies[name], {});
  report.checks.push('生产真实保存9次并刷新保持，主备保留次数，次数和策略分别继承通过');
  assert.deepEqual(report.errors, []);
  report.checks.push('生产桌面和手机页面无溢出，复选框尺寸正常，无未捕获异常');
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = error.message.split('\n')[0];
  process.exitCode = 1;
} finally {
  try {
    if (id) {
      const current = await read('/api/settings');
      const comboStrategies = { ...current.comboStrategies };
      delete comboStrategies[name];
      assert.equal((await page.request.patch(base + '/api/settings', { data: { comboStrategies } })).status(), 200);
      assert.equal((await page.request.delete(base + '/api/combos/' + id)).status(), 200);
      assert(!(await read('/api/combos')).combos.some(combo => combo.id === id));
      assert(!Object.hasOwn((await read('/api/settings')).comboStrategies, name));
      report.temporaryComboRemoved = true;
    }
  } catch (error) {
    report.passed = false;
    report.cleanupFailure = error.message.split('\n')[0];
    process.exitCode = 1;
  }
  await mkdir(directory, { recursive: true });
  await writeFile(directory + '/acceptance.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}

import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { chromium } from 'playwright';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4326';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = { data: 'real-gateway-readonly-with-browser-local-save-tests', checks: [], screenshots: [], errors: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(45000);
  page.on('pageerror', error => report.errors.push(error.message));
  const env = parseEnv(await readFile(process.env.TENROUTER_TEST_LOGIN_ENV || 'C:/Users/Administrator/.codex/credentials/10router-web.env', 'utf8'));
  const status = await page.request.get(base + '/api/auth/status');
  assert.equal(status.status(), 200);
  assert(!(await status.json()).demo);
  const login = await page.request.post(base + '/api/auth/login', { data: { password: env.TENROUTER_TEST_PASSWORD } });
  assert.equal(login.status(), 200);
  const read = async path => {
    const response = await page.request.get(base + path);
    assert.equal(response.status(), 200, path);
    return response.json();
  };
  const settings = await read('/api/settings');
  const comboData = await read('/api/combos');
  assert(comboData.combos.length, 'Real combo data is required');
  report.checks.push('真实认证、组合与设置接口均返回 HTTP 200，无 demo 标记');
  const combo = comboData.combos[0];
  const originalName = combo.name;
  const originalOther = structuredClone(settings.comboStrategies || {});
  delete originalOther[originalName];
  settings.comboStrategy = 'round-robin';
  settings.comboStickyRoundRobinLimit = 3;
  settings.comboStrategies ||= {};
  settings.comboStrategies[originalName] = { fallbackStrategy: 'fallback', comboStickyRoundRobinLimit: 5, retryOnEmpty: true };
  let comboWrites = 0, settingsWrites = 0, failSettings = false;
  await page.route('**/api/settings', async route => {
    if (route.request().method() === 'PATCH') {
      settingsWrites++;
      if (failSettings) { failSettings = false; return route.fulfill({ status: 503, json: { error: '隔离测试：策略保存失败' } }); }
      Object.assign(settings, route.request().postDataJSON());
    }
    await route.fulfill({ json: settings });
  });
  await page.route('**/api/combos{,/*}', async route => {
    const method = route.request().method();
    if (method !== 'GET') {
      assert.equal(method, 'PUT', 'Only isolated edits are allowed');
      comboWrites++;
      Object.assign(combo, route.request().postDataJSON());
      return route.fulfill({ json: combo });
    }
    await route.fulfill({ json: comboData });
  });
  const edit = async () => {
    await page.getByRole('button', { name: `编辑组合 ${combo.name}`, exact: true }).click();
    await page.getByRole('dialog').waitFor();
  };
  const save = async () => {
    await page.getByRole('button', { name: '保存组合模型', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
  };
  await page.goto(base + '/dashboard/combos');
  await edit();
  assert.equal(await page.getByLabel('调度方式', { exact: true }).inputValue(), 'fallback');
  assert.equal(await page.getByLabel('自定义粘性轮询次数').count(), 0);
  await page.getByLabel('调度方式', { exact: true }).selectOption('round-robin');
  assert.equal(await page.getByLabel('粘性轮询次数', { exact: true }).inputValue(), '5');
  await page.getByLabel('粘性轮询次数', { exact: true }).fill('1.5');
  await page.getByRole('button', { name: '保存组合模型', exact: true }).click();
  assert.equal(comboWrites, 0, 'Invalid count must not save name or members');
  await page.getByLabel('粘性轮询次数', { exact: true }).fill('9');
  settings.comboStrategies.__concurrent_neighbor = { fallbackStrategy: 'fallback', untouched: true };
  await mkdir('reports/combo-sticky', { recursive: true });
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No page overflow');
    const numeric = await page.getByLabel('粘性轮询次数', { exact: true }).boundingBox();
    assert(numeric.x >= 0 && numeric.x + numeric.width <= width);
    const checkbox = await page.getByLabel('自定义粘性轮询次数').boundingBox();
    assert(checkbox.width <= 20 && checkbox.height <= 20, 'Checkbox uses existing compact control styling');
    const file = `reports/combo-sticky/editor-${width}.png`;
    await page.screenshot({ path: file, fullPage: true });
    report.screenshots.push(file);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await save();
  assert.equal(settings.comboStrategies[combo.name].comboStickyRoundRobinLimit, 9);
  assert.equal(settings.comboStrategies[combo.name].retryOnEmpty, true);
  assert.equal(settings.comboStrategies.__concurrent_neighbor.untouched, true);
  for (const [name, value] of Object.entries(originalOther)) assert.deepEqual(settings.comboStrategies[name], value);
  await page.reload();
  await edit();
  assert.equal(await page.getByLabel('粘性轮询次数', { exact: true }).inputValue(), '9');
  const renamed = originalName + '-sticky-review';
  await page.getByLabel('下游模型名称', { exact: true }).fill(renamed);
  await save();
  assert.equal(combo.name, renamed);
  assert(!settings.comboStrategies[originalName]);
  assert.equal(settings.comboStrategies[renamed].comboStickyRoundRobinLimit, 9);
  await edit();
  await page.getByLabel('调度方式', { exact: true }).selectOption('fallback');
  await save();
  assert.equal(settings.comboStrategies[renamed].comboStickyRoundRobinLimit, 9, 'Inactive override is preserved');
  await edit();
  await page.getByLabel('调度方式', { exact: true }).selectOption('');
  await page.getByLabel('自定义粘性轮询次数').uncheck();
  await save();
  assert.deepEqual(settings.comboStrategies[renamed], { retryOnEmpty: true });
  await page.getByRole('row').filter({ has: page.getByRole('cell', { name: renamed, exact: true }) }).getByText('粘性轮询（策略继承） · 3 次（次数继承）', { exact: true }).waitFor();
  report.checks.push('保存9次并刷新、改名迁移、主备保留次数、分别继承、保留其他字段与并发新增配置、非法小数不保存均通过');
  await edit();
  await page.getByLabel('调度方式', { exact: true }).selectOption('round-robin');
  await page.getByLabel('自定义粘性轮询次数').check();
  await page.getByLabel('粘性轮询次数', { exact: true }).fill('9');
  const writesBefore = comboWrites;
  failSettings = true;
  await page.getByRole('button', { name: '保存组合模型', exact: true }).click();
  await page.getByRole('button', { name: '重试保存调度方式', exact: true }).waitFor();
  assert.equal(comboWrites, writesBefore + 1);
  await page.getByRole('button', { name: '重试保存调度方式', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(comboWrites, writesBefore + 1, 'Retry does not resubmit combo edit');
  assert.equal(settings.comboStrategies[renamed].comboStickyRoundRobinLimit, 9);
  settings.comboStrategies[renamed].fallbackStrategy = 'fusion';
  await page.reload();
  await edit();
  assert.equal(await page.getByLabel('调度方式', { exact: true }).inputValue(), 'fusion');
  await save();
  assert.equal(settings.comboStrategies[renamed].fallbackStrategy, 'fusion');
  assert.equal(settings.comboStrategies[renamed].comboStickyRoundRobinLimit, 9);
  report.checks.push('两阶段失败重试只保存策略，已有融合策略与非活动次数完整保留');
  assert.deepEqual(report.errors, []);
  report.checks.push('桌面1440和手机375无页面溢出，页面无未捕获异常，生产配置零写入');
  report.passed = true;
  console.log(JSON.stringify({ passed: true, checks: report.checks, comboWrites, settingsWrites }, null, 2));
} catch (error) {
  report.passed = false;
  report.failure = error.message;
  console.error(error.message.split('\n')[0]);
  process.exitCode = 1;
} finally {
  await mkdir('reports/combo-sticky', { recursive: true });
  await writeFile('reports/combo-sticky/browser.json', JSON.stringify(report, null, 2));
  await browser.close();
}

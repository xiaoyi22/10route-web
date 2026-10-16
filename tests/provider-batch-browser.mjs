import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { selectTheme } from './theme-control.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4329';
const directory = resolve('reports/provider-batch-20261013/isolated');
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
const testRequests = [];
const proxyRequests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => {
  const path = new URL(request.url()).pathname;
  if (/^\/api\/providers\/[^/]+\/test$/.test(path) && request.method() === 'POST') testRequests.push(path);
  if (/^\/api\/providers\/[^/]+$/.test(path) && request.method() === 'PUT') proxyRequests.push({ path, body: request.postDataJSON() });
});
const read = async () => (await context.request.get(base + '/api/providers')).json();
const all = () => page.getByLabel('全选当前供应商', { exact: true });
const summary = () => page.locator('.provider-batch-results').getByRole('status');
const saved = () => page.getByRole('dialog').getByRole('button', { name: '保存代理配置', exact: true });
const report = { mode: 'isolated-fixture', checks: [] };
const check = text => { report.checks.push(text); console.log(text); };
const created = [];
try {
  assert.equal((await (await context.request.get(base + '/api/auth/status')).json()).demo, true);
  assert.equal((await context.request.post(base + '/api/auth/login', { data: { password: 'linear-demo' } })).status(), 200);
  for (const [index, name] of ['批量账号 A', '批量账号 B', '批量账号 C'].entries()) {
    const response = await context.request.post(base + '/api/providers', { data: { provider: 'openai', name, apiKey: 'fixture-key', priority: index + 5 } });
    assert.equal(response.status(), 201);
    created.push((await response.json()).connection);
  }
  const [first, second, disabled] = created;
  assert.equal((await context.request.put(`${base}/api/providers/${disabled.id}`, { data: { isActive: false } })).status(), 200);
  await page.goto(base + '/dashboard/providers');
  await page.getByLabel('选择供应商 OpenAI', { exact: true }).waitFor();
  await all().check();
  const supplierBoxes = page.getByRole('checkbox', { name: /^选择供应商 / });
  for (const box of await supplierBoxes.all()) if (await box.isEnabled()) assert(await box.isChecked());
  await page.getByLabel('选择供应商 OpenAI', { exact: true }).uncheck();
  assert.equal(await all().evaluate(input => input.indeterminate), true);
  await page.getByLabel('搜索供应商').fill('OpenAI');
  await page.locator('.provider-batch-toolbar').getByText('已选 0 个供应商 · 0 个账号', { exact: true }).waitFor();
  await all().check();
  await page.locator('.provider-batch-toolbar').getByText('已选 2 个供应商 · 4 个账号', { exact: true }).waitFor();
  await page.getByLabel('选择供应商 OpenAI Codex', { exact: true }).uncheck();
  await page.locator('.provider-batch-toolbar').getByText('已选 1 个供应商 · 3 个账号', { exact: true }).waitFor();
  check('供应商全选、半选、筛选清空选择及所属全部账号计数正确');

  let failTest = true;
  await page.route(`**/api/providers/${second.id}/test`, route => failTest ? route.fulfill({ json: { valid: false, error: '批量测试演示失败' } }) : route.continue());
  await page.getByRole('button', { name: '批量测试', exact: true }).click();
  await summary().getByText('批量测试结果：成功 1，失败 1，跳过 1', { exact: true }).waitFor();
  assert.deepEqual(testRequests, [`/api/providers/${first.id}/test`, `/api/providers/${second.id}/test`]);
  failTest = false;
  await page.getByRole('button', { name: '重试失败项', exact: true }).click();
  await summary().getByText('批量测试结果：成功 1，失败 0，跳过 0', { exact: true }).waitFor();
  assert.deepEqual(testRequests, [`/api/providers/${first.id}/test`, `/api/providers/${second.id}/test`, `/api/providers/${second.id}/test`]);
  check('批量测试跳过停用账号，200/valid=false 保留失败，重试只发送失败账号');

  let failProxy = true;
  await page.route(`**/api/providers/${second.id}`, route => route.request().method() === 'PUT' && failProxy ? route.fulfill({ status: 503, json: { error: '批量代理演示失败' } }) : route.continue());
  await page.getByRole('button', { name: '批量绑定代理', exact: true }).click();
  await page.getByLabel('代理方式', { exact: true }).selectOption('pool');
  await page.getByLabel('代理池', { exact: true }).selectOption('demo-best');
  await saved().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('status').getByText('代理配置结果：成功 2，失败 1，跳过 0', { exact: true }).waitFor();
  let current = (await read()).connections;
  assert.equal(current.find(item => item.id === first.id).providerSpecificData.proxyPoolId, 'demo-best');
  assert.equal(current.find(item => item.id === disabled.id).providerSpecificData.proxyPoolId, 'demo-best');
  assert(!current.find(item => item.id === second.id).providerSpecificData?.proxyPoolId);
  failProxy = false;
  await dialog.getByRole('button', { name: '重试失败项', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  assert.deepEqual(proxyRequests.map(item => item.path), [`/api/providers/${first.id}`, `/api/providers/${second.id}`, `/api/providers/${disabled.id}`, `/api/providers/${second.id}`]);
  current = (await read()).connections;
  for (const account of created) {
    const stored = current.find(item => item.id === account.id);
    assert.equal(stored.providerSpecificData.proxyPoolId, 'demo-best');
    assert.equal(stored.priority, account.priority);
  }
  assert.equal(current.find(item => item.id === disabled.id).isActive, false);
  check('批量代理池绑定包含停用账号；部分失败可重试，成功账号不重复写入，优先级和启用状态保持');

  await page.getByRole('button', { name: '批量绑定代理', exact: true }).click();
  await page.getByLabel('代理方式', { exact: true }).selectOption('connection');
  await page.getByLabel('代理地址', { exact: true }).fill('http://127.0.0.1:7892');
  await page.getByLabel('绕过代理', { exact: true }).fill('.fixture.invalid');
  await saved().click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  current = (await read()).connections;
  for (const account of created) assert.deepEqual(current.find(item => item.id === account.id).providerSpecificData, { proxyPoolId: null, connectionProxyEnabled: true, connectionProxyUrl: 'http://127.0.0.1:7892', connectionNoProxy: '.fixture.invalid' });
  await page.getByRole('button', { name: '批量绑定代理', exact: true }).click();
  await saved().click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  current = (await read()).connections;
  for (const account of created) assert.deepEqual(current.find(item => item.id === account.id).providerSpecificData, { proxyPoolId: null, connectionProxyEnabled: false, connectionProxyUrl: '', connectionNoProxy: '' });
  check('批量连接专用代理及恢复继承全局规则持久化正确');

  await page.goto(base + '/dashboard/providers/openai');
  const allAccounts = page.getByLabel('全选当前账号', { exact: true });
  await allAccounts.waitFor();
  assert.equal(await allAccounts.isChecked(), false);
  await page.getByLabel(`选择账号 ${first.name}`, { exact: true }).check();
  assert.equal(await allAccounts.evaluate(input => input.indeterminate), true);
  await allAccounts.check();
  await page.locator('.provider-batch-toolbar').getByText('已选 3 个账号', { exact: true }).waitFor();
  await page.getByLabel('搜索供应商').fill(second.name);
  await page.waitForFunction(() => document.querySelectorAll('input[aria-label^="选择账号 "]').length === 1);
  assert.equal(await page.getByRole('checkbox', { name: /^选择账号 / }).count(), 1);
  assert.equal(await allAccounts.isChecked(), false);
  await allAccounts.check();
  await page.locator('.provider-batch-toolbar').getByText('已选 1 个账号', { exact: true }).waitFor();
  await page.getByRole('button', { name: '取消选择', exact: true }).click();
  assert.equal(await allAccounts.isChecked(), false);
  await page.getByLabel('搜索供应商').fill('');
  await allAccounts.check();
  const writesBeforeCancel = proxyRequests.length;
  await page.getByRole('button', { name: '批量绑定代理', exact: true }).click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(proxyRequests.length, writesBeforeCancel);
  check('账号层全选、半选、筛选范围、取消选择与取消代理窗口正确');

  for (const route of ['providers', 'providers/openai']) {
    await page.goto(base + '/dashboard/' + route);
    await page.getByLabel(route === 'providers' ? '全选当前供应商' : '全选当前账号', { exact: true }).check();
    for (const theme of ['dark', 'light']) {
      await selectTheme(page, theme);
      for (const width of [320, 375, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route}/${theme}/${width} page overflow`);
        assert(await page.locator('.provider-batch-toolbar').evaluate(element => element.scrollWidth <= element.clientWidth), `${route}/${theme}/${width} toolbar overflow`);
      }
      await page.screenshot({ path: resolve(directory, `${route.replace('/', '-')}-${theme}.png`), fullPage: true });
      await page.setViewportSize({ width: 375, height: 1000 });
      await page.getByRole('button', { name: '批量绑定代理', exact: true }).click();
      assert(await page.getByRole('dialog').evaluate(element => element.scrollWidth <= element.clientWidth));
      await page.getByRole('button', { name: '取消', exact: true }).click();
    }
  }
  check('两层批量工具栏及代理窗口通过深浅主题与四种屏宽检查');
  assert.deepEqual(errors, []);
  report.errors = errors;
  await writeFile(resolve(directory, 'acceptance.json'), JSON.stringify(report, null, 2));
  console.log('PASS: isolated bulk provider operations; no uncaught browser errors');
} finally {
  for (const connection of created) await context.request.delete(`${base}/api/providers/${connection.id}`);
  await browser.close();
}

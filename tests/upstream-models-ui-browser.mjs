import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'C:/Users/20449/AppData/Local/Temp/hermes-e2e/.venv/Lib/site-packages/playwright/driver/package');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4318';
const screenshots = process.env.SCREENSHOT_DIR || 'screenshots/upstream-models';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(120000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  assert.equal((await (await context.request.get(base + '/api/auth/status')).json()).demo, true);
  assert.equal((await context.request.post(base + '/api/auth/login', { data: { password: 'linear-demo' } })).status(), 200);
  const provider = 'openai-compatible-ui';
  const connections = [
    { id: 'bad', provider, name: '异常账号', isActive: true, lastError: 'HTTP 401', authType: 'apikey' },
    { id: 'good', provider, name: '正常查询账号', isActive: true, testStatus: 'success', authType: 'apikey' },
  ];
  const saved = [{ providerAlias: provider, id: 'registered', name: '已登记模型', type: 'llm', enabled: true }];
  const items = [
    { id: 'registered', name: '已登记模型' }, { id: 'new-a', name: '新模型甲' }, { id: 'new-b', name: '新模型乙' },
    { id: 'very-long-model-id-that-must-wrap-on-mobile-'.repeat(3), name: '长名称模型用于检查手机宽度和换行' },
  ];
  await page.route('**/api/providers', route => route.fulfill({ json: { connections } }));
  await page.route('**/api/provider-nodes', route => route.fulfill({ json: { nodes: [{ id: provider, name: '界面验收供应商', prefix: 'ui', type: 'openai-compatible' }] } }));
  await page.route('**/api/models', route => route.fulfill({ json: { models: [] } }));
  let failImport = true;
  const posted = [];
  await page.route('**/api/models/custom', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { models: saved } });
    const body = route.request().postDataJSON();
    posted.push(body.id);
    if (failImport && body.id === 'new-b') return route.fulfill({ status: 503, json: { error: 'Model save temporarily unavailable' } });
    assert(!saved.some(model => model.id === body.id), '成功导入的模型不得再次提交');
    saved.push(body);
    return route.fulfill({ status: 201, json: { model: body } });
  });
  let listing = items;
  const fetched = [];
  await page.route('**/api/providers/*/models', route => {
    fetched.push(route.request().url());
    return route.fulfill({ json: { models: listing } });
  });
  await page.goto(base + '/dashboard/providers');
  const healthy = page.getByLabel('仅显示正常连接');
  await healthy.check();
  await page.getByRole('link', { name: '界面验收供应商 自定义节点 · ui' }).click();
  await page.waitForURL(base + '/dashboard/providers/' + provider);
  await page.getByRole('button', { name: '查看连接 正常查询账号', exact: true }).waitFor();
  assert.equal(await healthy.isChecked(), true);
  assert.equal(await page.getByRole('button', { name: '查看连接 异常账号', exact: true }).count(), 0);
  await page.getByRole('link', { name: '全部供应商', exact: true }).click();
  await page.waitForURL(base + '/dashboard/providers');
  assert.equal(await healthy.isChecked(), true);
  await page.goto(base + '/dashboard/models');
  await page.goto(base + '/dashboard/providers');
  assert.equal(await healthy.isChecked(), true);
  await page.reload();
  assert.equal(await healthy.isChecked(), true);
  assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('10router-web-preferences')))).state.healthyConnectionsOnly, true);
  await healthy.uncheck();
  await page.reload();
  assert.equal(await healthy.isChecked(), false);
  await page.goto(base + '/dashboard/providers/' + provider);
  await page.getByRole('button', { name: '获取上游模型', exact: true }).click();
  const dialog = page.getByRole('dialog');
  assert.equal(await dialog.getByLabel('查询账号').inputValue(), 'good');
  assert.equal(fetched.length, 0, '打开弹窗不自动查询供应商');
  await dialog.getByRole('button', { name: '获取模型列表', exact: true }).click();
  await dialog.getByLabel('导入 new-a', { exact: true }).waitFor();
  assert.equal(fetched.length, 1);
  assert(fetched[0].endsWith('/good/models'));
  assert.equal(await dialog.getByLabel('导入 registered', { exact: true }).isDisabled(), true);
  assert.match(await dialog.locator('.upstream-counts').innerText(), /上游模型 4.*待导入 3.*已登记 1.*已选择 0/s);
  await dialog.getByLabel('搜索上游模型').fill('new-');
  await dialog.getByLabel('导入 new-a', { exact: true }).check();
  assert.equal(await dialog.getByLabel('选择当前结果（2）').evaluate(input => input.indeterminate), true);
  await dialog.getByLabel('选择当前结果（2）').check();
  await dialog.getByLabel('搜索上游模型').fill('长名称');
  assert.match(await dialog.locator('.upstream-selected-count').innerText(), /已选择 2 个.*当前结果外 2 个/);
  await dialog.getByLabel('搜索上游模型').fill('');
  await mkdir(screenshots, { recursive: true });
  for (const width of [1440, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      assert(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), `弹窗溢出 ${width}`);
      assert(await dialog.locator('.upstream-model-list').evaluate(element => element.scrollWidth <= element.clientWidth), `模型列表溢出 ${width}`);
      await page.screenshot({ path: `${screenshots}/models-${width}-${theme}.png` });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await dialog.getByRole('button', { name: '导入所选模型（2）', exact: true }).click();
  await dialog.getByText('已导入 1 / 2 个模型，剩余 1 个未导入。', { exact: true }).waitFor();
  await dialog.getByText('HTTP 503 · 上游服务异常', { exact: true }).waitFor();
  assert.equal(await dialog.getByLabel('导入 new-a', { exact: true }).isDisabled(), true);
  assert.equal(await dialog.getByLabel('导入 new-b', { exact: true }).isChecked(), true);
  failImport = false;
  await dialog.getByRole('button', { name: '导入所选模型（1）', exact: true }).click();
  await dialog.getByText('已导入 1 个模型，已向下游发布。', { exact: true }).waitFor();
  assert.deepEqual(posted, ['new-a', 'new-b', 'new-b']);
  await dialog.getByLabel('登记状态').selectOption('registered');
  assert.equal(await dialog.locator('tbody tr').count(), 3);
  await dialog.getByRole('button', { name: '完成', exact: true }).click();
  await page.getByRole('button', { name: '获取上游模型', exact: true }).click();
  await dialog.getByRole('button', { name: '获取模型列表', exact: true }).click();
  await dialog.getByLabel('导入 new-a', { exact: true }).waitFor();
  assert.equal(await dialog.getByLabel('导入 new-a', { exact: true }).isDisabled(), true);
  await dialog.getByLabel('查询账号').selectOption('bad');
  assert.equal(await dialog.locator('table').count(), 0, '换账号后清除旧结果');
  listing = [];
  await dialog.getByRole('button', { name: '获取模型列表', exact: true }).click();
  await dialog.getByText('上游返回了空模型列表', { exact: true }).waitFor();
  assert.equal(await dialog.getByRole('button', { name: '导入所选模型', exact: true }).isDisabled(), true);
  assert.deepEqual(errors, []);
  console.log('通过：筛选记忆、账号选择、搜索与全选、登记状态、导入失败重试及去重、空列表、桌面手机深浅主题，控制台无未捕获异常。');
} finally { await browser.close(); }

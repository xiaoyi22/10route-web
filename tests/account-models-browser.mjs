import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4331';
const provider = 'openai-compatible-chat-scopes';
const connections = [
  { id: 'dp', provider, name: 'DP', authType: 'apikey', isActive: true, providerSpecificData: { enabledModels: ['old-dp'], proxyPoolId: 'keep-proxy' } },
  { id: 'default', provider, name: 'Default', authType: 'apikey', isActive: true, providerSpecificData: { enabledModels: ['old-gpt'] } },
  { id: 'disabled', provider, name: 'Disabled', authType: 'apikey', isActive: false },
];
const listings = { dp: ['deepseek'], default: ['gpt'] };
const saved = [{ providerAlias: provider, id: 'deepseek', name: 'deepseek', enabled: true, type: 'llm' }];
const writes = [];
const errors = [];
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  assert.equal((await context.request.post(base + '/api/auth/login', { data: { password: 'linear-demo' } })).status(), 200);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/providers', route => route.fulfill({ json: { connections } }));
  await page.route('**/api/provider-nodes', route => route.fulfill({ json: { nodes: [{ id: provider, name: 'Scope supplier', prefix: 'scopes', type: 'openai-compatible' }] } }));
  await page.route('**/api/providers/*', async route => {
    const id = new URL(route.request().url()).pathname.split('/').pop();
    const connection = connections.find(item => item.id === id);
    assert(connection);
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      writes.push({ id, body });
      connection.providerSpecificData = { ...connection.providerSpecificData, ...body.providerSpecificData };
      if (body.name) connection.name = body.name;
    }
    return route.fulfill({ json: { connection } });
  });
  await page.route('**/api/providers/*/models', route => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2);
    return route.fulfill({ json: { models: listings[id] || [] } });
  });
  await page.route('**/api/models', route => route.fulfill({ json: { models: [] } }));
  await page.route('**/api/models/custom', route => {
    if (route.request().method() === 'POST') saved.push(route.request().postDataJSON());
    return route.fulfill({ json: { models: saved } });
  });
  await page.route('**/api/models/distribution', route => {
    assert.equal(route.request().method(), 'GET', '账号范围操作不得修改下游发布');
    return route.fulfill({ json: { mode: 'allowlist', models: ['scopes/gpt'], catalog: [...saved.map(model => ({ id: `scopes/${model.id}` })), { id: 'scopes/gpt' }] } });
  });
  await page.goto(base + '/dashboard/providers/' + provider);
  await page.getByLabel('仅显示正常连接').uncheck();
  for (const name of ['DP', 'Default', 'Disabled']) await page.getByLabel(`选择账号 ${name}`, { exact: true }).check();
  await page.getByRole('button', { name: '同步模型范围', exact: true }).click();
  await page.getByText('模型范围同步结果：成功 2，失败 0，跳过 1', { exact: true }).waitFor();
  assert.deepEqual(writes.map(write => [write.id, write.body.providerSpecificData.enabledModels]), [['dp', ['deepseek']], ['default', ['gpt']]]);
  assert.equal(connections[0].providerSpecificData.proxyPoolId, 'keep-proxy');
  await page.reload();
  await page.getByRole('button', { name: '编辑 DP', exact: true }).click();
  const dialog = page.getByRole('dialog');
  assert.equal(await dialog.getByRole('textbox', { name: '允许的上游模型', exact: true }).inputValue(), 'deepseek');
  listings.dp = [];
  const beforeEmpty = writes.length;
  await dialog.getByRole('button', { name: '从此账号获取模型范围', exact: true }).click();
  await dialog.getByText('上游返回空模型列表，已保留原模型范围', { exact: true }).waitFor();
  assert.equal(await dialog.getByRole('textbox', { name: '允许的上游模型', exact: true }).inputValue(), 'deepseek');
  assert.equal(writes.length, beforeEmpty);
  await dialog.getByRole('textbox', { name: '允许的上游模型', exact: true }).fill('deepseek\ncommon\ndeepseek');
  await dialog.getByRole('button', { name: '保存连接', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.deepEqual(connections[0].providerSpecificData.enabledModels, ['deepseek', 'common']);
  await page.getByRole('button', { name: '编辑 DP', exact: true }).click();
  await dialog.getByRole('combobox', { name: '账号模型范围', exact: true }).selectOption('all');
  await dialog.getByRole('button', { name: '保存连接', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(connections[0].providerSpecificData.enabledModels, null);
  await page.getByRole('button', { name: '编辑 DP', exact: true }).click();
  await dialog.getByRole('combobox', { name: '账号模型范围', exact: true }).selectOption('restricted');
  await dialog.getByRole('textbox', { name: '允许的上游模型', exact: true }).fill('deepseek');
  await dialog.getByLabel('替换 API Key', { exact: true }).fill('not-a-real-key');
  assert(await dialog.getByRole('button', { name: '从此账号获取模型范围', exact: true }).isDisabled());
  await dialog.getByLabel('替换 API Key', { exact: true }).fill('');
  await mkdir('reports/account-models', { recursive: true });
  for (const width of [1440, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      assert(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), `编辑弹窗溢出：${width}/${theme}`);
      await page.screenshot({ path: `reports/account-models/editor-${width}-${theme}.png` });
    }
  }
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  listings.dp = ['deepseek', 'common'];
  await page.getByRole('button', { name: '获取上游模型', exact: true }).click();
  await dialog.getByRole('combobox', { name: '查询账号', exact: true }).selectOption('dp');
  await dialog.getByRole('button', { name: '获取模型列表', exact: true }).click();
  await dialog.getByLabel('导入 common', { exact: true }).check();
  await dialog.getByRole('button', { name: '导入所选模型（1）', exact: true }).click();
  await dialog.getByText('已导入 1 个模型，请在「下游分发」确认发布范围。', { exact: true }).waitFor();
  assert.deepEqual(connections[0].providerSpecificData.enabledModels, ['deepseek', 'common'], '导入一个模型也应保存完整账号范围');
  assert(saved.some(model => model.id === 'common'));
  assert.equal(await dialog.getByText('下游：未发布', { exact: true }).count(), 2);
  await dialog.getByRole('combobox', { name: '查询账号', exact: true }).selectOption('default');
  await dialog.getByRole('button', { name: '获取模型列表', exact: true }).click();
  await dialog.getByRole('button', { name: '同步此账号模型范围', exact: true }).click();
  await dialog.getByText('已同步 Default 的 1 个模型；下游发布范围保持原设置。', { exact: true }).waitFor();
  assert.deepEqual(connections[1].providerSpecificData.enabledModels, ['gpt']);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, checks: ['逐key批量同步及跳过停用账号', '空列表不写入且保留草稿', '手动范围保存与解除', '替换key禁止查询旧key', '导入时保存完整账号范围', '登记与发布状态分开', '桌面手机深浅主题无溢出', '无未捕获异常'], writes: writes.length }));
} finally { await browser.close(); }

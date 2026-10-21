import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4332';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] });
const report = { base, mode: '真实读取，配置写入由浏览器拦截', http: [], writes: [], errors: [] };
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const read = async path => {
    const response = await context.request.get(base + path);
    report.http.push({ path, status: response.status() });
    assert.equal(response.status(), 200, path);
    return response.json();
  };
  assert.equal((await read('/api/health')).driver, 'better-sqlite3');
  assert.notEqual((await read('/api/auth/status')).demo, true);
  const loginPath = process.env.TENROUTER_TEST_LOGIN_ENV || resolve(process.env.USERPROFILE, '.codex/credentials/10router-web.env');
  const env = parseEnv(await readFile(loginPath, 'utf8'));
  const login = await context.request.post(base + '/api/auth/login', { data: { password: env.TENROUTER_TEST_PASSWORD.trim() } });
  report.http.push({ path: '/api/auth/login', status: login.status() });
  assert.equal(login.status(), 200);
  const nodes = (await read('/api/provider-nodes')).nodes;
  const node = nodes.find(node => node.prefix === 'aiapi');
  assert(node, 'aiapi 节点存在');
  const connections = (await read('/api/providers')).connections;
  const dp = connections.find(connection => connection.provider === node.id && connection.name === 'DP');
  const normal = connections.find(connection => connection.provider === node.id && connection.name === 'aiapi-Default');
  assert(dp && normal, '真实账号存在');
  const initialDistribution = await read('/api/models/distribution');
  const shadow = new Map();
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (/^\/api\/providers\/[^/]+\/models$/.test(path)) report.http.push({ path, status: response.status() });
  });
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (['GET', 'HEAD'].includes(request.method())) {
      if (path === '/api/providers' && shadow.size) {
        const response = await route.fetch();
        const data = await response.json();
        data.connections = data.connections.map(connection => shadow.get(connection.id) || connection);
        return route.fulfill({ response, json: data });
      }
      return route.continue();
    }
    if (request.method() === 'PUT' && /^\/api\/providers\/[^/]+$/.test(path)) {
      const id = path.split('/').pop();
      const original = shadow.get(id) || connections.find(connection => connection.id === id);
      assert(original);
      const body = request.postDataJSON();
      assert.deepEqual(Object.keys(body), ['providerSpecificData']);
      assert.deepEqual(Object.keys(body.providerSpecificData), ['enabledModels']);
      report.writes.push({ account: original.name, path, enabledModels: body.providerSpecificData.enabledModels, intercepted: true });
      const connection = { ...original, providerSpecificData: { ...original.providerSpecificData, ...body.providerSpecificData } };
      shadow.set(id, connection);
      return route.fulfill({ json: { connection } });
    }
    report.errors.push(`意外写入已拦截：${request.method()} ${path}`);
    return route.abort();
  });
  const entry = await page.goto(base + '/dashboard/providers/' + node.id);
  assert.equal(entry.status(), 200);
  await page.getByLabel('仅显示正常连接', { exact: true }).uncheck();
  await page.getByRole('button', { name: '编辑 DP', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '从此账号获取模型范围', exact: true }).click();
  await dialog.getByText(/已获取 \d+ 个模型，保存连接后生效/).waitFor();
  assert.equal(await dialog.getByRole('textbox', { name: '允许的上游模型', exact: true }).inputValue(), 'deepseek-v4.1-flash');
  assert.equal(report.writes.length, 0, '获取只修改草稿');
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  for (const name of ['DP', 'aiapi-Default']) await page.getByLabel(`选择账号 ${name}`, { exact: true }).check();
  await page.getByRole('button', { name: '同步模型范围', exact: true }).click();
  await page.getByText('模型范围同步结果：成功 2，失败 0，跳过 0', { exact: true }).waitFor();
  assert.equal(report.writes.length, 2);
  const dpWrite = report.writes.find(write => write.account === 'DP');
  const normalWrite = report.writes.find(write => write.account === 'aiapi-Default');
  assert.deepEqual(dpWrite.enabledModels, ['deepseek-v4.1-flash']);
  assert.equal(normalWrite.enabledModels.length, 7);
  assert(normalWrite.enabledModels.every(model => model.startsWith('gpt-')));
  await page.getByRole('button', { name: '获取上游模型', exact: true }).click();
  await dialog.getByRole('combobox', { name: '查询账号', exact: true }).selectOption(dp.id);
  await dialog.getByRole('button', { name: '获取模型列表', exact: true }).click();
  const published = initialDistribution.mode !== 'allowlist' || initialDistribution.models.includes('aiapi/deepseek-v4.1-flash');
  await dialog.getByText(published ? '下游：已发布' : '下游：未发布', { exact: true }).waitFor();
  await dialog.getByRole('button', { name: '同步此账号模型范围', exact: true }).click();
  await dialog.getByText('已同步 DP 的 1 个模型；下游发布范围保持原设置。', { exact: true }).waitFor();
  const current = (await read('/api/providers')).connections;
  for (const original of [dp, normal]) assert.deepEqual(current.find(connection => connection.id === original.id).providerSpecificData?.enabledModels, original.providerSpecificData?.enabledModels, '生产账号配置保持原值');
  const finalDistribution = await read('/api/models/distribution');
  assert.deepEqual({ mode: finalDistribution.mode, models: finalDistribution.models }, { mode: initialDistribution.mode, models: initialDistribution.models }, '生产发布配置保持原值');
  assert.deepEqual(report.errors, []);
  assert(report.http.filter(item => item.path.endsWith('/models')).every(item => item.status === 200));
  await mkdir('reports/account-models', { recursive: true });
  await page.screenshot({ path: 'reports/account-models/real-data-import.png' });
  report.passed = true;
  await writeFile('reports/account-models/live-acceptance.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await browser.close(); }

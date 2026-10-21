import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { chromium } from 'playwright';

const base = 'http://192.168.11.150:4317';
const target = 'aiapi/deepseek-v4.1-flash';
const state = JSON.parse(await readFile('reports/account-models/deployment-state.json', 'utf8'));
assert(state.gatewayBackup, '生产写入前已保存备份');
assert(JSON.parse(await readFile(state.gatewayBackup, 'utf8')).settings);
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] });
const report = { base, http: [], writes: [], errors: [], productionWrites: true };
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const read = async path => {
    const response = await context.request.get(base + path);
    report.http.push({ path, status: response.status() });
    assert.equal(response.status(), 200, path);
    return response.json();
  };
  assert.equal((await read('/api/health')).driver, 'better-sqlite3');
  const auth = await read('/api/auth/status');
  assert(!auth.demo && auth.requireLogin);
  const env = parseEnv(await readFile('C:/Users/Administrator/.codex/credentials/10router-web.env', 'utf8'));
  const login = await context.request.post(base + '/api/auth/login', { data: { password: env.TENROUTER_TEST_PASSWORD.trim() } });
  assert.equal(login.status(), 200);
  const node = (await read('/api/provider-nodes')).nodes.find(node => node.prefix === 'aiapi');
  assert(node);
  const original = (await read('/api/providers')).connections;
  const accounts = original.filter(connection => connection.provider === node.id && ['DP', 'aiapi-Default'].includes(connection.name));
  assert.equal(accounts.length, 2);
  const expected = new Map();
  for (const account of accounts) {
    const result = await read(`/api/providers/${account.id}/models`);
    assert(!result.warning && result.models?.length);
    expected.set(account.id, result.models.map(model => typeof model === 'string' ? model : model.id));
  }
  const initialDistribution = await read('/api/models/distribution');
  assert.equal(initialDistribution.mode, 'allowlist');
  const expectedPublished = new Set([...initialDistribution.models, target]);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('response', response => {
    if (response.request().method() === 'PUT') report.http.push({ path: new URL(response.url()).pathname, status: response.status() });
  });
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (['GET', 'HEAD'].includes(request.method())) return route.continue();
    const body = request.postDataJSON();
    if (request.method() === 'PUT' && expected.has(path.split('/').pop()) && /^\/api\/providers\/[^/]+$/.test(path)) {
      assert.deepEqual(body, { providerSpecificData: { enabledModels: expected.get(path.split('/').pop()) } });
    } else if (request.method() === 'PUT' && path === '/api/models/distribution') {
      assert.equal(body.mode, 'allowlist');
      assert.deepEqual(new Set(body.models), expectedPublished, '保留原有全部发布模型');
    } else {
      report.errors.push(`意外写入已拦截：${request.method()} ${path}`);
      return route.abort();
    }
    report.writes.push({ path, body });
    return route.continue();
  });
  assert.equal((await page.goto(base + '/dashboard/providers/' + node.id)).status(), 200);
  await page.getByLabel('仅显示正常连接', { exact: true }).uncheck();
  for (const account of accounts) await page.getByLabel(`选择账号 ${account.name}`, { exact: true }).check();
  await page.getByRole('button', { name: '同步模型范围', exact: true }).click();
  await page.getByText('模型范围同步结果：成功 2，失败 0，跳过 0', { exact: true }).waitFor();
  const current = (await read('/api/providers')).connections;
  for (const account of accounts) {
    const saved = current.find(connection => connection.id === account.id);
    assert.deepEqual(saved.providerSpecificData.enabledModels, expected.get(account.id));
    const withoutScope = connection => { const data = { ...connection.providerSpecificData }; delete data.enabledModels; return data; };
    assert.deepEqual(withoutScope(saved), withoutScope(account), '保留该账号其他配置');
  }
  for (const account of original.filter(connection => !expected.has(connection.id))) {
    assert.deepEqual(current.find(connection => connection.id === account.id).providerSpecificData?.enabledModels, account.providerSpecificData?.enabledModels, '保留其他账号模型范围');
  }
  await page.screenshot({ path: 'reports/account-models/deployed-accounts.png' });
  await page.goto(base + '/dashboard/distribution');
  await page.getByRole('textbox', { name: '搜索分发模型', exact: true }).fill(target);
  const publish = page.getByLabel('发布 ' + target, { exact: true });
  await publish.check();
  if (!initialDistribution.models.includes(target)) {
    await page.getByRole('button', { name: '保存分发设置', exact: true }).click();
    await page.getByText(/分发设置已保存 ·/).waitFor();
  }
  const distribution = await read('/api/models/distribution');
  assert.equal(distribution.mode, 'allowlist');
  assert.deepEqual(new Set(distribution.models), expectedPublished);
  assert.deepEqual(report.errors, []);
  assert(report.http.filter(item => item.path.startsWith('/api/providers/') || item.path === '/api/models/distribution').every(item => item.status === 200));
  report.passed = true;
  report.publishedCount = distribution.models.length;
  await page.screenshot({ path: 'reports/account-models/deployed-distribution.png' });
  state.stage = 'frontend-and-config-deployed';
  state.accounts = accounts.map(account => ({ id: account.id, name: account.name, models: expected.get(account.id) }));
  state.provider = node.id;
  await writeFile('reports/account-models/deployment-state.json', JSON.stringify(state, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  report.failure = error.message;
  throw error;
} finally {
  await writeFile('reports/account-models/deployed-browser-acceptance.json', JSON.stringify(report, null, 2));
  await browser.close();
}

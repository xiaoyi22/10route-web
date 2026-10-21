import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';
import { modelCatalog } from '../src/api/data.js';
import { providerInfo } from '../src/api/providers.js';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4326';
const directory = resolve('reports/model-testing-live');
await mkdir(directory, { recursive: true });
const report = { base, http: {}, errors: [], writes: [], resourceErrors: [], httpFailures: [] };
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(35000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') (message.text().startsWith('Failed to load resource:') ? report.resourceErrors : report.errors).push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) report.httpFailures.push({ path: new URL(response.url()).pathname, status: response.status() }); });
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) report.writes.push(path);
  });
  const read = async path => {
    const response = await page.request.get(base + path);
    assert.equal(response.status(), 200, path);
    return response.json();
  };
  assert(!(await read('/api/auth/status')).demo);
  assert.equal((await read('/api/health')).driver, 'better-sqlite3');
  const env = parseEnv(await readFile(process.env.TENROUTER_TEST_LOGIN_ENV || resolve(process.env.USERPROFILE, '.codex/credentials/10router-web.env'), 'utf8'));
  const login = await page.request.post(base + '/api/auth/login', { data: { password: env.TENROUTER_TEST_PASSWORD } });
  assert.equal(login.status(), 200);
  report.http.login = login.status();
  const [built, custom, providers, nodes, disabled, logs] = await Promise.all([
    read('/api/models'), read('/api/models/custom'), read('/api/providers'), read('/api/provider-nodes'), read('/api/models/disabled'), read('/api/usage/request-details?pageSize=30'),
  ]);
  const catalog = modelCatalog(built.models, custom.models, providers.connections, nodes.nodes, disabled.disabled);
  const available = catalog.filter(model => model.enabled && model.connected && (model.type || 'llm') === 'llm');
  const recent = (logs.details || []).filter(log => log.status === 'success' || log.status === 200 || log.httpStatus === 200);
  const model = process.env.MODEL_TEST_LIVE_ID ? available.find(item => item.id === process.env.MODEL_TEST_LIVE_ID)
    : recent.map(log => available.find(item => item.id === log.model || (providerInfo(item.provider, nodes.nodes).id === providerInfo(log.provider, nodes.nodes).id && (item.upstreamId || item.id.split('/').slice(1).join('/')) === log.model))).find(Boolean);
  assert(model, '没有匹配到近期成功且启用的文本模型，可设置 MODEL_TEST_LIVE_ID 指定真实模型');
  report.model = model.id;
  const supplier = providerInfo(model.provider, nodes.nodes);
  const response = await page.goto(base + '/dashboard/providers/' + encodeURIComponent(supplier.id));
  assert.equal(response.status(), 200); report.http.page = response.status();
  await page.getByLabel('搜索模型', { exact: true }).fill(model.id);
  const button = page.getByRole('button', { name: `测试模型 ${model.id}`, exact: true });
  await button.waitFor();
  assert.equal(await button.isEnabled(), true);
  const result = page.waitForResponse(response => response.url().endsWith('/api/models/test') && response.request().method() === 'POST');
  await button.click();
  const testResponse = await result;
  report.http.test = testResponse.status();
  assert.deepEqual(testResponse.request().postDataJSON(), { model: model.id, kind: 'llm' });
  report.result = await testResponse.json();
  await page.getByRole('dialog').getByText(report.result.ok === true ? '调用成功' : '调用失败', { exact: true }).waitFor();
  await page.screenshot({ path: resolve(directory, 'desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: resolve(directory, 'mobile.png'), fullPage: true });
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.locator('.provider-model-card').filter({ hasText: model.id }).getByText(report.result.ok === true ? '调用成功' : '调用失败', { exact: true }).waitFor();
  await page.getByRole('button', { name: `编辑模型 ${model.id}`, exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '保存并测试', exact: true }).isEnabled(), true);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  assert.deepEqual(report.writes, ['/api/models/test']);
  assert.deepEqual(report.errors, []);
  assert(report.httpFailures.every(failure => failure.path === '/api/models/test'), '页面其他接口出现 HTTP 故障');
  report.passed = true;
  console.log(JSON.stringify({ passed: true, model: report.model, http: report.http, result: report.result, errors: report.errors, writes: report.writes }));
} catch (failure) {
  report.failure = failure.message;
  throw failure;
} finally {
  await writeFile(resolve(directory, 'acceptance.json'), JSON.stringify(report, null, 2));
  await browser.close();
}

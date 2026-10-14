import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';
import { providerInfo } from '../src/api/providers.js';
import { resultNames, summarizeMonitorChecks } from '../src/api/monitor.js';

const base = process.env.PREVIEW_URL || 'http://192.168.11.150:4317';
const directory = resolve('reports/monitor-manual/production');
await mkdir(directory, { recursive: true });
const report = { base, http: {}, errors: [], writes: [], checks: [] };
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(45000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
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
  assert.equal(login.status(), 200); report.http.login = login.status();
  const original = await read('/api/iq-monitor');
  assert.equal(original.capabilities.manualTests, true);
  const nodes = (await read('/api/provider-nodes')).nodes;
  const provider = original.catalog.find(item => providerInfo(item.id, nodes).prefix === 'nexa' && item.models.includes('gpt-6.1-sol'));
  assert(provider, 'Nexa model absent from live monitor catalog');
  const model = 'gpt-6.1-sol';
  const openStatus = async () => {
    await page.getByRole('heading', { name: '模型检测', exact: true }).waitFor();
    await page.getByLabel('自动刷新检测结果').uncheck();
    await page.getByRole('button', { name: '智商检测', exact: true }).click();
    await page.getByLabel('检测模型范围', { exact: true }).selectOption('all');
    await page.getByLabel('检测供应商', { exact: true }).selectOption(provider.id);
    await page.getByLabel('搜索检测模型', { exact: true }).fill(model);
  };
  const response = await page.goto(base + '/dashboard/monitor');
  assert.equal(response.status(), 200); report.http.page = response.status();
  await openStatus();
  await page.getByRole('button', { name: `单次智商检测 ${model}`, exact: true }).click();
  await page.getByLabel('单次智商检测思考强度', { exact: true }).selectOption('high');
  const pending = page.waitForResponse(response => response.url().endsWith('/api/models/test') && response.request().method() === 'POST', { timeout: 120000 });
  await page.getByRole('button', { name: '开始检测', exact: true }).click();
  const tested = await pending;
  report.http.test = tested.status();
  assert.equal(tested.status(), 200);
  const request = tested.request().postDataJSON();
  assert.deepEqual(request, { model: 'nexa/' + model, kind: 'llm', probe: 'iq', monitorTarget: { provider: provider.id, model }, thinkingLevel: 'high' });
  const result = await tested.json();
  assert.equal(result.ok, true);
  assert.equal(result.monitorRow.manual, true);
  assert.equal(result.monitorRow.persisted, true);
  assert.equal(result.monitorRow.thinkingLevel, 'high');
  report.result = { ok: result.ok, status: result.monitorRow.status, thinkingLevel: result.monitorRow.thinkingLevel, latencyMs: result.latencyMs, at: result.monitorRow.at };
  await page.getByRole('dialog').getByText('手动检测记录', { exact: true }).waitFor();
  await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
  const row = page.locator('.monitor-table tbody tr').filter({ has: page.locator('strong', { hasText: new RegExp('^gpt-6\\.1-sol$') }) });
  await row.getByText(resultNames[result.monitorRow.status], { exact: true }).waitFor();
  assert(await row.locator('.monitor-history-dots button').count() > 0);
  const saved = await read('/api/iq-monitor');
  assert(saved.state.history.some(item => item.manual && item.at === result.monitorRow.at && item.provider === provider.id && item.model === model));
  assert.deepEqual(saved.config, original.config);
  const summary = summarizeMonitorChecks(saved.state.history, [{ provider: provider.id, model, check: 'iq' }], 'iq');
  assert.equal(await page.locator('.monitor-metrics .metric-value').nth(1).innerText(), String(summary.passed));
  report.checks.push('Base model and independent high effort; persisted history, status and summary updated; automatic config preserved');
  await page.getByRole('tab', { name: '检测记录', exact: true }).click();
  await page.locator('.monitor-table tbody tr').filter({ hasText: '单次测试' }).first().waitFor();
  await page.reload();
  await openStatus();
  await row.getByText(resultNames[result.monitorRow.status], { exact: true }).waitFor();
  await row.getByText('单次测试', { exact: true }).waitFor();
  report.checks.push('Status and manual history retained after reload');
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: resolve(directory, `${width}.png`), fullPage: true, animations: 'disabled' });
  }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.writes, ['/api/models/test']);
  report.passed = true;
  console.log(JSON.stringify(report));
} catch (failure) {
  report.failure = failure.message;
  throw failure;
} finally {
  await writeFile(resolve(directory, 'acceptance.json'), JSON.stringify(report, null, 2));
  await browser.close();
}

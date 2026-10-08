import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4318';
const directory = resolve(process.env.SCREENSHOT_DIR || 'screenshots/monitor-summary');
const epoch = Date.now();
const target = { provider: 'codex', model: 'gpt', check: 'iq' };
const history = Array.from({ length: 35 }, (_, index) => ({ ...target, at: epoch - index * 1000, status: index >= 1 && index <= 5 ? 'error' : 'correct', score: index >= 1 && index <= 5 ? null : 100 }));
history.push(...['error', 'correct', 'ungraded'].map((status, index) => ({ provider: 'claude', model: 'gpt', check: 'iq', at: epoch + 3000 - index * 1000, status, score: status === 'correct' ? 100 : null })));
history.push(...['available', 'timeout'].map((status, index) => ({ provider: 'claude', model: 'gpt', check: 'availability', at: epoch + index, status })));
history.push({ ...target, check: 'availability', status: 'available', at: epoch });
const data = {
  config: { enabled: true, intervalMinutes: 5, revision: 'summary-demo', questions: [{ question: '1 + 1', answer: '2' }], providers: [{ id: 'codex', mode: 'selected', models: ['gpt'], modelChecks: { gpt: ['iq', 'availability'] }, excludedConnectionIds: [] }, { id: 'claude', mode: 'selected', models: ['gpt'], modelChecks: { gpt: ['iq'] }, excludedConnectionIds: [] }] },
  catalog: [{ id: 'codex', name: 'OpenAI Codex', models: ['gpt'], connections: [] }, { id: 'claude', name: 'Claude Code', models: ['gpt'], connections: [] }],
  state: { history, completedAt: epoch, nextAt: epoch + 300000, revision: 'summary-demo', backoff: {} }, running: false,
};
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] });
const context = await browser.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const report = { passed: false, checks: [], errors: [], writes: [] };
let reads = 0;
page.on('pageerror', error => report.errors.push(error.message));
page.on('request', request => {
  const path = new URL(request.url()).pathname;
  if (path.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) report.writes.push(path);
});
await context.route('**/api/iq-monitor', route => {
  assert.equal(route.request().method(), 'GET', 'Summary acceptance must not save configuration');
  reads++;
  return route.fulfill({ json: data });
});
await context.route('**/api/models/test', route => route.fulfill({ json: { ok: false, status: 429, error: 'HTTP 429', latencyMs: 72 } }));
const values = () => page.locator('.monitor-metrics .metric-value').allTextContents();
async function metrics(expected) {
  await page.waitForFunction(expected => JSON.stringify([...document.querySelectorAll('.monitor-metrics .metric-value')].map(element => element.textContent.trim())) === JSON.stringify(expected), expected);
}
async function refresh() {
  const before = reads;
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  for (let attempts = 0; reads === before && attempts < 100; attempts++) await page.waitForTimeout(20);
  assert(reads > before, 'Refresh must read the latest backend snapshot');
}
await mkdir(directory, { recursive: true });
try {
  assert.equal((await (await context.request.get(base + '/api/auth/status')).json()).demo, true, 'Use an isolated demo gateway only');
  assert.equal((await context.request.post(base + '/api/auth/login', { data: { password: 'linear-demo' } })).status(), 200);
  await page.clock.install({ time: epoch });
  await page.goto(base + '/dashboard/monitor');
  await page.getByRole('button', { name: '智商检测', exact: true }).click();
  await page.getByLabel('检测供应商', { exact: true }).selectOption('codex');
  await page.waitForFunction(() => document.querySelector('.monitor-metrics .metric-value')?.textContent.trim() === '1');
  assert.deepEqual(await values(), ['1', '25', '5', '83.3%'], 'One latest passing model must not hide twenty-five passed checks and five failures');
  report.checks.push('record-based IQ counts, not latest model count');
  assert.deepEqual(report.writes, [], 'Reading the summary must not trigger model tests');
  data.state.history.push({ ...target, at: epoch + 10000, status: 'error', score: null });
  const beforeAutomatic = reads;
  await page.clock.fastForward(15000);
  await metrics(['1', '24', '6', '80.0%']);
  assert(reads > beforeAutomatic);
  await page.locator('.monitor-table tbody').getByText('接口故障', { exact: true }).waitFor();
  data.state.history.push({ ...target, at: epoch + 12000, status: 'correct', score: 100 });
  await refresh();
  await metrics(['1', '24', '6', '80.0%']);
  await page.locator('.monitor-table tbody').getByText('全部答对', { exact: true }).waitFor();
  report.checks.push('automatic refresh, new failure and recovery retain historical failures');
  await page.getByRole('button', { name: '单次智商检测 gpt', exact: true }).click();
  await page.getByRole('button', { name: '开始检测', exact: true }).click();
  await page.getByRole('dialog').getByText('本页单次测试', { exact: true }).waitFor();
  await page.getByRole('button', { name: '关闭窗口' }).click();
  await metrics(['1', '24', '6', '80.0%']);
  await page.locator('.monitor-table tbody').getByText('限流', { exact: true }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: '智商检测', exact: true }).click();
  await page.getByLabel('检测供应商', { exact: true }).selectOption('codex');
  await metrics(['1', '24', '6', '80.0%']);
  report.checks.push('manual snapshot does not invent persisted checks; reload is stable');
  await page.getByLabel('检测供应商', { exact: true }).selectOption('claude');
  await metrics(['1', '1', '1', '50.0%']);
  await page.getByText('当前筛选范围最近3次后台检测，其中1次未评分', { exact: false }).waitFor();
  await page.getByLabel('搜索检测模型', { exact: true }).fill('missing');
  await metrics(['0', '0', '0', '—']);
  await page.getByLabel('搜索检测模型', { exact: true }).fill('');
  await page.getByRole('button', { name: '模型测活', exact: true }).click();
  await metrics(['0', '0', '0', '—']);
  await page.getByLabel('检测模型范围').selectOption('all');
  await metrics(['1', '1', '1', '50.0%']);
  report.checks.push('provider, same-name model, detection type, search and configured/all scope');
  await page.getByLabel('检测供应商', { exact: true }).selectOption('codex');
  await page.getByRole('button', { name: '智商检测', exact: true }).click();
  await page.getByLabel('检测模型范围').selectOption('configured');
  const models = Array.from({ length: 21 }, (_, index) => 'model-' + index);
  data.catalog[0].models = models;
  data.config.providers[0].models = models;
  data.config.providers[0].modelChecks = Object.fromEntries(models.map(model => [model, ['iq']]));
  data.state.history = models.map((model, index) => ({ ...target, model, status: 'correct', score: 100, at: epoch + 30000 + index }));
  data.state.history.push({ ...target, model: models[0], status: 'error', at: epoch + 40000 });
  await refresh();
  await metrics(['21', '21', '1', '95.5%']);
  await page.getByRole('button', { name: '下一页检测结果' }).click();
  await metrics(['21', '21', '1', '95.5%']);
  assert.equal(await page.locator('.monitor-table tbody tr').count(), 1);
  await page.getByLabel('搜索检测模型', { exact: true }).fill('model-20');
  await metrics(['1', '1', '0', '100.0%']);
  await page.getByLabel('搜索检测模型', { exact: true }).fill('');
  report.checks.push('summary covers matching models rather than only the current page');
  data.state.history = [];
  await refresh();
  await metrics(['21', '0', '0', '—']);
  data.state.history = [{ ...target, model: models[0], status: 'ungraded', at: epoch + 50000 }];
  await refresh();
  await metrics(['21', '0', '0', '—']);
  data.state.history = [{ ...target, model: models[0], status: 'error', at: epoch + 60000 }];
  await refresh();
  await metrics(['21', '0', '1', '0.0%']);
  report.checks.push('empty, ungraded-only and all-failed histories do not fabricate a success rate');
  for (const theme of ['dark', 'light']) {
    await page.getByLabel('主题模式').selectOption(theme);
    await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme);
    await page.screenshot({ path: resolve(directory, 'monitor-summary-' + theme + '.png'), fullPage: true, animations: 'disabled' });
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().right <= 1);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Summary cards must not overflow mobile');
  assert(await page.locator('.monitor-metrics .metric').evaluateAll(cards => cards.every(card => { const bounds = card.getBoundingClientRect(); return bounds.left >= 0 && bounds.right <= innerWidth; })), 'All summary cards must stay inside the mobile viewport');
  await page.screenshot({ path: resolve(directory, 'monitor-summary-mobile.png'), fullPage: true, animations: 'disabled' });
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.writes, ['/api/models/test'], 'Only the deliberately mocked manual test is allowed');
  report.passed = true;
  console.log('PASS: monitor recent counts, anomaly recovery, filters, pagination, reload and light/dark/mobile');
} catch (error) { report.failure = error.message; throw error; }
finally { await writeFile(resolve(directory, 'acceptance.json'), JSON.stringify(report, null, 2)); await browser.close(); }

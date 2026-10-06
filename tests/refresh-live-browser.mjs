import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { openLiveSession } from './live-support.mjs';

const session = await openLiveSession('refresh-stability');
const { page, report, check, directory } = session;
const usagePaths = ['/api/usage/stats', '/api/usage/chart'];
const modelPaths = ['/api/models', '/api/models/custom', '/api/providers', '/api/provider-nodes', '/api/models/caps', '/api/models/disabled'];
const balancePaths = ['/api/channel-balances', '/api/usage/quotas'];
const distributionPaths = ['/api/models/distribution', '/api/models', '/api/models/custom', '/api/providers', '/api/provider-nodes', '/api/models/disabled', '/api/combos'];
let failure;
let held;
let documents = 0;
page.on('request', request => {
  if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents++;
});
await page.route('**/api/**', async route => {
  const block = held;
  if (!block?.paths.has(new URL(route.request().url()).pathname) || route.request().method() !== 'GET') return route.continue();
  block.started();
  await block.gate;
  if (block.fail) return route.fulfill({ status: 503, json: { error: 'Controlled refresh failure' } });
  return route.continue();
});
function hold(paths, fail = false) {
  assert(!held);
  let release, started;
  const gate = new Promise(resolve => { release = resolve; });
  const first = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('刷新请求未开始')), 25000);
    started = () => { clearTimeout(timer); resolve(); };
  });
  held = { paths: new Set(paths), gate, release, started, fail };
  return { first, release: () => { held = null; started(); release(); } };
}
async function idle(label) {
  await page.waitForFunction(label => [...document.querySelectorAll('button')].some(button => button.getAttribute('aria-label') === label && !button.disabled), label);
  await painted();
}
async function painted() {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function mark() {
  await page.evaluate(() => {
    window.refreshIdentity = {
      chart: document.querySelector('.traffic-chart .recharts-surface'),
      usageRow: document.querySelector('.token-usage-section tbody tr'),
      modelRow: document.querySelector('tbody tr .model-name'),
      quota: document.querySelector('.quota-provider-group'),
      selected: document.querySelector('[data-selected-model-id]'),
    };
  });
}
async function snapshot() {
  return page.evaluate(() => ({
    metric: document.querySelector('[data-testid="request-value"]')?.textContent,
    chart: !!document.querySelector('.traffic-chart .recharts-surface'),
    usageRows: document.querySelectorAll('.token-usage-section tbody tr').length,
    usageLoading: !!document.querySelector('.token-usage-section .table-empty'),
    modelRows: document.querySelectorAll('tbody tr .model-name').length,
    quotas: document.querySelectorAll('.quota-provider-group').length,
    selected: document.querySelectorAll('[data-selected-model-id]').length,
    distributionCount: document.querySelector('.distribution-list-heading .heading-count')?.textContent,
    contentLoading: !!document.querySelector('.finance-section > p.muted'),
    height: document.documentElement.scrollHeight,
    scroll: window.scrollY,
    sameChart: !window.refreshIdentity?.chart || window.refreshIdentity.chart === document.querySelector('.traffic-chart .recharts-surface'),
    sameUsageRow: !window.refreshIdentity?.usageRow || window.refreshIdentity.usageRow === document.querySelector('.token-usage-section tbody tr'),
    sameModelRow: !window.refreshIdentity?.modelRow || window.refreshIdentity.modelRow === document.querySelector('tbody tr .model-name'),
    sameQuota: !window.refreshIdentity?.quota || window.refreshIdentity.quota === document.querySelector('.quota-provider-group'),
    sameSelected: !window.refreshIdentity?.selected || window.refreshIdentity.selected === document.querySelector('[data-selected-model-id]'),
  }));
}
async function screenshot(label) {
  const file = resolve(directory, label + '.png');
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
  report.screenshots.push({ file });
}
async function stableRefresh(kind, width, paths, label, automatic = false) {
  const button = page.getByRole('button', { name: label, exact: true });
  await idle(label);
  await page.evaluate(() => window.scrollTo(0, Math.min(650, document.documentElement.scrollHeight - innerHeight)));
  await painted();
  await mark();
  const before = await snapshot();
  const navigationBefore = documents;
  const block = hold(paths);
  if (automatic) await page.getByRole('checkbox', { name: '自动更新用量' }).evaluate(input => input.click());
  else await button.evaluate(button => button.click());
  await block.first;
  await painted();
  assert.equal(await button.getAttribute('aria-busy'), 'true');
  const during = await snapshot();
  for (const key of ['metric', 'chart', 'usageRows', 'usageLoading', 'modelRows', 'quotas', 'selected', 'distributionCount', 'height', 'scroll']) assert.equal(during[key], before[key], `${kind} ${width}: ${key}`);
  for (const key of ['sameChart', 'sameUsageRow', 'sameModelRow', 'sameQuota', 'sameSelected']) assert(during[key], `${kind}: ${key}`);
  assert.equal(during.contentLoading, false);
  assert.equal(documents, navigationBefore);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  if (!automatic) await screenshot(`${kind}-${width}-refreshing`);
  block.release();
  await idle(label);
  if (automatic) await page.getByRole('checkbox', { name: '自动更新用量' }).uncheck();
  assert.equal(documents, navigationBefore);
  check({ kind, width, automatic, height: during.height, scroll: during.scroll, retainedNodes: true, documentNavigations: 0 });
}
try {
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const initial = hold(usagePaths);
    await page.goto(session.base + '/dashboard/overview');
    await initial.first;
    await page.getByRole('button', { name: '刷新', exact: true }).waitFor();
    await painted();
    assert.equal(await page.getByTestId('request-value').innerText(), '—');
    assert.equal(await page.locator('.traffic-chart .recharts-surface').count(), 0);
    initial.release();
    await idle('刷新');
    await page.getByRole('checkbox', { name: '自动更新用量' }).uncheck();
    await page.locator('.traffic-chart .recharts-surface').waitFor();
    await stableRefresh('overview', width, usagePaths, '刷新');
    if (width === 1440) await stableRefresh('overview-auto', width, usagePaths, '刷新', true);
    await page.goto(session.base + '/dashboard/usage');
    await idle('刷新');
    await page.getByRole('checkbox', { name: '自动更新用量' }).uncheck();
    await stableRefresh('usage', width, usagePaths, '刷新');
    const initialModels = hold(modelPaths);
    await page.goto(session.base + '/dashboard/models');
    await initialModels.first;
    await page.getByRole('button', { name: '刷新模型', exact: true }).waitFor();
    await painted();
    assert.equal(await page.locator('tbody tr .model-name').count(), 0);
    assert.equal(await page.locator('tbody .table-empty').count(), 1);
    initialModels.release();
    await idle('刷新模型');
    assert(await page.locator('tbody tr .model-name').count() > 0);
    await stableRefresh('models', width, modelPaths, '刷新模型');
    await page.goto(session.base + '/dashboard/distribution');
    await idle('刷新');
    assert(await page.locator('.distribution-table [data-model-id]').count() > 0);
    const modes = page.getByRole('group', { name: '分发模式' });
    await modes.getByRole('button', { name: '全部发布', exact: true }).click();
    await modes.getByRole('button', { name: '指定模型', exact: true }).click();
    await page.locator('.distribution-checkbox input').first().uncheck();
    const draft = await page.locator('[data-selected-model-id]').evaluateAll(rows => rows.map(row => row.dataset.selectedModelId));
    assert(draft.length > 0);
    await stableRefresh('distribution', width, distributionPaths, '刷新');
    assert.deepEqual(await page.locator('[data-selected-model-id]').evaluateAll(rows => rows.map(row => row.dataset.selectedModelId)), draft);
    assert(await page.getByRole('button', { name: '保存分发设置', exact: true }).isEnabled());
    await page.goto(session.base + '/dashboard/balances');
    await idle('刷新余额与配额');
    await stableRefresh('balances', width, balancePaths, '刷新余额与配额');
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(session.base + '/dashboard/usage');
  await idle('刷新');
  await page.getByRole('checkbox', { name: '自动更新用量' }).uncheck();
  const failedBefore = await snapshot();
  const failed = hold(usagePaths, true);
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await failed.first;
  await painted();
  const pendingFailure = await snapshot();
  assert.equal(pendingFailure.metric, failedBefore.metric);
  assert.equal(pendingFailure.chart, true);
  failed.release();
  await page.getByRole('alert').filter({ hasText: '保留上次数据' }).waitFor();
  await idle('刷新');
  const failedAfter = await snapshot();
  assert.equal(failedAfter.metric, failedBefore.metric);
  assert.equal(failedAfter.chart, true);
  assert.equal(failedAfter.usageRows, failedBefore.usageRows);
  const expectedConsoleErrors = report.errors.filter(message => /Failed to load resource.*503/.test(message));
  assert.equal(expectedConsoleErrors.length, 2);
  report.errors = report.errors.filter(message => !expectedConsoleErrors.includes(message));
  check({ kind: 'failed-refresh', retainedData: true, expectedHttpFailures: 2 });
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await idle('刷新');
  assert.equal(await page.getByRole('alert').count(), 0);
  const period = hold(usagePaths);
  const periodButton = page.locator('.period-tabs button[aria-pressed="false"]').first();
  const periodLabel = await periodButton.innerText();
  await periodButton.click();
  await period.first;
  await painted();
  assert.equal(await page.getByTestId('request-value').innerText(), '—');
  assert.equal(await page.locator('.traffic-chart .recharts-surface').count(), 0);
  assert.equal(await page.locator('.token-usage-section .table-empty').count(), 1);
  assert.equal(await page.getByRole('button', { name: periodLabel, exact: true }).getAttribute('aria-pressed'), 'true');
  period.release();
  await idle('刷新');
  const selectedPeriod = { '今日': 'today', '24 小时': '24h', '7 天': '7d', '30 天': '30d', '60 天': '60d' }[periodLabel];
  const stats = await session.read(`/api/usage/stats?period=${selectedPeriod}`);
  assert.equal(await page.getByTestId('request-value').innerText(), new Intl.NumberFormat('zh-CN').format(stats.totalRequests));
  check({ kind: 'period-switch', oldPeriodHidden: true, realPeriodMatched: selectedPeriod });
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  assert.equal(report.writes.length, 0, '刷新验收只读取业务接口');
} catch (error) {
  failure = error;
} finally {
  held?.release();
  await session.finish(failure);
}
if (failure) throw failure;

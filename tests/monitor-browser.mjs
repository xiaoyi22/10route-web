import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4318';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultNavigationTimeout(120000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  assert.equal((await (await page.request.get(`${base}/api/auth/status`)).json()).demo, true);
  await page.goto(`${base}/dashboard/monitor`);
  await page.getByLabel('登录密码').fill('linear-demo');
  await page.getByRole('button', { name: '进入管理端' }).click();
  await page.getByRole('heading', { name: '模型检测', exact: true }).waitFor();
  await page.locator('.monitor-table tbody tr').filter({ hasText: 'OpenAI Codex' }).waitFor();
  await page.getByLabel('自动刷新检测结果').uncheck();
  const initial = await (await page.request.get(`${base}/api/iq-monitor`)).json();
  assert.equal(await page.locator('.monitor-table tbody tr').count(), 2);
  assert.equal(await page.locator('.monitor-history-dots > *').count(), 60);
  await page.getByLabel('检测供应商', { exact: true }).selectOption('codex');
  assert.equal(await page.locator('.monitor-table tbody tr').count(), 1);
  assert.equal(await page.locator('.monitor-metrics .metric-value').first().innerText(), '1');
  await page.getByLabel('搜索检测模型', { exact: true }).fill('missing-model');
  await page.getByText('暂无匹配的已配置模型').waitFor();
  assert.deepEqual(await page.locator('.monitor-metrics .metric-value').allTextContents(), ['0', '0', '0', '0']);
  await page.getByLabel('搜索检测模型', { exact: true }).fill('');
  await page.getByLabel('检测供应商', { exact: true }).selectOption('');
  await page.locator('.monitor-history-dots button').first().click();
  await page.getByRole('dialog').getByText('后台检测记录', { exact: true }).waitFor();
  await page.getByRole('button', { name: '关闭窗口' }).click();
  await page.getByRole('tab', { name: '检测记录', exact: true }).click();
  assert.equal(await page.locator('.monitor-table tbody tr').count(), initial.state.history.filter(row => row.check === 'availability').length);
  await page.getByRole('button', { name: '智商检测', exact: true }).click();
  await page.getByRole('button', { name: '查看检测详情 gpt', exact: true }).first().click();
  await page.getByRole('dialog').getByText('标准答案', { exact: true }).waitFor();
  await page.getByRole('dialog').getByText('模型答案', { exact: true }).waitFor();
  await page.getByRole('button', { name: '关闭窗口' }).click();

  // Single tests require a deliberate click and use the existing one-model route.
  await page.getByRole('tab', { name: '模型状态', exact: true }).click();
  await page.getByRole('button', { name: '单次智商检测 gpt', exact: true }).click();
  const start = page.getByRole('button', { name: '开始检测', exact: true });
  await start.waitFor();
  const testRequest = page.waitForRequest(request => request.url().endsWith('/api/models/test') && request.method() === 'POST');
  await start.click();
  assert.deepEqual((await testRequest).postDataJSON(), { model: 'codex/gpt', kind: 'llm', probe: 'iq' });
  await page.getByRole('dialog').getByText('本页单次测试', { exact: true }).waitFor();
  assert((await page.getByRole('dialog').innerText()).includes('100%'));
  await page.getByRole('button', { name: '关闭窗口' }).click();
  await page.route('**/api/models/test', route => route.fulfill({ json: { ok: false, status: 429, error: 'HTTP 429', latencyMs: 72 } }));
  await page.getByRole('button', { name: '单次智商检测 gpt', exact: true }).click();
  await start.click();
  await page.getByRole('dialog').getByText('未评分', { exact: true }).waitFor();
  assert((await page.getByRole('dialog').innerText()).includes('限流'));
  assert(!(await page.getByRole('dialog').innerText()).includes('0%'));
  await page.getByRole('button', { name: '关闭窗口' }).click();
  await page.unroute('**/api/models/test');

  await page.route('**/api/models/test', route => route.fulfill({ json: { ok: true, iq: {}, latencyMs: 72 } }));
  await page.getByRole('button', { name: '单次智商检测 gpt', exact: true }).click();
  await start.click();
  await page.getByRole('dialog').getByText('未评分', { exact: true }).first().waitFor();
  await page.getByRole('button', { name: '关闭窗口' }).click();
  await page.getByLabel('检测供应商', { exact: true }).selectOption('codex');
  assert.deepEqual(await page.locator('.monitor-metrics .metric-value').allTextContents(), ['1', '0', '0', '1']);
  await page.getByLabel('检测供应商', { exact: true }).selectOption('');
  await page.unroute('**/api/models/test');

  // Persist settings through the isolated server and reread them after reload.
  await page.getByRole('tab', { name: '自动检测配置', exact: true }).click();
  await page.getByLabel('检测间隔', { exact: true }).fill('45');
  await page.getByLabel('启用自动检测', { exact: true }).check();
  const codex = page.locator('.monitor-provider-config').filter({ has: page.locator('summary strong', { hasText: 'OpenAI Codex' }) });
  await codex.locator('summary').click();
  await page.getByLabel('OpenAI Codex gpt 模型测活', { exact: true }).uncheck();
  await page.getByLabel('排除账号 Codex · 开发连接', { exact: true }).check();
  await page.getByLabel('标准答案 1', { exact: true }).fill('-2.5');
  await page.getByRole('button', { name: '添加题目', exact: true }).click();
  await page.getByLabel('检测题目 2', { exact: true }).fill('计算 2 + 3。');
  await page.getByLabel('标准答案 2', { exact: true }).fill('5');
  const save = page.waitForResponse(response => response.url().endsWith('/api/iq-monitor') && response.request().method() === 'PUT');
  await page.getByRole('button', { name: '保存检测配置', exact: true }).click();
  const savedResponse = await save;
  assert.equal(savedResponse.status(), 200);
  const saved = (await savedResponse.json()).config;
  assert.equal(saved.enabled, true);
  assert.equal(saved.intervalMinutes, 45);
  assert.deepEqual(saved.providers.find(provider => provider.id === 'codex').modelChecks.gpt, ['iq']);
  assert.deepEqual(saved.providers.find(provider => provider.id === 'codex').excludedConnectionIds, ['demo-codex']);
  assert.equal(saved.questions[0].answer, '-2.5');
  assert.equal(saved.questions.length, 2);
  await page.reload();
  await page.getByRole('tab', { name: '自动检测配置', exact: true }).click();
  assert.equal(await page.getByLabel('检测间隔', { exact: true }).inputValue(), '45');
  assert.equal(await page.getByLabel('标准答案 2', { exact: true }).inputValue(), '5');
  await page.getByLabel('自动刷新检测结果').uncheck();
  await page.getByLabel('检测间隔', { exact: true }).fill('60');
  const refreshed = page.waitForResponse(response => response.url().endsWith('/api/iq-monitor'));
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await refreshed;
  assert.equal(await page.getByLabel('检测间隔', { exact: true }).inputValue(), '60', 'Refresh must preserve unsaved edits');
  await page.route('**/api/iq-monitor', route => route.request().method() === 'PUT' ? route.fulfill({ status: 400, json: { error: 'Unavailable model: test' } }) : route.continue());
  await page.getByRole('button', { name: '保存检测配置', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Unavailable model: test' }).waitFor();
  assert.equal(await page.getByLabel('检测间隔', { exact: true }).inputValue(), '60');
  await page.unroute('**/api/iq-monitor');

  await mkdir('screenshots', { recursive: true });
  for (const width of [1440, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(350);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Config overflow at ${width}`);
    if ([1440, 375].includes(width)) await page.screenshot({ path: `screenshots/monitor-config-${width}.png`, fullPage: true });
  }
  await page.getByRole('tab', { name: '模型状态', exact: true }).click();
  for (const width of [1440, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(350);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Status overflow at ${width}`);
    if ([1440, 375].includes(width)) await page.screenshot({ path: `screenshots/monitor-status-${width}.png`, fullPage: true });
  }
  await page.route('**/api/iq-monitor', route => route.fulfill({ status: 503, json: { error: 'Monitor temporarily unavailable' } }));
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '当前保留上次结果' }).waitFor();
  await page.reload();
  await page.getByText('检测数据读取失败', { exact: true }).waitFor();
  assert.equal(await page.locator('.monitor-table').count(), 0);
  await page.unroute('**/api/iq-monitor');
  const restored = await page.request.put(`${base}/api/iq-monitor`, { data: initial.config });
  assert.equal(restored.status(), 200);
  assert.deepEqual(errors, []);
  console.log('PASS: detection navigation, history/details, filters, explicit single tests, error grading, persisted model/account/question configuration, failed saves, stale/failed reads, and four responsive widths.');
} finally {
  await browser.close();
}

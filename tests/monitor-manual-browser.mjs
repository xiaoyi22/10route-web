import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4329';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = { errors: [], requests: [], checks: [] };
await mkdir('reports/monitor-manual', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => report.errors.push(error.message));
  assert((await (await page.request.get(base + '/api/auth/status')).json()).demo);
  assert.equal((await page.request.post(base + '/api/auth/login', { data: { password: 'linear-demo' } })).status(), 200);
  await page.goto(base + '/dashboard/monitor');
  await page.getByRole('button', { name: '智商检测', exact: true }).click();
  await page.getByLabel('检测供应商', { exact: true }).selectOption('codex');
  const original = (await (await page.request.get(base + '/api/iq-monitor')).json()).config;
  await page.getByRole('button', { name: '单次智商检测 gpt', exact: true }).click();
  await page.getByLabel('单次智商检测思考强度').selectOption('high');
  const pending = page.waitForResponse(response => response.url().endsWith('/api/models/test'));
  await page.getByRole('button', { name: '开始检测', exact: true }).click();
  const response = await pending;
  assert.equal(response.status(), 200);
  const body = response.request().postDataJSON(); report.requests.push(body);
  assert.deepEqual(body, { model: 'codex/gpt', kind: 'llm', probe: 'iq', monitorTarget: { provider: 'codex', model: 'gpt' }, thinkingLevel: 'high' });
  const result = await response.json();
  assert(result.monitorRow.persisted);
  await page.getByRole('dialog').getByText('手动检测记录', { exact: true }).waitFor();
  await page.getByRole('button', { name: '关闭窗口' }).click();
  const row = page.locator('.monitor-table tbody tr').filter({ hasText: 'OpenAI Codex' });
  await row.getByText('全部答对', { exact: true }).waitFor();
  const before = await page.locator('.monitor-metrics .metric-value').allTextContents();
  assert.equal((await row.locator('.monitor-history-dots button').count()) > 0, true);
  await page.getByRole('tab', { name: '检测记录', exact: true }).click();
  await page.locator('.monitor-table tbody tr').filter({ hasText: '单次测试' }).first().waitFor();
  await page.reload();
  await page.getByRole('button', { name: '智商检测', exact: true }).click();
  await page.getByLabel('检测供应商', { exact: true }).selectOption('codex');
  await row.getByText('全部答对', { exact: true }).waitFor();
  assert.deepEqual(await page.locator('.monitor-metrics .metric-value').allTextContents(), before);
  report.checks.push('思考强度独立传参；手动成功保存历史，更新状态、历史点与统计；刷新后保留；自动计划保持原值');
  assert.deepEqual((await (await page.request.get(base + '/api/iq-monitor')).json()).config, original);
  await page.route('**/api/models/test', route => route.fulfill({ status: 500, json: { error: 'Request timed out' } }));
  await page.getByRole('button', { name: '单次智商检测 gpt', exact: true }).click();
  await page.getByRole('button', { name: '开始检测', exact: true }).click();
  await page.getByRole('dialog').getByText('超时', { exact: true }).first().waitFor();
  await page.getByRole('button', { name: '关闭窗口' }).click();
  await row.getByText('超时', { exact: true }).waitFor();
  report.checks.push('HTTP失败同样更新本页最新状态');
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `reports/monitor-manual/${width}.png`, fullPage: true, animations: 'disabled' });
  }
  assert.deepEqual(report.errors, []);
  console.log('PASS ' + report.checks.join('；'));
} finally {
  await writeFile('reports/monitor-manual/browser.json', JSON.stringify(report, null, 2));
  await browser.close();
}

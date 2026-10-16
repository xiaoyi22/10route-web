import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

const base = process.env.PREVIEW_URL || 'http://192.168.11.150:4317';
const cases = process.argv.includes('--cases');
const output = 'reports/billing-mode-20261015';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] });
const report = { base, cases, errors: [] };
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
  const credentials = parseEnv(await readFile(process.env.TENROUTER_TEST_LOGIN_ENV || 'C:/Users/Administrator/.codex/credentials/10router-web.env', 'utf8'));
  const status = await context.request.get(base + '/api/auth/status');
  assert.equal(status.status(), 200);
  assert.notEqual((await status.json()).demo, true);
  const login = await context.request.post(base + '/api/auth/login', { data: { password: credentials.TENROUTER_TEST_PASSWORD } });
  assert.equal(login.status(), 200);
  await context.route('**/api/**', route => ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort());
  if (cases) {
    const samples = [
      { id: 'billed-real', billingMode: '按次计费', tokens: { prompt_tokens: 5 } },
      { id: 'billed-inferred', tokens: { prompt_tokens: 5 } },
      { id: 'billed-imported', imported: true, tokens: { prompt_tokens: 5 } },
      { id: 'billed-unknown', tokens: { prompt_tokens: 0, completion_tokens: 0 } },
      { id: 'billed-nested', metadata: { billing: { mode: '订阅制' } }, tokens: { prompt_tokens: 5 } },
    ];
    await context.route('**/api/usage/request-details?**', route => route.fulfill({ json: {
      details: samples.map(entry => ({ provider: 'openai', model: entry.id, status: 'success', timestamp: new Date().toISOString(), ...entry })),
      pagination: { page: 1, totalPages: 1, totalItems: samples.length },
    } }));
  }
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  assert.equal((await page.goto(base + '/dashboard/logs')).status(), 200);
  await page.locator('.log-model').first().waitFor({ timeout: 60000 });
  await page.getByLabel('自动刷新日志').uncheck();
  const headers = await page.locator('.logs-table th').allTextContents();
  const column = headers.indexOf('计费模式');
  assert(column >= 0);
  report.values = await page.locator(`.logs-table tbody tr td:nth-child(${column + 1})`).allTextContents();
  if (cases) assert.deepEqual(report.values, ['按次计费', '按量计费', '导入记录', '-', '订阅制']);
  else assert(report.values.includes('按量计费'));
  await page.getByRole('button', { name: cases ? '查看请求 billed-inferred' : /^查看请求 /, exact: cases }).first().click();
  assert((await page.getByRole('dialog').innerText()).includes('按量计费'));
  await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出当前页', exact: true }).click();
  const csvPath = output + (cases ? '/cases.csv' : '/live.csv');
  await (await download).saveAs(csvPath);
  assert((await readFile(csvPath, 'utf8')).includes('按量计费'));
  assert(!(await readFile(csvPath, 'utf8')).includes('（推断）'));
  assert.equal(report.errors.length, 0);
  await page.screenshot({ path: output + (cases ? '/cases.png' : '/live.png'), fullPage: true });
  report.passed = true;
} finally {
  await browser.close();
  await writeFile(output + (cases ? '/cases-results.json' : '/live-results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}

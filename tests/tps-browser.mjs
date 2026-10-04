import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4318';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultNavigationTimeout(120000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  assert.equal((await (await page.request.get(`${base}/api/auth/status`)).json()).demo, true);
  const entry = { provider: 'codex', connectionId: 'demo-codex', timestamp: new Date().toISOString(), status: 'success', responseMode: 'streaming', tokens: { prompt_tokens: 10000, completion_tokens: 100 }, latency: { ttft: 1000, total: 3000 } };
  const details = [
    { ...entry, id: 'stream', model: 'stream' },
    { ...entry, id: 'non-stream', model: 'non-stream', responseMode: 'non-streaming' },
    { ...entry, id: 'imported', model: 'imported', imported: true },
    { ...entry, id: 'no-time', model: 'no-time', latency: {} },
    { ...entry, id: 'burst', model: 'burst', latency: { total: 3000, ttft: 2800 } },
  ];
  await page.route('**/api/usage/request-details?**', route => route.fulfill({ json: { details, pagination: { totalItems: 5, totalPages: 1, page: 1, hasNext: false, hasPrev: false } } }));
  await page.goto(`${base}/dashboard/logs`);
  await page.getByLabel('登录密码').fill('linear-demo');
  await page.getByRole('button', { name: '进入管理端' }).click();
  await page.getByTestId('request-tps').first().waitFor();
  assert.deepEqual(await page.getByTestId('request-tps').allTextContents(), ['50.00', '33.33', '—', '—', '33.33']);
  await page.getByRole('button', { name: '查看请求 stream', exact: true }).click();
  await page.getByRole('dialog').getByText('50.00 Token/s', { exact: true }).waitFor();
  assert((await page.getByRole('dialog').innerText()).includes('总耗时 − 首 Token 延迟'));
  await page.getByRole('button', { name: '关闭窗口' }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出当前页', exact: true }).click();
  const download = await downloading;
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  const csv = Buffer.concat(chunks).toString('utf8');
  const lines = csv.split('\r\n');
  assert(lines[0].includes('输出 TPS（Token/s）'));
  assert(lines[0].includes('TPS 计算口径'));
  assert(lines[1].includes('"50.00"'));
  assert(lines[2].includes('"33.33"'));
  assert(!lines[3].includes('"33.33"') && !lines[3].includes('"50.00"'));
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(350);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await page.screenshot({ path: 'screenshots/log-tps-desktop.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: streaming/end-to-end/burst TPS, unknown imported or missing timing, detail formula, CSV parity and responsive layout.');
} finally { await browser.close(); }

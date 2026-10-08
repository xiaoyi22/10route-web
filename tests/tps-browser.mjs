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
  const entry = { provider: 'codex', connectionId: 'demo-codex', clientIp: '203.0.113.10', groupName: 'hidden-test-group', timestamp: new Date().toISOString(), status: 'success', responseMode: 'streaming', tokens: { prompt_tokens: 10000, completion_tokens: 100 }, latency: { ttft: 1000, total: 3000 } };
  const details = [
    { ...entry, id: 'stream', model: 'stream' },
    { ...entry, id: 'non-stream', model: 'non-stream', responseMode: 'non-streaming' },
    { ...entry, id: 'imported', model: 'imported', imported: true },
    { ...entry, id: 'no-time', model: 'no-time', latency: {} },
    { ...entry, id: 'burst', model: 'burst', latency: { total: 3000, ttft: 2800 } },
    { ...entry, id: 'missing', model: 'missing', tokens: {}, latency: {} },
    { ...entry, id: 'failed', model: 'failed', status: 'error', tokens: {} },
    { ...entry, id: 'pending', model: 'pending', status: 'streaming', tokens: {} },
  ];
  await page.route('**/api/usage/request-details?**', route => route.fulfill({ json: { details, pagination: { totalItems: 8, totalPages: 1, page: 1, hasNext: false, hasPrev: false } } }));
  await page.goto(`${base}/dashboard/logs`);
  await page.getByLabel('登录密码').fill('linear-demo');
  await page.getByRole('button', { name: '进入管理端' }).click();
  // The detail dialog carries the same TPS computation the removed log column used to show.
  await page.locator('tbody tr').first().waitFor();
  const headers = await page.locator('thead th').allTextContents();
  assert(headers.includes('供应商'));
  assert(headers.includes('状态'));
  assert(!headers.includes('IP') && !headers.includes('分组'));
  assert(!(await page.locator('tbody').innerText()).includes('后端未返回'));
  assert(!(await page.locator('tbody').innerText()).includes(entry.clientIp));
  assert(!(await page.locator('tbody').innerText()).includes(entry.groupName));
  const missingRow = page.locator('tbody tr').filter({ has: page.getByRole('button', { name: '查看请求 missing', exact: true }) });
  assert.equal(await missingRow.locator('td').nth(1).innerText(), '-');
  assert.equal(await missingRow.locator('td').nth(2).innerText(), '-');
  assert.equal(await missingRow.locator('td').nth(6).innerText(), '-');
  const successfulRow = page.locator('tbody tr').filter({ has: page.getByRole('button', { name: '查看请求 stream', exact: true }) });
  assert.equal(await successfulRow.locator('td').first().innerText(), 'stream');
  const successStatus = successfulRow.locator('td').nth(4).locator('.status');
  const failedStatus = page.locator('tbody tr').filter({ has: page.getByRole('button', { name: '查看请求 failed', exact: true }) }).locator('td').nth(4).locator('.status');
  const pendingStatus = page.locator('tbody tr').filter({ has: page.getByRole('button', { name: '查看请求 pending', exact: true }) }).locator('td').nth(4).locator('.status');
  assert.equal(await successStatus.innerText(), '成功');
  assert.equal(await failedStatus.innerText(), '失败');
  assert.equal(await pendingStatus.innerText(), '处理中');
  assert((await successStatus.getAttribute('class')).includes('healthy'));
  assert((await failedStatus.getAttribute('class')).includes('error'));
  assert((await pendingStatus.getAttribute('class')).includes('warning'));
  assert.equal(new Set(await Promise.all([successStatus, failedStatus, pendingStatus].map(status => status.evaluate(element => getComputedStyle(element).color)))).size, 3);
  await page.getByRole('button', { name: '查看请求 stream', exact: true }).click();
  await page.getByRole('dialog').getByText('50.00 Token/s', { exact: true }).waitFor();
  assert(!(await page.getByRole('dialog').innerText()).includes('后端未返回'));
  assert.equal(await page.getByRole('dialog').getByText('IP', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('dialog').getByText('分组', { exact: true }).count(), 0);
  await page.getByRole('button', { name: '关闭窗口' }).click();
  await page.getByRole('button', { name: '查看请求 non-stream', exact: true }).click();
  await page.getByRole('dialog').getByText('33.33 Token/s', { exact: true }).waitFor();
  await page.getByRole('button', { name: '关闭窗口' }).click();
  await page.getByRole('button', { name: '查看请求 no-time', exact: true }).click();
  assert((await page.getByRole('dialog').innerText()).includes('无法计算'));
  await page.getByRole('button', { name: '关闭窗口' }).click();
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
  assert(lines[0].includes('供应商'));
  assert(!lines[0].includes('"IP"') && !lines[0].includes('"分组"'));
  assert(!csv.includes('后端未返回') && !csv.includes(entry.clientIp) && !csv.includes(entry.groupName));
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

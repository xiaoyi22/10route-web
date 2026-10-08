import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4338';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const details = [
  { id: 'actual', model: 'actual', status: 'success', usageSource: 'upstream', tokens: { prompt_tokens: 11, completion_tokens: 2 } },
  { id: 'partial', model: 'partial', status: 'failed', usageSource: 'estimated', tokens: { prompt_tokens: 20, completion_tokens: 3, estimated: true }, error: { code: 'stream_disconnected', message: 'Upstream stream closed before completion' } },
  { id: 'limited', model: 'limited', status: 'error', usageSource: 'unavailable', tokens: { prompt_tokens: 0, completion_tokens: 0 }, error: { status: 429, code: 'channel_daily_success_limit_exceeded', message: 'channel_daily_success_limit_exceeded' } },
].map(entry => ({ ...entry, provider: 'codex', connectionId: 'demo-codex', timestamp: new Date().toISOString(), endpoint: '/v1/responses', upstreamEndpoint: '/v1/chat/completions', responseMode: 'streaming', request: { redacted: true }, response: { redacted: true } }));

try {
  await page.goto(base + '/dashboard/logs');
  await page.getByLabel('登录密码').fill('linear-demo');
  await page.getByRole('button', { name: '进入管理端' }).click();
  await page.getByRole('heading', { name: '请求日志', exact: true }).waitFor();
  await page.route('**/api/usage/request-details?**', route => route.fulfill({ json: { details, pagination: { page: 1, pageSize: 20, totalItems: 3, totalPages: 1 } } }));
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await page.getByLabel('自动刷新日志').uncheck();
  await page.getByRole('button', { name: '查看请求 actual', exact: true }).click();
  const dialog = page.getByRole('dialog');
  assert.equal(await dialog.locator('dt').filter({ hasText: /^Token 来源$/ }).count(), 1);
  assert((await dialog.innerText()).includes('上游实测'));
  await page.getByRole('button', { name: '关闭窗口' }).click();
  await page.getByRole('button', { name: '查看请求 partial', exact: true }).click();
  assert((await dialog.innerText()).includes('估算'));
  assert((await dialog.innerText()).includes('流式响应中断'));
  assert((await dialog.innerText()).includes('失败'));
  await page.getByRole('button', { name: '关闭窗口' }).click();
  await page.getByRole('button', { name: '查看请求 limited', exact: true }).click();
  assert((await dialog.innerText()).includes('渠道当日成功次数已达上限'));
  assert((await dialog.innerText()).includes('HTTP 429'));
  await dialog.getByRole('button', { name: '元数据', exact: true }).click();
  const metadata = JSON.parse(await dialog.locator('.request-metadata').innerText());
  assert.equal(metadata.error.code, 'channel_daily_success_limit_exceeded');
  assert.equal(metadata.usageSource, 'unavailable');
  await page.getByRole('button', { name: '关闭窗口' }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出当前页', exact: true }).click();
  const stream = await (await downloaded).createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const csv = Buffer.concat(chunks).toString('utf8');
  assert(csv.includes('Token 来源'));
  assert(csv.includes('失败原因'));
  assert(csv.includes('渠道当日成功次数已达上限'));
  assert(csv.includes('估算'));
  assert.deepEqual(errors, []);
  console.log('PASS: measured/estimated usage, genuine failures, safe metadata and CSV agree');
} finally {
  await browser.close();
}

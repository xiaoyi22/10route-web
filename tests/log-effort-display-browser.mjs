import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4320';
let page;
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  assert.equal((await (await page.request.get(`${base}/api/auth/status`)).json()).demo, true);
  const now = Date.now();
  const entry = (model, extras = {}) => ({ id: 'r-' + model.replace(/\W+/g, '-'), timestamp: new Date(now - 60000).toISOString(), provider: 'ag', connectionId: 'demo-ag', model, status: 'success', tokens: { prompt_tokens: 100, completion_tokens: 200, completion_tokens_details: { reasoning_tokens: 50 } }, latency: { ttft: 200, total: 900 }, responseMode: 'streaming', request: { redacted: true }, response: { redacted: true }, ...extras });
  const details = [
    entry('ag/gemini-3.8-flash-high'),
    entry('ag/gemini-3.8-flash-medium'),
    entry('ag/gemini-3.8-flash'),
    entry('ag/gemini-3.8-flash-low', { reasoningEffort: 'high' }),
  ];
  await page.route('**/api/usage/request-details?**', route => route.fulfill({ json: { details, pagination: { page: 1, pageSize: 20, totalItems: details.length, totalPages: 1, hasNext: false, hasPrev: false } } }));
  await page.goto(`${base}/dashboard/logs`);
  await page.getByLabel('登录密码').fill('linear-demo');
  await page.getByRole('button', { name: '进入管理端' }).click();
  await page.getByRole('heading', { name: '请求日志', exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 4);
  const row = index => page.locator('tbody tr').nth(index).locator('td').nth(1);
  assert.equal((await row(0).innerText()).trim(), '-', '模型名 -high 后缀不应被当作已记录的推理强度');
  assert.equal((await row(1).innerText()).trim(), '-', '模型名 -medium 后缀不应被当作已记录的推理强度');
  assert.equal((await row(2).innerText()).trim(), '-', '无记录时保持未记录');
  assert.equal((await row(3).innerText()).trim(), 'high', '后端显式记录的强度应直接展示');
  await page.getByRole('button', { name: '查看请求 ag/gemini-3.8-flash-high', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('推理强度', { exact: true }).waitFor();
  assert.equal((await dialog.locator('.request-details > div').filter({ hasText: '推理强度' }).locator('dd').innerText()).trim(), '-', '详情弹窗不推断模型名档位，无记录显示未记录');
  await page.getByRole('button', { name: '关闭窗口' }).click();
  assert.deepEqual(errors, []);
  console.log('PASS: only explicitly recorded reasoning effort is shown; missing fields stay unrecorded.');
} catch (error) {
  console.error('Effort display browser state:', await page?.locator('body').innerText().catch(() => ''));
  throw error;
} finally {
  await browser.close();
}

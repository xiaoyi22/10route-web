import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'C:/Users/20449/AppData/Local/Temp/hermes-e2e/.venv/Lib/site-packages/playwright/driver/package');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4318';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(60000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const connections = [
  { id: 'bad-request', name: '参数错误账号', authType: 'apikey', lastError: 'API error: 400 Unsupported model' },
  { id: 'bad-key', name: '密钥异常账号', authType: 'apikey', lastError: 'Failed to fetch models: 401' },
  { id: 'expired', name: '过期授权账号', authType: 'oauth', lastError: 'Token expired and refresh failed' },
  { id: 'disabled', name: '停用账号', authType: 'apikey', isActive: false, lastError: 'HTTP 403' },
  { id: 'healthy', name: '正常账号', testStatus: 'success' },
  { id: 'unknown', name: '未测试账号' },
].map(item => ({ provider: 'openai', isActive: true, testStatus: item.lastError ? 'error' : undefined, ...item }));
try {
  const auth = await context.request.get(base + '/api/auth/status');
  assert.equal(auth.status(), 200);
  assert.equal((await auth.json()).demo, true, 'Requires isolated demo server');
  assert.equal((await context.request.post(base + '/api/auth/login', { data: { password: 'linear-demo' } })).status(), 200);
  await page.route('**/api/providers', route => route.fulfill({ json: { connections } }));
  await page.route('**/api/provider-nodes', route => route.fulfill({ json: { nodes: [] } }));
  await page.route('**/api/providers/bad-key/test', route => route.fulfill({ json: { valid: false, error: 'HTTP 401: Invalid API key' } }));
  await page.route('**/api/providers/*/models', route => route.fulfill({ status: 401, json: { error: 'Failed to fetch models: 401' } }));
  await page.goto(base + '/dashboard/providers');
  const row = page.locator('tbody tr').filter({ hasText: 'OpenAI' }).first();
  await row.getByText('HTTP 400 · 请求参数错误', { exact: true }).waitFor();
  await row.getByText('HTTP 401 · 认证失败', { exact: true }).waitFor();
  await row.getByText('3 个异常', { exact: true }).waitFor();
  await row.getByRole('link', { name: '查看供应商 OpenAI' }).click();
  const keyRow = page.locator('tr').filter({ hasText: '密钥异常账号' });
  await keyRow.getByText('HTTP 401 · 认证失败', { exact: true }).waitFor();
  await keyRow.getByRole('button', { name: '查看错误详情' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByText('HTTP 401 · 认证失败', { exact: true }).waitFor();
  await dialog.getByText('原始错误', { exact: true }).click();
  assert.equal(await dialog.locator('pre').innerText(), 'Failed to fetch models: 401');
  await page.getByRole('button', { name: '关闭窗口' }).click();
  await keyRow.getByRole('button', { name: '测试 密钥异常账号', exact: true }).click();
  await page.locator('.provider-error').getByText('HTTP 401 · 认证失败', { exact: true }).waitFor();
  await page.getByRole('button', { name: '获取上游模型', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '获取模型列表', exact: true }).click();
  await dialog.getByText('HTTP 401 · 认证失败', { exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: '连接你的工作空间' }).count(), 0, 'Upstream 401 must keep dashboard session');
  await page.getByRole('button', { name: '关闭窗口' }).click();
  const disabledRow = page.locator('tr').filter({ hasText: '停用账号' });
  assert.match(await disabledRow.innerText(), /已停用/);
  assert.match(await disabledRow.innerText(), /历史异常：HTTP 403/);
  const shotDir = process.env.SCREENSHOT_DIR || 'screenshots/provider-errors';
  await mkdir(shotDir, { recursive: true });
  for (const width of [1440, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Page overflow: ${width}`);
      await page.screenshot({ path: `${shotDir}/accounts-${width}-${theme}.png`, fullPage: true });
      await keyRow.getByRole('button', { name: '查看错误详情' }).click();
      dialog = page.getByRole('dialog');
      await dialog.getByText('原始错误', { exact: true }).click();
      assert(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), `Dialog overflow: ${width}`);
      await page.screenshot({ path: `${shotDir}/detail-${width}-${theme}.png` });
      await page.getByRole('button', { name: '关闭窗口' }).click();
    }
  }
  assert.deepEqual(errors, []);
  console.log('PASS provider error overview, account details, test failure, upstream 401 session preservation, disabled history, desktop/mobile and both themes; no uncaught exceptions.');
} finally { await browser.close(); }

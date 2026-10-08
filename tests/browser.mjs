import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
const page = await context.newPage();
page.setDefaultNavigationTimeout(120000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const url = process.env.PREVIEW_URL || 'http://127.0.0.1:4317';
try {
  const auth = await context.request.get(`${url}/api/auth/status`);
  assert.equal(auth.status(), 200);
  assert.equal((await auth.json()).demo, true, 'Demo browser acceptance requires the isolated demo backend');
  await page.goto(`${url}/dashboard/providers`);
  await page.getByRole('heading', { name: '连接你的工作空间' }).waitFor();
  await page.getByLabel('登录密码').fill('wrong');
  await page.getByRole('button', { name: '进入管理端' }).click();
  await page.getByRole('alert').waitFor();
  await page.getByLabel('登录密码').fill('linear-demo');
  await page.getByRole('button', { name: '进入管理端' }).click();
  await page.getByRole('heading', { name: '供应商', exact: true }).waitFor();
  await page.locator('.provider-link strong').getByText('Antigravity', { exact: true }).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 6);
  await page.waitForFunction(() => [...document.querySelectorAll('.provider-mark img')].every(image => image.complete && image.naturalWidth > 0));
  assert.equal(await page.locator('.provider-mark img').count(), 5);
  await page.getByLabel('搜索供应商').fill('OpenRouter');
  await page.waitForTimeout(150);
  assert.equal(await page.locator('tbody tr').count(), 1);
  await page.getByLabel('搜索供应商').fill('');
  await page.getByLabel('仅显示正常连接').check();
  await page.waitForTimeout(150);
  assert.equal(await page.locator('tbody tr').count(), 3);
  await page.getByLabel('仅显示正常连接').uncheck();
  await page.getByRole('link', { name: '概览', exact: true }).click();
  await page.getByRole('heading', { name: '概览', exact: true }).waitFor();
  await page.getByTestId('request-value').filter({ hasText: /\d/ }).waitFor();
  await page.locator('.connection-item').first().waitFor();
  assert.equal(await page.locator('.connection-item').count(), 6);
  assert.equal(await page.locator('.overview-recent-list > div').count(), 3);
  await page.getByRole('link', { name: '用量统计', exact: true }).click();
  await page.getByTestId('request-value').filter({ hasText: /\d/ }).waitFor();
  assert.equal(await page.getByTestId('cache-rate').innerText(), '54.6%');
  assert.equal(await page.locator('.token-usage-section tbody tr').count(), 5);
  assert.equal(await page.locator('.requests-section tbody tr').count(), 3);
  await page.getByRole('link', { name: '概览', exact: true }).click();
  await page.getByTestId('request-value').filter({ hasText: /\d/ }).waitFor();
  const previous = await page.getByTestId('request-value').innerText();
  await page.getByRole('button', { name: '7 天', exact: true }).click();
  await page.waitForFunction(old => document.querySelector('[data-testid="request-value"]').textContent !== old, previous);
  await page.getByRole('link', { name: '用量统计', exact: true }).click();
  await page.getByText('实时流已连接', { exact: true }).waitFor();
  await page.getByRole('link', { name: '概览', exact: true }).click();
  await page.getByLabel('主题模式').selectOption('light');
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  await page.getByLabel('主题模式').selectOption('dark');
  await page.keyboard.press('Control+k');
  await page.getByLabel('搜索页面').fill('供应商');
  await page.getByRole('dialog').getByRole('link', { name: '供应商' }).click();
  assert(page.url().includes('/dashboard/providers'));
  await page.reload();
  await page.getByRole('heading', { name: '供应商', exact: true }).waitFor();
  for (const path of ['/dashboard/providers', '/dashboard']) {
    await page.goto(`${url}${path}`);
    await page.getByRole('heading', { name: path === '/dashboard' ? '概览' : '供应商', exact: true }).waitFor();
    if (path === '/dashboard') {
      assert(page.url().endsWith('/dashboard/overview'));
      await page.locator('.connection-item').first().waitFor();
    }
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForTimeout(120);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Page overflow at ${path}, ${width}`);
    }
  }
  await page.setViewportSize({ width: 375, height: 900 });
  await page.getByRole('button', { name: '打开导航' }).click();
  await page.getByRole('link', { name: '用量统计', exact: true }).click();
  await page.getByRole('heading', { name: '用量统计', exact: true }).waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  const screenshotDir = process.env.SCREENSHOT_DIR;
  if (screenshotDir) {
    await mkdir(screenshotDir, { recursive: true });
    await page.goto(`${url}/dashboard/overview`);
    await page.getByTestId('request-value').filter({ hasText: /\d/ }).waitFor();
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(screenshotDir, 'desktop.png'), fullPage: true });
    await page.getByLabel('主题模式').selectOption('light');
    await page.waitForTimeout(200);
    await page.screenshot({ path: resolve(screenshotDir, 'light.png'), fullPage: true });
    await page.getByLabel('主题模式').selectOption('dark');
    await page.waitForTimeout(200);
    await page.setViewportSize({ width: 375, height: 900 });
    await page.screenshot({ path: resolve(screenshotDir, 'mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  const providerResponse = await context.request.get(`${url}/api/providers`);
  const { connections } = await providerResponse.json();
  const manyConnections = Array.from({ length: 40 }, (_, index) => ({ ...connections[index % connections.length], id: `many-${index}`, name: `Connection ${index + 1}` }));
  await page.route('**/api/providers', route => route.fulfill({ json: { connections: manyConnections } }));
  await page.goto(`${url}/dashboard/overview`);
  await page.waitForFunction(() => document.querySelectorAll('.connection-item').length === 6);
  await page.goto(`${url}/dashboard/providers`);
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 6);
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Many connections overflow at ${width}`);
  }
  await page.goto(`${url}/dashboard/providers/antigravity`);
  await page.waitForFunction(() => document.querySelectorAll('.panel:first-of-type tbody tr').length === 8);
  assert((await page.locator('.provider-summary').innerText()).includes('40'));
  await page.getByRole('button', { name: '退出登录' }).click();
  await page.getByRole('heading', { name: '连接你的工作空间' }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: login/rejected login, cookie reload, providers/search/filter, periods, SSE, themes, default overview, connection summary, recent requests, navigation, 5 widths on 2 pages, logout, no JS errors.');
} finally { await browser.close(); }

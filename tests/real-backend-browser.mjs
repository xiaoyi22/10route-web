import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.PREVIEW_URL || 'http://127.0.0.1:4317';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: process.env.BROWSER_DIRECT === '1' ? ['--no-proxy-server'] : [] });
try {
  const context = await browser.newContext();
  const health = await context.request.get(`${url}/api/health`);
  assert.equal(health.status(), 200);
  assert.equal((await health.json()).ok, true);
  const status = await context.request.get(`${url}/api/auth/status`);
  assert.equal(status.status(), 200);
  const auth = await status.json();
  assert(!auth.demo, 'This check requires the real backend');
  assert.equal(auth.requireLogin, true);
  assert.equal(auth.authenticated, false);
  assert.equal((await context.request.get(`${url}/api/providers`)).status(), 401);
  assert.equal((await context.request.get(`${url}/api/pricing`)).status(), 401);
  assert.equal((await context.request.get(`${url}/api/iq-monitor`)).status(), 401);
  for (const path of ['/api/combos', '/api/models/caps', '/api/channel-balances', '/api/usage/quotas']) assert.equal((await context.request.get(`${url}${path}`)).status(), 401);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(`${url}/dashboard/overview`);
  assert.equal(response.status(), 200);
  await page.getByLabel('登录密码').waitFor();
  assert.equal(await page.locator('.demo-password').count(), 0);
  assert.equal(await page.locator('.mode-banner strong').innerText(), '网关登录');
  await mkdir('screenshots', { recursive: true });
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.screenshot({ path: resolve('screenshots', `real-login-${width}.png`), fullPage: true });
  }
  assert.deepEqual(errors, []);
  const monitor = await page.goto(`${url}/dashboard/monitor`);
  assert.equal(monitor.status(), 200);
  await page.getByLabel('登录密码').waitFor();
  for (const path of ['providers', 'models', 'combos', 'balances', 'logs', 'usage', 'endpoint']) {
    assert.equal((await page.goto(`${url}/dashboard/${path}`)).status(), 200);
    await page.getByLabel('登录密码').waitFor();
  }
  assert.deepEqual(errors, []);
  console.log('PASS: real backend health/auth proxy, unauthenticated providers rejected, real login UI, desktop/mobile, no JS errors. Business data requires user login.');
} finally {
  await browser.close();
}

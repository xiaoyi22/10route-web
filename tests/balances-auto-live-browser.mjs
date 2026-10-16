import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { selectTheme } from './theme-control.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4333';
const directory = 'reports/balances-auto-20261013/live';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], writes = [], queries = [], http = {};
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (['/api/channel-balances', '/api/usage/quotas'].includes(path)) queries.push(request.url());
    if (path.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) writes.push(path);
  });
  const status = await page.request.get(base + '/api/auth/status');
  assert.equal(http.auth = status.status(), 200);
  assert(!(await status.json()).demo);
  const health = await page.request.get(base + '/api/health');
  assert.equal(http.health = health.status(), 200);
  assert.equal((await health.json()).driver, 'better-sqlite3');
  const env = parseEnv(await readFile(process.env.TENROUTER_TEST_LOGIN_ENV || resolve(process.env.USERPROFILE, '.codex/credentials/10router-web.env'), 'utf8'));
  const login = await page.request.post(base + '/api/auth/login', { data: { password: env.TENROUTER_TEST_PASSWORD.trim() } });
  assert.equal(http.login = login.status(), 200);
  await page.clock.install();
  const initial = Promise.all(['/api/channel-balances', '/api/usage/quotas'].map(path => page.waitForResponse(response => new URL(response.url()).pathname === path)));
  assert.equal(http.page = (await page.goto(base + '/dashboard/balances')).status(), 200);
  const responses = await initial;
  for (const response of responses) assert.equal(http[new URL(response.url()).pathname] = response.status(), 200);
  const toggle = page.getByLabel('自动更新余额与配额', { exact: true });
  const ready = () => page.waitForFunction(() => document.querySelector('[aria-label="刷新余额与配额"]')?.disabled === false);
  await ready();
  assert(await toggle.isChecked());
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  let before = queries.length;
  const updated = page.waitForResponse(response => response.url().includes('/api/usage/quotas?refresh='));
  await page.clock.runFor(60000);
  assert.equal(http.autoQuota = (await updated).status(), 200);
  await ready();
  assert.equal(queries.length, before + 1);
  assert(queries.at(-1).includes('/api/usage/quotas?refresh='));
  assert(!queries.at(-1).includes('force=1'));
  await toggle.uncheck();
  before = queries.length;
  await page.clock.runFor(10 * 60000);
  assert.equal(queries.length, before);
  await toggle.check();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(10 * 60000);
  assert.equal(queries.length, before);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const screenshots = [];
  for (const theme of ['dark', 'light']) {
    await selectTheme(page, theme);
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    const file = `${directory}/${theme}.png`;
    await page.screenshot({ path: file, fullPage: true });
    screenshots.push(file);
  }
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '供应商', exact: true }).click();
  await toggle.waitFor({ state: 'detached' });
  before = queries.length;
  await page.clock.runFor(15 * 60000);
  assert.equal(queries.length, before);
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  await writeFile(`${directory}/acceptance.json`, JSON.stringify({ base, http, checks: ['真实数据、配额一分钟自动读取、余额标签不连带查询、关闭后停止、后台暂停、离开页面停止、两种主题四种屏宽'], queries, errors, writes, screenshots }, null, 2));
  console.log('PASS: real gateway; health/auth/login/page/balances/quotas/automatic quota HTTP 200; disabled/hidden/route leave stop requests; both themes and four widths; no console errors or business writes.');
} finally {
  await browser.close();
}

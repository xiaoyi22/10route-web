import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { selectTheme } from './theme-control.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL;
assert(base, 'PREVIEW_URL is required');
const liveHealth = process.argv.includes('--live-health');
const directory = resolve(process.env.SCREENSHOT_DIR || 'screenshots/interactions');
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH, channel: process.env.BROWSER_EXECUTABLE_PATH ? undefined : 'msedge', headless: process.env.HEADED !== '1', args: ['--no-proxy-server'] });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, colorScheme: 'dark' });
const errors = [];
const expectedErrors = [];
const writes = [];
const requests = [];
const checks = [];
let passed = false;
let releaseCheck;
try {
  const auth = await context.request.get(base + '/api/auth/status');
  assert.equal(auth.status(), 200);
  const demo = (await auth.json()).demo === true;
  const credentials = demo ? { TENROUTER_TEST_PASSWORD: 'linear-demo' } : parseEnv(await readFile(process.env.TENROUTER_TEST_LOGIN_ENV || resolve(process.env.USERPROFILE || process.env.HOME, '.codex/credentials/10router-web.env'), 'utf8'));
  assert.equal((await context.request.post(base + '/api/auth/login', { data: { password: credentials.TENROUTER_TEST_PASSWORD } })).status(), 200);
  await context.route('**/api/**', async route => {
    const request = route.request();
    if (['GET', 'HEAD'].includes(request.method())) return route.continue();
    if (liveHealth && new URL(request.url()).pathname === '/api/hermes/health/check') return route.continue();
    writes.push(new URL(request.url()).pathname);
    await route.abort();
  });
  let health = { mem0: null, icarus: null, checked_at: null };
  let probes = 0;
  let firstProbeStarted;
  const firstProbe = new Promise(resolveProbe => { firstProbeStarted = resolveProbe; });
  let failProbe = false;
  let gate = new Promise(resolveGate => { releaseCheck = resolveGate; });
  if (!liveHealth) await context.route(url => url.pathname.startsWith('/api/hermes/health'), async route => {
    if (route.request().method() === 'POST') {
      probes++;
      firstProbeStarted();
      await gate;
      if (failProbe) return route.fulfill({ status: 503, json: { error: '隔离检测失败' } });
      const checked_at = new Date().toISOString();
      health = { checked_at, mem0: { checked_at, memory_count: 123, components: [{ name: 'LLM', ok: true, latency_ms: 25, detail: '隔离检测结果' }] }, icarus: { checked_at, fabric_count: 6, components: [{ name: '配置', ok: true, latency_ms: 1 }] } };
    }
    await route.fulfill({ json: health });
  });
  const page = await context.newPage();
  let testingFailure = false;
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') (testingFailure && message.text().includes('503') ? expectedErrors : errors).push(message.text()); });
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/usage/request-details') requests.push(new URL(request.url()).searchParams.get('status')); });
  await page.goto(base + '/dashboard/logs');
  await page.locator('.log-token-trigger').first().waitFor();
  await page.getByLabel('自动刷新日志').uncheck();
  assert.equal(await page.getByLabel('状态', { exact: true }).inputValue(), 'success');
  assert.equal(await page.getByRole('button', { name: '成功', exact: true }).getAttribute('aria-pressed'), 'true');
  assert(requests.length > 0 && requests.every(status => status === 'success'));
  await page.locator('.log-filters input[placeholder="全部"]').fill('draft-model');
  await selectTheme(page, 'light');
  await selectTheme(page, 'dark');
  assert.equal(await page.locator('.log-filters input[placeholder="全部"]').inputValue(), 'draft-model');
  await selectTheme(page, 'system');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.getByRole('radio', { name: '跟随系统', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.getByRole('radio', { name: '深色', exact: true }).isChecked(), true);
  await page.getByRole('button', { name: '清除日志筛选', exact: true }).click();
  const failureResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/usage/request-details' && new URL(response.url()).searchParams.get('status') === 'error');
  await page.getByRole('button', { name: '失败', exact: true }).click();
  await failureResponse;
  assert.equal(await page.getByLabel('状态', { exact: true }).inputValue(), 'error');
  const refreshResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/usage/request-details' && new URL(response.url()).searchParams.get('status') === 'error');
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await refreshResponse;
  await page.getByRole('button', { name: '清除日志筛选', exact: true }).click();
  await page.locator('.log-token-trigger').first().waitFor();
  for (const theme of ['dark', 'light']) {
    await selectTheme(page, theme);
    for (const width of [1920, 1280, 375]) {
      await page.setViewportSize({ width, height: 1080 });
      const sizes = await page.evaluate(() => ({ title: getComputedStyle(document.querySelector('.logs-page h1')).fontSize, token: getComputedStyle(document.querySelector('.log-token-trigger')).fontSize, tokenWeight: getComputedStyle(document.querySelector('.log-token-lines b')).fontWeight, cells: [...document.querySelectorAll('.logs-table th, .logs-table td')].every(element => getComputedStyle(element).fontSize === '12px'), overflow: document.documentElement.scrollWidth > innerWidth + 1 }));
      assert.equal(sizes.title, '24px'); assert.equal(sizes.token, '12px'); assert.equal(sizes.tokenWeight, '500'); assert.equal(sizes.cells, true); assert.equal(sizes.overflow, false);
      checks.push({ theme, width, ...sizes });
      if (width === 1920 || width === 375) await page.screenshot({ path: resolve(directory, 'logs-' + width + '-' + theme + '.png'), animations: 'disabled' });
    }
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await selectTheme(page, 'dark');
  await page.reload();
  assert.equal(await page.getByRole('radio', { name: '深色', exact: true }).isChecked(), true);
  await page.getByRole('link', { name: '链路健康', exact: true }).click();
  if (!liveHealth) { await page.getByRole('status').filter({ hasText: '首次检测可能' }).waitFor(); await firstProbe; assert.equal(probes, 1); releaseCheck(); }
  await page.locator('.health-table tbody tr strong').first().waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: '刷新记录', exact: true }).click();
  await page.getByRole('button', { name: '刷新记录', exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('link', { name: '请求日志', exact: true }).click();
  await page.getByRole('link', { name: '链路健康', exact: true }).click();
  await page.locator('.health-table tbody tr strong').first().waitFor();
  if (!liveHealth) assert.equal(probes, 1);
  await page.screenshot({ path: resolve(directory, 'chain-health-dark.png'), animations: 'disabled' });
  if (!liveHealth) {
    health = { mem0: null, icarus: null, checked_at: null }; failProbe = true; testingFailure = true;
    await page.reload();
    await page.getByRole('alert').filter({ hasText: '隔离检测失败' }).waitFor();
    assert.equal(probes, 2); failProbe = false;
    await page.getByRole('button', { name: '重试', exact: true }).click();
    await page.locator('.health-table tbody tr strong').first().waitFor(); assert.equal(probes, 3); assert.equal(expectedErrors.length, 1); testingFailure = false;
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const motion = await page.evaluate(() => ({ page: getComputedStyle(document.querySelector('.main-content')).animationName, slider: getComputedStyle(document.querySelector('.theme-slider')).transitionDuration }));
  assert.equal(motion.page, 'none'); assert.equal(motion.slider, '0s');
  assert.deepEqual(errors, []); assert.deepEqual(writes, []);
  passed = true;
  console.log('PASS: 6 log typography/theme/viewport checks; success default and failure refresh; theme keyboard/system/persistence/draft; initial health, cached navigation and retry; reduced motion; no browser errors');
} finally {
  releaseCheck?.();
  await writeFile(resolve(directory, 'acceptance.json'), JSON.stringify({ base, liveHealth, passed, checks, errors, expectedErrors, writes }, null, 2));
  await browser.close();
}

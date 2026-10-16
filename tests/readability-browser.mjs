import { selectTheme } from './theme-control.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4317';
const directory = resolve(process.env.SCREENSHOT_DIR || 'screenshots/readability');
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE_PATH,
  channel: process.env.BROWSER_EXECUTABLE_PATH ? undefined : process.env.BROWSER_CHANNEL || 'msedge',
  headless: process.env.HEADED !== '1',
  args: ['--no-proxy-server'],
});
const screens = [
  { name: '1080p', width: 1920, height: 1080, scale: 1 },
  { name: '125-percent', width: 1536, height: 864, scale: 1.25 },
  { name: '150-percent', width: 1280, height: 720, scale: 1.5 },
  { name: 'mobile', width: 375, height: 812, scale: 1 },
];
const errors = [];
const writes = [];
const checks = [];
const apiStatuses = [];
let passed = false;
let failure = '';
await mkdir(directory, { recursive: true });

try {
  for (const screen of screens) {
    const context = await browser.newContext({ viewport: { width: screen.width, height: screen.height }, deviceScaleFactor: screen.scale });
    const status = await context.request.get(base + '/api/auth/status');
    assert.equal(status.status(), 200);
    const demo = (await status.json()).demo === true;
    const credentials = demo ? { TENROUTER_TEST_PASSWORD: 'linear-demo' } : parseEnv(await readFile(process.env.TENROUTER_TEST_LOGIN_ENV || resolve(process.env.USERPROFILE || process.env.HOME, '.codex/credentials/10router-web.env'), 'utf8'));
    assert(credentials.TENROUTER_TEST_PASSWORD, 'Login credentials missing');
    assert.equal((await context.request.post(base + '/api/auth/login', { data: { password: credentials.TENROUTER_TEST_PASSWORD } })).status(), 200);
    await context.route('**/api/**', async route => {
      const request = route.request();
      if (['GET', 'HEAD'].includes(request.method())) return route.continue();
      writes.push({ method: request.method(), pathname: new URL(request.url()).pathname });
      await route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', response => {
      const pathname = new URL(response.url()).pathname;
      if (['/api/providers', '/api/usage/request-details'].includes(pathname)) apiStatuses.push({ pathname, status: response.status() });
    });
    for (const route of screen.name === '1080p' ? ['overview', 'logs', 'providers', 'models', 'settings'] : ['logs', 'providers']) {
      await page.goto(base + '/dashboard/' + route);
      await page.locator('#main h1').waitFor();
      if (['logs', 'providers', 'models'].includes(route)) await page.locator('tbody tr').first().waitFor();
      for (const theme of ['dark', 'light']) {
        await selectTheme(page, theme);
        await page.evaluate(() => document.fonts.ready);
        const result = await page.evaluate(() => {
          const failures = [];
          const candidates = [...document.querySelectorAll('#main *, .sidebar *, .topbar *')].filter(element => {
            const bounds = element.getBoundingClientRect();
            return bounds.width > 1 && bounds.height > 1 && getComputedStyle(element).visibility === 'visible' && !element.closest('[aria-hidden="true"],.brand-mark,.avatar') && [...element.childNodes].some(node => node.nodeType === 3 && node.textContent.trim());
          });
          for (const element of candidates) {
            const size = parseFloat(getComputedStyle(element).fontSize);
            if (size < 12) failures.push({ text: element.textContent.trim().slice(0, 50), class: element.getAttribute('class'), size });
          }
          const bodySize = parseFloat(getComputedStyle(document.body).fontSize);
          const cells = [...document.querySelectorAll('td')].filter(element => element.getBoundingClientRect().width);
          const smallCells = cells.filter(element => parseFloat(getComputedStyle(element).fontSize) < (element.closest('.logs-page') ? 12 : 13)).map(element => ({ text: element.textContent.trim().slice(0, 50), size: parseFloat(getComputedStyle(element).fontSize) }));
          return { failures, bodySize, smallCells, inspected: candidates.length, pageOverflow: document.documentElement.scrollWidth > innerWidth + 1 };
        });
        const label = screen.name + '/' + route + '/' + theme;
        checks.push({ label, ...result });
        assert(result.bodySize >= 14, label + ': body must be at least 14px');
        assert.deepEqual(result.failures, [], label + ': meaningful text must be at least 12px');
        assert.deepEqual(result.smallCells, [], label + ': log table >=12px, other tables >=13px');
        assert.equal(result.pageOverflow, false, label + ': page overflow');
        if (theme === 'dark' && ['logs', 'providers'].includes(route)) await page.screenshot({ path: resolve(directory, screen.name + '-' + route + '.png'), animations: 'disabled' });
      }
    }
    await context.close();
  }
  assert.deepEqual(errors, [], 'Browser errors');
  assert.deepEqual(writes, [], 'Business writes');
  assert(apiStatuses.length > 0 && apiStatuses.every(response => response.status === 200), 'Read APIs must return 200');
  passed = true;
  console.log('PASS: ' + checks.length + ' page/theme/viewport checks; body >=14px, text >=12px, log table >=12px, other tables >=13px; API HTTP 200; no browser errors or business writes');
} catch (error) {
  failure = error.message;
  throw error;
} finally {
  await writeFile(resolve(directory, 'acceptance.json'), JSON.stringify({ base, passed, failure, checks, errors, writes, apiStatuses }, null, 2));
  await browser.close();
}

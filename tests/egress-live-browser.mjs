import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { proxyEntries } from '../src/api/hermes.js';
import { egressBinding } from '../src/api/egress-cache.js';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4317';
const directory = resolve(process.env.SCREENSHOT_DIR || 'screenshots/egress-live');
const credentials = parseEnv(await readFile(process.env.TENROUTER_TEST_LOGIN_ENV || resolve(process.env.USERPROFILE || process.env.HOME, '.codex/credentials/10router-web.env'), 'utf8'));
assert(credentials.TENROUTER_TEST_PASSWORD, 'Authorized gateway credentials missing');
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
page.setDefaultTimeout(75000);
const report = { base, passed: false, ports: [], writes: [], errors: [] };
page.on('pageerror', error => report.errors.push(error.message));
page.on('request', request => {
  const path = new URL(request.url()).pathname;
  if (path.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) report.writes.push(path);
});
await mkdir(directory, { recursive: true });
try {
  const auth = await context.request.get(base + '/api/auth/status');
  assert.equal(auth.status(), 200);
  assert.notEqual((await auth.json()).demo, true, 'Live acceptance requires the real gateway');
  assert.equal((await context.request.post(base + '/api/auth/login', { data: { password: credentials.TENROUTER_TEST_PASSWORD } })).status(), 200);
  const groupsResponse = await context.request.get(base + '/api/hermes/proxy/groups');
  assert.equal(groupsResponse.status(), 200);
  const entries = proxyEntries(await groupsResponse.json()).filter(entry => entry.probeSupported);
  assert(entries.length > 0, 'Real proxy entries are missing');
  await page.goto(base + '/dashboard/proxy');
  for (const entry of entries) {
    await page.waitForFunction(port => {
      const row = [...document.querySelectorAll('.proxy-table tbody tr')].find(row => row.querySelector('td')?.textContent.includes(':' + port));
      const value = row?.querySelector('td:nth-child(3) strong')?.textContent.trim();
      return value && value !== '—' && !row.querySelector('[role="alert"]') && !row.textContent.includes('检测中');
    }, entry.port, { timeout: 75000 });
    const binding = egressBinding(entry);
    const cached = await context.request.get(base + '/api/hermes/egress-ip?port=' + entry.port + '&binding=' + encodeURIComponent(binding));
    assert.equal(cached.status(), 200);
    const result = await cached.json();
    assert.equal(result.cache_binding, binding);
    assert(result.ip && Number.isFinite(Date.parse(result.checked_at)));
    await page.getByRole('row').filter({ has: page.getByText(':' + entry.port, { exact: true }) }).getByText(result.ip, { exact: true }).waitFor();
    report.ports.push(entry.port);
  }
  const beforeNavigation = report.writes.length;
  await page.getByRole('link', { name: '概览', exact: true }).click();
  await page.getByRole('link', { name: '代理控制', exact: true }).click();
  await page.getByText('自动检测 · 5分钟缓存', { exact: true }).first().waitFor();
  await page.reload();
  await page.getByText('自动检测 · 5分钟缓存', { exact: true }).first().waitFor();
  assert.equal(report.writes.length, beforeNavigation, 'Navigation and reload must reuse real cached results');
  for (const theme of ['dark', 'light']) {
    await page.getByLabel('主题模式').selectOption(theme);
    await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme);
    await page.screenshot({ path: resolve(directory, 'real-egress-' + theme + '.png'), fullPage: true });
  }
  await page.setViewportSize({ width: 375, height: 812 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Live mobile page must not overflow');
  assert.deepEqual(report.errors, []);
  assert(report.writes.every(path => path === '/api/hermes/egress-ip'), 'Live acceptance must not change nodes, subscriptions or trigger health/model checks');
  report.passed = true;
  console.log('PASS live: real egress on ' + report.ports.length + ' ports, navigation/reload persistence, no node or business changes');
} catch (error) { report.failure = error.message; throw error; }
finally {
  await writeFile(resolve(directory, 'acceptance.json'), JSON.stringify(report, null, 2));
  await browser.close();
}

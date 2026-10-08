import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { monitorTargets } from '../src/api/monitor.js';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4317';
const directory = resolve(process.env.SCREENSHOT_DIR || 'screenshots/monitor-summary-live');
const credentials = parseEnv(await readFile(process.env.TENROUTER_TEST_LOGIN_ENV || resolve(process.env.USERPROFILE || process.env.HOME, '.codex/credentials/10router-web.env'), 'utf8'));
assert(credentials.TENROUTER_TEST_PASSWORD, 'Authorized credentials missing');
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
page.setDefaultTimeout(20000);
const report = { base, passed: false, snapshots: [], errors: [], writes: [] };
let snapshotJob;
page.on('pageerror', error => report.errors.push(error.message));
page.on('request', request => {
  const path = new URL(request.url()).pathname;
  if (path.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) report.writes.push(path);
});
page.on('response', response => {
  if (new URL(response.url()).pathname === '/api/iq-monitor' && response.request().method() === 'GET' && response.ok()) snapshotJob = response.json();
});
async function verify(label) {
  await page.getByRole('button', { name: '智商检测', exact: true }).click();
  const snapshot = await snapshotJob;
  assert(snapshot?.state?.history && snapshot.catalog, 'Monitor must return real history');
  const targets = monitorTargets(snapshot.config, snapshot.catalog).filter(target => target.check === 'iq');
  assert(targets.length > 0, 'The real IQ monitor should have configured targets');
  const records = snapshot.state.history.filter(row => (row.check || 'iq') === 'iq' && Number.isFinite(row.at) && targets.some(target => target.provider === row.provider && target.model === row.model)).sort((first, second) => second.at - first.at).slice(0, 30);
  const passed = records.filter(row => row.status === 'correct' || row.status === 'available').length;
  const failed = records.filter(row => ['incorrect', 'rate_limited', 'timeout', 'error'].includes(row.status)).length;
  const expected = [String(targets.length), String(passed), String(failed), passed + failed ? (passed / (passed + failed) * 100).toFixed(1) + '%' : '—'];
  await page.waitForFunction(expected => JSON.stringify([...document.querySelectorAll('.monitor-metrics .metric-value')].map(element => element.textContent.trim())) === JSON.stringify(expected), expected);
  report.snapshots.push({ label, records: records.length, cards: expected, ungraded: records.length - passed - failed });
}
await mkdir(directory, { recursive: true });
try {
  const auth = await context.request.get(base + '/api/auth/status');
  assert.equal(auth.status(), 200);
  assert.notEqual((await auth.json()).demo, true, 'Use the real gateway, not demo records');
  assert.equal((await context.request.post(base + '/api/auth/login', { data: { password: credentials.TENROUTER_TEST_PASSWORD } })).status(), 200);
  await page.goto(base + '/dashboard/monitor');
  await verify('initial real history');
  const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/iq-monitor' && response.request().method() === 'GET');
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  assert.equal((await refreshed).status(), 200);
  await verify('manual refresh of read-only history');
  await page.getByRole('link', { name: '概览', exact: true }).click();
  await page.getByRole('link', { name: '模型检测', exact: true }).click();
  await verify('navigation');
  await page.reload();
  await verify('reload');
  for (const theme of ['dark', 'light']) {
    await page.getByLabel('主题模式').selectOption(theme);
    await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme);
    await page.screenshot({ path: resolve(directory, 'monitor-real-summary-' + theme + '.png'), fullPage: true, animations: 'disabled' });
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().right <= 1);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Real summary must not overflow mobile');
  assert(await page.locator('.monitor-metrics .metric').evaluateAll(cards => cards.every(card => { const bounds = card.getBoundingClientRect(); return bounds.left >= 0 && bounds.right <= innerWidth; })), 'Real summary cards must fit the mobile viewport');
  await page.screenshot({ path: resolve(directory, 'monitor-real-summary-mobile.png'), fullPage: true, animations: 'disabled' });
  assert.deepEqual(report.writes, [], 'Live acceptance must not trigger paid tests or change configuration');
  assert.deepEqual(report.errors, []);
  report.passed = true;
  console.log('PASS live: real IQ counts match latest backend snapshots across refresh, navigation and reload, with no model tests or writes');
} catch (error) { report.failure = error.message; throw error; }
finally { await writeFile(resolve(directory, 'acceptance.json'), JSON.stringify(report, null, 2)); await browser.close(); }

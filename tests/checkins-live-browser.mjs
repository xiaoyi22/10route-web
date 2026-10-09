import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { getCheckinConfigurationIssue } from '../src/api/checkin-sites.js';

const base = process.env.PREVIEW_URL || 'http://192.168.11.150:4317';
const origin = new URL(base).origin;
const loginFile = process.env.TENROUTER_TEST_LOGIN_ENV || resolve(process.env.USERPROFILE || process.env.HOME, '.codex/credentials/10router-web.env');
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true, args: ['--no-proxy-server'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
const writes = [];
page.setDefaultTimeout(30000);
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await context.route('**/*', async route => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.origin !== origin || url.pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) {
    writes.push({ method: request.method(), path: url.pathname });
    await route.abort();
  } else await route.continue();
});

try {
  const health = await context.request.get(base + '/api/health');
  assert.equal(health.status(), 200);
  assert.equal((await health.json()).driver, 'better-sqlite3');
  const auth = await context.request.get(base + '/api/auth/status');
  assert.equal(auth.status(), 200);
  assert.notEqual((await auth.json()).demo, true);
  const env = parseEnv(await readFile(loginFile, 'utf8'));
  assert(env.TENROUTER_TEST_PASSWORD, 'Private gateway login credential is missing');
  const login = await context.request.post(base + '/api/auth/login', { data: { password: env.TENROUTER_TEST_PASSWORD.trim() } });
  assert.equal(login.status(), 200, 'Gateway login failed; no retry attempted');
  const authenticated = await context.request.get(base + '/api/auth/status');
  assert.equal((await authenticated.json()).authenticated, true);
  const readSnapshot = async () => {
    const response = await context.request.get(base + '/api/checkins');
    assert.equal(response.status(), 200);
    const data = await response.json();
    assert.equal(data.configured, true);
    for (const account of data.accounts) {
      assert.equal(Object.hasOwn(account, 'cookie'), false);
      assert.equal(Object.hasOwn(account, 'token'), false);
    }
    return data;
  };
  const before = await readSnapshot();
  assert.equal((await page.goto(base + '/dashboard/checkins', { waitUntil: 'networkidle' })).status(), 200);
  await page.getByRole('heading', { name: '每日签到', exact: true }).waitFor();
  for (const account of before.accounts) await page.getByText(account.name, { exact: true }).first().waitFor();
  assert.equal(await page.getByRole('button', { name: '批量签到', exact: true }).isEnabled(), before.accounts.some(account => account.enabled && !getCheckinConfigurationIssue(account)));
  for (const account of before.accounts.filter(getCheckinConfigurationIssue)) await page.getByText(getCheckinConfigurationIssue(account), { exact: true }).first().waitFor();
  await page.setViewportSize({ width: 375, height: 900 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(await readSnapshot(), before, 'Readonly validation must not alter accounts, jobs or history');
  assert.deepEqual(writes, [], 'Browser attempted a write or external-site request');
  assert.equal(errors.length, 0, 'Browser console or page errors detected');
  console.log(JSON.stringify({ result: 'PASS', mode: 'real-gateway-readonly', pageHttp: 200, snapshotHttp: 200, loginHttp: 200, configured: true, accounts: before.accounts.length, history: before.history.length, latestJobStatus: before.job?.status || null, consoleErrors: errors.length, browserWrites: writes.length, realCheckinRequests: 0 }));
} finally { await browser.close(); }

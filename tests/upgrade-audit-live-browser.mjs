import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';
import { probes } from './matrix/probes.mjs';

const base = process.env.PREVIEW_URL || 'http://192.168.11.150:4317';
const output = resolve(process.env.TENROUTER_AUDIT_OUT || 'reports/upgrade-audit-20261015-codex/live-recheck');
const inventory = JSON.parse(await readFile(new URL('../reports/upgrade-audit-20261015-codex/live-audit.json', import.meta.url), 'utf8'));
const report = { base, startedAt: new Date().toISOString(), api: [], pages: [], blockedWrites: [], errors: [] };
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const status = await context.request.get(base + '/api/auth/status');
  assert.equal(status.status(), 200);
  assert.notEqual((await status.json()).demo, true, 'Requires a real backend implementation');
  const credentials = process.env.TENROUTER_AUDIT_PASSWORD ? {} : parseEnv(await readFile(process.env.TENROUTER_TEST_LOGIN_ENV || resolve(process.env.USERPROFILE, '.codex/credentials/10router-web.env'), 'utf8'));
  const password = process.env.TENROUTER_AUDIT_PASSWORD || credentials.TENROUTER_TEST_PASSWORD;
  assert(password, 'Login credential missing');
  const login = await context.request.post(base + '/api/auth/login', { data: { password } });
  assert.equal(login.status(), 200, 'Login failed; no retry');
  await context.route('**/api/**', async route => {
    const request = route.request();
    if (!['GET', 'HEAD'].includes(request.method())) {
      report.blockedWrites.push({ method: request.method(), path: new URL(request.url()).pathname });
      return route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"Read-only audit blocked this request"}' });
    }
    return route.continue();
  });
  for (const item of inventory.api) {
    const response = await context.request.get(base + item.path);
    const type = response.headers()['content-type'] || '';
    let json = false;
    try { await response.json(); json = true; } catch {}
    report.api.push({ path: item.path, status: response.status(), type, json, passed: response.ok() && json && type.includes('application/json') });
  }
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  const routes = inventory.pages.map(item => {
    const route = item.route || item.path;
    return route.startsWith('/') ? route : '/dashboard/' + route;
  });
  for (const route of routes) {
    const item = { route, passed: false };
    try {
      await probes['initial-load']({ page, base }, item);
      await page.waitForTimeout(400);
      item.passed = true;
      if (['/dashboard/distribution', '/dashboard/balances', '/dashboard/translator'].includes(route)) {
        for (const width of [1440, 375]) {
          await page.setViewportSize({ width, height: 1000 });
          await page.screenshot({ path: resolve(output, route.split('/').at(-1) + '-' + width + '.png'), fullPage: true });
        }
        await page.setViewportSize({ width: 1440, height: 1000 });
      }
    } catch (error) { item.error = error.message; }
    report.pages.push(item);
  }
} finally {
  await browser.close();
  report.finishedAt = new Date().toISOString();
  report.passed = report.api.every(item => item.passed) && report.pages.every(item => item.passed) && report.errors.length === 0;
  await writeFile(resolve(output, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ apiPassed: report.api.filter(item => item.passed).length, apiTotal: report.api.length, pagesPassed: report.pages.filter(item => item.passed).length, pagesTotal: report.pages.length, uncaughtErrors: report.errors.length, blockedWrites: report.blockedWrites.length, passed: report.passed }));
  if (!report.passed) process.exitCode = 1;
}

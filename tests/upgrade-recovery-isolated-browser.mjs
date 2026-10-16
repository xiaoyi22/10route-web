import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// This suite saves settings. Use only the independently configured audit backend.
const base = process.env.PREVIEW_URL;
assert.equal(base, 'http://127.0.0.1:4328', 'Requires the isolated audit frontend');
assert(process.env.TENROUTER_AUDIT_PASSWORD, 'Requires the isolated audit password');
const output = resolve('reports/upgrade-audit-20261015-codex/isolated-interactions');
await mkdir(output, { recursive: true });
const report = { base, checks: [], errors: [], writes: [] };
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] });
let context, initial, channel;
const check = (name, value) => { assert(value, name); report.checks.push(name); };
async function read(path) {
  const response = await context.request.get(base + path);
  assert.equal(response.status(), 200, path);
  return response.json();
}
try {
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const login = await context.request.post(base + '/api/auth/login', { data: { password: process.env.TENROUTER_AUDIT_PASSWORD } });
  assert.equal(login.status(), 200);
  initial = await read('/api/models/distribution');
  channel = (await read('/api/channel-balances?preferences=1')).channelOptions.find(row => row.prefix === 'audit');
  assert(channel, 'Requires the loopback audit node');
  assert(initial.models.includes('audit/ok-model') && initial.models.includes('audit/error-model'));
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) report.writes.push({ path, method: request.method() });
  });
  await page.goto(base + '/dashboard/distribution');
  const published = page.getByLabel('发布 audit/error-model', { exact: true });
  await published.waitFor();
  check('publication initially selected', await published.isChecked());
  await published.uncheck();
  const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/models/distribution' && response.request().method() === 'PUT');
  await page.getByRole('button', { name: '保存分发设置', exact: true }).click();
  check('browser saves distribution with JSON 200', (await saved).status() === 200);
  await page.reload();
  await published.waitFor();
  check('publication change survives reload', !(await published.isChecked()));
  const afterSave = await read('/api/models/distribution');
  check('saved allowlist retains other model', afterSave.models.includes('audit/ok-model') && !afterSave.models.includes('audit/error-model'));
  const search = page.getByLabel('搜索分发模型');
  await search.fill('audit/ok-model');
  await page.waitForFunction(() => document.querySelectorAll('.distribution-table tbody tr[data-model-id]').length === 1);
  check('model search works', await page.locator('.distribution-table tbody tr').count() === 1);
  await page.getByLabel('发布 audit/ok-model', { exact: true }).uncheck();
  await page.getByRole('button', { name: '撤销更改', exact: true }).click();
  check('discard restores saved publication', await page.getByLabel('发布 audit/ok-model', { exact: true }).isChecked());
  await page.goto(base + '/dashboard/balances?view=balances');
  const toggle = page.getByLabel('查询余额 ' + channel.name, { exact: true });
  await toggle.waitFor();
  check('balance preference initially matches database', await toggle.isChecked() === channel.enabled);
  const patched = page.waitForResponse(response => new URL(response.url()).pathname === '/api/channel-balances' && response.request().method() === 'PATCH');
  await toggle.click();
  check('browser saves balance preference with JSON 200', (await patched).status() === 200);
  await page.waitForFunction(({ name, expected }) => document.querySelector(`input[aria-label="查询余额 ${name}"]`)?.checked === expected, { name: channel.name, expected: !channel.enabled });
  await page.reload();
  await toggle.waitFor();
  check('balance preference survives reload', await toggle.isChecked() === !channel.enabled);
  await page.getByRole('tab', { name: /账号配额/ }).click();
  check('quota tab switches', await page.locator('#finance-panel-quotas').isVisible());
  await page.getByRole('tab', { name: /供应商余额/ }).click();
  check('balance tab switches', await page.locator('#finance-panel-balances').isVisible());
  const auto = page.getByLabel('自动更新余额与配额', { exact: true });
  await auto.uncheck();
  await page.reload();
  check('automatic refresh preference survives reload', !(await auto.isChecked()));
  check('no uncaught browser exceptions', report.errors.length === 0);
} catch (error) {
  report.error = error.message;
} finally {
  // Restore the isolated settings even if a browser assertion fails.
  if (initial) {
    const response = await context.request.put(base + '/api/models/distribution', { data: { mode: initial.mode, models: initial.models } });
    report.distributionRestored = response.status() === 200;
  }
  if (channel) {
    const response = await context.request.patch(base + '/api/channel-balances', { data: { channelId: channel.id, enabled: channel.enabled } });
    report.balanceRestored = response.status() === 200;
  }
  await browser.close();
  report.passed = !report.error && report.distributionRestored && report.balanceRestored;
  await writeFile(resolve(output, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, error: report.error }));
  if (!report.passed) process.exitCode = 1;
}

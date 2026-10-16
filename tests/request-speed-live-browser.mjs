import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { selectTheme } from './theme-control.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4330';
const directory = resolve('reports/request-speed-fix-20261013');
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  const writes = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) writes.push(path);
  });
  const status = await page.request.get(base + '/api/auth/status');
  assert.equal(status.status(), 200);
  assert(!(await status.json()).demo);
  assert.equal((await page.request.get(base + '/api/health')).status(), 200);
  const env = parseEnv(await readFile(process.env.TENROUTER_TEST_LOGIN_ENV || resolve(process.env.USERPROFILE, '.codex/credentials/10router-web.env'), 'utf8'));
  assert.equal((await page.request.post(base + '/api/auth/login', { data: { password: env.TENROUTER_TEST_PASSWORD.trim() } })).status(), 200);
  assert.equal((await page.goto(base + '/dashboard/logs')).status(), 200);
  await page.locator('.log-latency').first().waitFor();
  await page.getByLabel('自动刷新日志').uncheck();
  const pending = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === '/api/usage/request-details' && url.searchParams.get('pageSize') === '100';
  });
  await page.getByLabel('每页日志条数').selectOption('100');
  const logs = await pending;
  assert.equal(logs.status(), 200);
  const { details } = await logs.json();
  await page.waitForFunction(count => document.querySelectorAll('.log-latency').length === count, details.length);
  const rows = [];
  for (const theme of ['dark', 'light']) {
    await selectTheme(page, theme);
    const values = await page.locator('.log-latency').evaluateAll(nodes => nodes.map(node => ({ speed: node.querySelectorAll('b')[1].textContent, basis: node.querySelectorAll('b')[1].title })));
    for (const [index, entry] of details.entries()) {
      const output = entry.tokens?.completion_tokens ?? entry.tokens?.output_tokens;
      const { total, ttft } = entry.latency || {};
      const streaming = entry.responseMode === 'streaming';
      const duration = streaming ? total - ttft : total;
      const valid = !entry.imported && Number.isFinite(output) && output > 0 && Number.isFinite(total) && total >= 50 && (!streaming || (Number.isFinite(ttft) && ttft > 0 && duration >= 50));
      const expected = valid ? `${(output * 1000 / duration).toFixed(1)} tok/s` : '—';
      assert.equal(values[index].speed, expected, `${theme}/${entry.id}`);
      if (valid && streaming) assert.match(values[index].basis, /首包后接收速率/);
      if (theme === 'dark') rows.push({ id: entry.id, output, total, ttft, responseMode: entry.responseMode, ...values[index] });
    }
    await page.screenshot({ path: resolve(directory, `live-${theme}.png`), fullPage: true });
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  const highSpeedRows = rows.filter(row => parseFloat(row.speed) > 300).length;
  await writeFile(resolve(directory, 'live-acceptance.json'), JSON.stringify({ base, http: { status: 200, health: 200, login: 200, page: 200, logs: 200 }, rows, highSpeedRows, errors, writes }, null, 2));
  console.log(`PASS: HTTP status/health/login/page/logs=200; ${rows.length} real rows, ${highSpeedRows} above 300 tok/s; both themes match source metrics; no console errors or business writes.`);
} finally {
  await browser.close();
}

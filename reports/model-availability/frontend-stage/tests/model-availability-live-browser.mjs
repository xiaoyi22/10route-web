import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { chromium } from 'playwright';
import { selectTheme } from './theme-control.mjs';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4338';
const directory = process.env.SCREENSHOT_DIR || 'reports/model-availability/ui';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] });
const report = { base, http: [], errors: [], interceptedWrites: [], forbiddenProbes: [], screenshots: [] };
try {
  await mkdir(directory, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const read = async path => {
    const response = await context.request.get(base + path);
    report.http.push({ path, status: response.status() });
    assert.equal(response.status(), 200, path);
    return response.json();
  };
  assert.notEqual((await read('/api/auth/status')).demo, true);
  const env = parseEnv(await readFile(process.env.TENROUTER_TEST_LOGIN_ENV || 'C:/Users/Administrator/.codex/credentials/10router-web.env', 'utf8'));
  const login = await context.request.post(base + '/api/auth/login', { data: { password: env.TENROUTER_TEST_PASSWORD.trim() } });
  assert.equal(login.status(), 200);
  const initial = await read('/api/model-availability');
  assert.equal(initial.source, 'business-requests-only');
  assert.equal(initial.config.mode, 'observe');
  const providers = await read('/api/providers');
  const distribution = await read('/api/models/distribution');
  assert(initial.rows.length > 0);
  const target = initial.rows.find(row => row.providerName === 'WindHub' && row.model === 'grok-4.7');
  assert(target);
  let shadow = structuredClone(initial);
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  page.on('pageerror', error => report.errors.push(error.message));
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/model-availability') {
      if (request.method() === 'GET') return route.fulfill({ json: shadow });
      const body = request.postDataJSON();
      report.interceptedWrites.push({ method: request.method(), body });
      if (request.method() === 'POST') {
        assert.equal(body.connectionId, target.connectionId);
        assert.equal(body.model, target.model);
        shadow.rows = shadow.rows.map(row => row.key === target.key ? { ...row, blocked: body.action === 'isolate', status: body.action === 'isolate' ? 'isolated' : 'unknown', manual: body.action === 'isolate', blockReason: body.action === 'isolate' ? body.reason : undefined } : row);
        shadow.events.unshift({ id: String(++shadow.revision), at: Date.now(), ...body, action: 'manual_' + body.action });
        return route.fulfill({ json: { ok: true } });
      }
      assert.equal(request.method(), 'PUT');
      shadow.config = body.config; shadow.revision++;
      return route.fulfill({ json: shadow });
    }
    if (['GET', 'HEAD'].includes(request.method())) return route.continue();
    report.forbiddenProbes.push({ method: request.method(), path });
    return route.abort();
  });
  const pageUrl = base + '/dashboard/availability?' + new URLSearchParams({ provider: target.provider, connectionId: target.connectionId, model: target.model });
  assert.equal((await page.goto(pageUrl)).status(), 200);
  await page.getByRole('heading', { name: '模型可用性', exact: true }).waitFor();
  const row = page.getByRole('row').filter({ has: page.getByRole('cell').filter({ hasText: target.routeId }) });
  await row.waitFor();
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['dark', 'light']) {
      await selectTheme(page, theme);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const path = `${directory}/${width}-${theme}.png`;
      await page.screenshot({ path, fullPage: true }); report.screenshots.push(path);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await row.getByRole('button', { name: '隔离', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('隔离原因').fill('浏览器验收草稿，不写生产');
  await dialog.getByRole('button', { name: '确认隔离', exact: true }).click();
  await row.getByText('已隔离', { exact: true }).waitFor();
  await row.getByRole('button', { name: '解除隔离', exact: true }).click();
  await dialog.getByRole('button', { name: '解除隔离', exact: true }).click();
  await row.getByRole('button', { name: '隔离', exact: true }).waitFor();
  await page.getByRole('tab', { name: '自动处理规则', exact: true }).click();
  await page.getByLabel('连续失败阈值', { exact: true }).fill('4');
  await page.getByRole('button', { name: '保存可用性规则', exact: true }).click();
  await page.getByText('规则已保存。新请求开始累计判定；手工隔离继续保留。', { exact: true }).waitFor();
  await page.getByRole('tab', { name: '处理记录', exact: true }).click();
  await page.getByText('人工隔离', { exact: true }).waitFor();
  await page.getByText('人工解除隔离', { exact: true }).waitFor();
  await page.goto(base + '/dashboard/providers/' + target.provider);
  const link = page.locator('.availability-channel-link').filter({ hasText: /可用性|暂停|异常/ }).first();
  await link.waitFor();
  assert((await link.getAttribute('href')).includes('/dashboard/availability?'));
  await page.goto(base + '/dashboard/monitor');
  await page.getByRole('heading', { name: '模型检测', exact: true }).waitFor();
  await page.getByRole('button', { name: '指纹检测', exact: true }).waitFor();
  assert.deepEqual((await read('/api/model-availability')).config, initial.config);
  assert.deepEqual((await read('/api/providers')).connections.map(row => [row.id, row.isActive]), providers.connections.map(row => [row.id, row.isActive]));
  const finalDistribution = await read('/api/models/distribution');
  assert.deepEqual({ mode: finalDistribution.mode, models: finalDistribution.models }, { mode: distribution.mode, models: distribution.models });
  assert.deepEqual(report.forbiddenProbes, []);
  assert.deepEqual(report.errors, []);
  assert.equal(report.interceptedWrites.length, 3);
  report.passed = true;
  await writeFile(`${directory}/acceptance.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await browser.close(); }

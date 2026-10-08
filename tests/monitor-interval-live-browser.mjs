import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { monitorThinkingOptions } from '../src/api/monitor.js';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4317';
const directory = resolve(process.env.USERPROFILE || process.env.HOME, '.codex/tmp/monitor-interval');
const credentials = parseEnv(await readFile(process.env.TENROUTER_TEST_LOGIN_ENV || resolve(process.env.USERPROFILE || process.env.HOME, '.codex/credentials/10router-web.env'), 'utf8'));
assert(credentials.TENROUTER_TEST_PASSWORD, '真实登录凭据缺失');
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true, args: ['--no-proxy-server'] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  const writes = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) writes.push(request.method()); });
  const login = await context.request.post(base + '/api/auth/login', { data: { password: credentials.TENROUTER_TEST_PASSWORD } });
  assert.equal(login.status(), 200);
  const original = await (await context.request.get(base + '/api/iq-monitor')).json();
  await page.goto(base + '/dashboard/monitor');
  await page.getByRole('tab', { name: '自动检测配置', exact: true }).click();
  await page.getByLabel('自动刷新检测结果').uncheck();
  const interval = page.getByLabel('检测间隔', { exact: true });
  assert.equal(await interval.getAttribute('min'), '1');
  for (const value of ['1', '5', '15', '10080']) {
    await interval.fill(value);
    assert.equal(await interval.evaluate(input => input.checkValidity()), true, value);
  }
  for (const value of ['', '0', '-1', '0.5', '1.5', '10081']) {
    await interval.fill(value);
    assert.equal(await interval.evaluate(input => input.checkValidity()), false, value);
  }
  await interval.fill('1');
  await page.getByText('最小间隔 1 分钟，请输入整数。', { exact: true }).waitFor();
  const selected = original.config.providers.find(provider => original.catalog.some(item => item.id === provider.id && item.models.length));
  if (selected) {
    const providerIndex = original.catalog.findIndex(provider => provider.id === selected.id);
    const provider = original.catalog[providerIndex];
    const model = selected.models?.[0] || provider.models[0];
    await page.locator('.monitor-provider-config').nth(providerIndex).locator('summary').click();
    const thinking = page.getByLabel(provider.name + ' ' + model + ' 智商检测思考强度', { exact: true });
    const value = await thinking.inputValue();
    const available = monitorThinkingOptions(provider.thinkingLevels?.[model]);
    assert.deepEqual(await thinking.locator('option').evaluateAll(options => options.map(option => option.value)), ['', ...(value && !available.includes(value) ? [value] : []), ...available]);
    if (provider.thinkingLevels?.[model] === undefined && !value) {
      await page.getByLabel(provider.name + ' ' + model + ' 智商检测', { exact: true }).check();
      assert.equal(await thinking.isDisabled(), false);
      await thinking.selectOption('high');
      assert.equal(await thinking.inputValue(), 'high');
      await page.locator('.monitor-provider-config').nth(providerIndex).getByText('后端未提供档位列表，可手动选择通用档位；模型是否支持尚未确认，网关或上游可能忽略或拒绝。', { exact: true }).first().waitFor();
    }
  }
  for (const width of [1440, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), String(width));
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: resolve(directory, 'monitor-interval-real.png'), fullPage: true });
  await page.screenshot({ path: resolve(directory, 'monitor-thinking-real.png'), fullPage: true });
  const after = await (await context.request.get(base + '/api/iq-monitor')).json();
  assert.deepEqual(after.config, original.config);
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);
  console.log('PASS: real-data interval validation, four viewport widths, no configuration changes or page errors.');
} finally {
  await browser.close();
}

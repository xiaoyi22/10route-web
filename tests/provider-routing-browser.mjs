import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'C:/Users/20449/AppData/Local/Temp/hermes-e2e/.venv/Lib/site-packages/playwright/driver/package');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4319';
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(60000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text()); });
const call = async (method, data) => {
  const response = await context.request.fetch(base + '/api/settings', { method, ...(data && { data }) });
  assert.equal(response.status(), 200);
  return response.json();
};
const routing = page.getByRole('form', { name: '账号调度' });
const toggle = routing.getByRole('switch', { name: '供应商轮询' });
const limit = routing.getByLabel('粘滞请求次数');
const save = routing.getByRole('button', { name: '保存调度' });
async function saveRouting() {
  const response = page.waitForResponse(response => response.url().endsWith('/api/settings') && response.request().method() === 'PATCH');
  await save.click();
  assert.equal((await response).status(), 200);
  await routing.getByRole('status').waitFor();
  assert.equal(await routing.getByRole('status').innerText(), '已保存账号调度');
  await routing.getByText(/当前策略|继承全局/).waitFor();
}
let original;
try {
  const auth = await context.request.get(base + '/api/auth/status');
  assert.equal((await auth.json()).demo, true, 'Requires isolated demo server');
  assert.equal((await context.request.post(base + '/api/auth/login', { data: { password: 'linear-demo' } })).status(), 200);
  original = await call('GET');
  const other = { fallbackStrategy: 'round-robin', stickyRoundRobinLimit: 7 };
  await call('PATCH', { fallbackStrategy: 'fill-first', stickyRoundRobinLimit: 3, providerStrategies: { codex: { earliestExpiryFirst: true }, claude: other } });
  await page.goto(base + '/dashboard/providers/codex');
  await routing.getByText('继承全局：优先级', { exact: true }).waitFor();
  assert.equal(await toggle.isChecked(), false);
  assert.equal(await save.isEnabled(), false);
  await toggle.check();
  assert.equal(await limit.inputValue(), '1');
  await limit.fill('5');
  await toggle.uncheck();
  await toggle.check();
  assert.equal(await limit.inputValue(), '5');
  // A different operator changes another provider after this page was loaded.
  await call('PATCH', { providerStrategies: { codex: { earliestExpiryFirst: true, customOption: 'keep' }, claude: other, antigravity: { stickyRoundRobinLimit: 9 } } });
  await saveRouting();
  let settings = await call('GET');
  assert.deepEqual(settings.providerStrategies.codex, { earliestExpiryFirst: true, customOption: 'keep', fallbackStrategy: 'round-robin', stickyRoundRobinLimit: 5 });
  assert.deepEqual(settings.providerStrategies.claude, other);
  assert.deepEqual(settings.providerStrategies.antigravity, { stickyRoundRobinLimit: 9 });
  assert.equal(settings.outboundProxyUrl, original.outboundProxyUrl);
  await page.reload();
  await limit.waitFor();
  assert.equal(await limit.inputValue(), '5');
  assert.equal(await toggle.isChecked(), true);

  for (const value of ['0', '1.5', '']) {
    await limit.fill(value);
    assert.equal(await limit.evaluate(input => input.checkValidity()), false);
    assert.equal((await call('GET')).providerStrategies.codex.stickyRoundRobinLimit, 5);
  }
  await limit.fill('2');
  await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/api/settings') && response.request().method() === 'GET'),
    page.getByRole('button', { name: '刷新连接' }).click(),
  ]);
  assert.equal(await limit.inputValue(), '2');

  await page.route('**/api/settings', async route => {
    if (route.request().method() === 'PATCH') return route.fulfill({ status: 500, json: { error: '调度保存失败' } });
    return route.continue();
  });
  await save.click();
  await routing.getByRole('alert').getByText('调度保存失败').waitFor();
  assert.equal(await limit.inputValue(), '2');
  assert.equal(await routing.getByRole('status').count(), 0);
  assert.equal((await call('GET')).providerStrategies.codex.stickyRoundRobinLimit, 5);
  await page.unroute('**/api/settings');
  await saveRouting();
  await toggle.uncheck();
  await saveRouting();
  assert.deepEqual((await call('GET')).providerStrategies.codex, { earliestExpiryFirst: true, customOption: 'keep' });

  // Removing an override still uses the global round-robin strategy.
  await call('PATCH', { fallbackStrategy: 'round-robin', stickyRoundRobinLimit: 4 });
  await page.reload();
  await routing.getByText('继承全局：轮询 · 粘滞 4 次', { exact: true }).waitFor();
  assert.equal(await toggle.isChecked(), false);
  await toggle.check();
  await limit.fill('3');
  await saveRouting();
  await page.waitForFunction(() => {
    const images = [...document.querySelectorAll('.provider-mark img')];
    return images.length > 0 && images.every(image => image.complete && image.naturalWidth > 0);
  });
  const screenshotDir = process.env.SCREENSHOT_DIR;
  if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
  for (const width of [1440, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark']) {
      await page.getByLabel('主题模式').selectOption(theme);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Page overflow: ${width}, ${theme}`);
      assert.equal(await routing.evaluate(form => form.scrollWidth <= form.clientWidth), true);
      if (screenshotDir) await page.screenshot({ path: resolve(screenshotDir, `provider-routing-${width}-${theme}.png`), fullPage: true });
    }
  }
  await page.goto(base + '/dashboard/providers/claude');
  await limit.waitFor();
  assert.equal(await limit.inputValue(), '7');
  await page.goto(base + '/dashboard/providers/antigravity');
  await toggle.waitFor();
  await toggle.check();
  await saveRouting();
  await toggle.uncheck();
  await saveRouting();
  assert.equal(Object.hasOwn((await call('GET')).providerStrategies, 'antigravity'), false);
  assert.deepEqual(errors, []);
  console.log('PASS OAuth provider routing: round-robin/sticky save and reload, preserved settings, fresh merge, global inheritance, validation, draft refresh, failure/retry, provider navigation, desktop/mobile themes, no uncaught exceptions.');
} finally {
  if (original) await call('PATCH', { providerStrategies: original.providerStrategies || {}, fallbackStrategy: original.fallbackStrategy || 'fill-first', stickyRoundRobinLimit: original.stickyRoundRobinLimit || 3 });
  await browser.close();
}

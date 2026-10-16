import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { selectTheme } from './theme-control.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4334';
const directory = 'reports/balances-auto-20261013/isolated';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  const requests = { balances: [], quotas: [] };
  const checks = [];
  let quotaBlock;
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(`${message.text()} ${message.location().url}`); });
  assert.equal((await (await page.request.get(base + '/api/auth/status')).json()).demo, true);
  for (const [key, endpoint, payload] of [
    ['balances', 'channel-balances', { channels: [], channelOptions: [], errors: [] }],
    ['quotas', 'usage/quotas', { connections: [] }],
  ]) {
    await page.route(`**/api/${endpoint}**`, async route => {
      requests[key].push(route.request().url());
      if (key === 'quotas' && quotaBlock) await quotaBlock;
      await route.fulfill({ json: payload });
    });
  }
  await page.clock.install();
  await page.goto(base + '/dashboard/balances');
  await page.getByLabel('登录密码').fill('linear-demo');
  await page.getByRole('button', { name: '进入管理端', exact: true }).click();
  const toggle = page.getByLabel('自动更新余额与配额', { exact: true });
  const refresh = page.getByRole('button', { name: '刷新余额与配额', exact: true });
  const ready = () => refresh.waitFor({ state: 'visible' }).then(() => page.waitForFunction(() => !document.querySelector('[aria-label="刷新余额与配额"]').disabled));
  const counts = () => [requests.balances.length, requests.quotas.length];
  await ready();
  assert(await toggle.isChecked());
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  let before = counts();
  const tick = page.waitForResponse(response => response.url().includes('/api/usage/quotas?refresh='));
  await page.clock.runFor(60000);
  assert.equal((await tick).status(), 200);
  await ready();
  assert.deepEqual(counts(), [before[0], before[1] + 1]);
  assert(!requests.quotas.at(-1).includes('force=1'));
  checks.push('配额每分钟查询一次，隐藏的余额标签不查询，遵守接口缓存');

  await toggle.uncheck();
  before = counts();
  await page.clock.runFor(10 * 60000);
  assert.deepEqual(counts(), before);
  await page.clock.resume();
  await page.reload();
  await ready();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  assert.equal(await toggle.isChecked(), false);
  before = counts();
  await page.clock.runFor(10 * 60000);
  assert.deepEqual(counts(), before);
  checks.push('关闭后停止定时查询，重载仍保持关闭');

  const manual = Promise.all([
    page.waitForResponse(response => response.url().includes('/api/channel-balances?force=1')),
    page.waitForResponse(response => response.url().includes('/api/usage/quotas?force=1')),
  ]);
  await refresh.click();
  assert((await manual).every(response => response.status() === 200));
  await ready();
  checks.push('关闭自动更新时仍可手动刷新两个接口');

  await toggle.check();
  let releaseQuota;
  quotaBlock = new Promise(resolve => { releaseQuota = resolve; });
  before = counts();
  await page.clock.runFor(60000);
  await page.waitForFunction(() => document.querySelector('[aria-label="刷新余额与配额"]').disabled);
  assert.deepEqual(counts(), [before[0], before[1] + 1]);
  await page.clock.runFor(10 * 60000);
  assert.deepEqual(counts(), [before[0], before[1] + 1]);
  quotaBlock = null;
  releaseQuota();
  await ready();
  checks.push('请求未结束时不会叠加自动请求，手动刷新后自动请求不会继续携带force');

  await page.getByRole('tab', { name: '供应商余额', exact: true }).click();
  assert.match(await toggle.locator('..').innerText(), /5 分钟/);
  before = counts();
  await page.clock.runFor(4 * 60000);
  assert.deepEqual(counts(), before);
  const walletTick = page.waitForResponse(response => response.url().includes('/api/channel-balances?refresh='));
  await page.clock.runFor(60000);
  assert.equal((await walletTick).status(), 200);
  await ready();
  assert.deepEqual(counts(), [before[0] + 1, before[1]]);
  checks.push('余额每5分钟查询一次，隐藏的配额标签不查询');

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  before = counts();
  await page.clock.runFor(15 * 60000);
  assert.deepEqual(counts(), before);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(4 * 60000);
  assert.deepEqual(counts(), before);
  const resumed = page.waitForResponse(response => response.url().includes('/api/channel-balances?refresh='));
  await page.clock.runFor(60000);
  await resumed;
  await ready();
  assert.deepEqual(counts(), [before[0] + 1, before[1]]);
  checks.push('浏览器后台暂停，返回前台重新计时，不补发积压请求');

  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '模型价格', exact: true }).click();
  await toggle.waitFor({ state: 'detached' });
  before = counts();
  await page.clock.runFor(15 * 60000);
  assert.deepEqual(counts(), before);
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '余额与配额', exact: true }).click();
  await ready();
  assert(await toggle.isChecked());
  assert(requests.balances.length > before[0] && requests.quotas.length > before[1]);
  checks.push('离开余额与配额页面后两个接口均停止，返回时保留开启状态并进行初始读取');

  await mkdir(directory, { recursive: true });
  for (const theme of ['dark', 'light']) {
    await selectTheme(page, theme);
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await page.screenshot({ path: `${directory}/${theme}.png`, fullPage: true });
  }
  assert.deepEqual(errors, []);
  await writeFile(`${directory}/acceptance.json`, JSON.stringify({ checks, errors, counts: counts() }, null, 2));
  console.log(`PASS: ${checks.length} checks; default-on, persistence, manual refresh, one/five-minute intervals, hidden tab, route leave, no overlapping requests, both themes and four widths; no console errors.`);
} finally {
  await browser.close();
}

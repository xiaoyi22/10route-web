import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4338';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, hasTouch: true });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const details = [
  { id: 'endpoint-responses', endpoint: '/v1/responses', upstreamEndpoint: '/v1/chat/completions' },
  { id: 'endpoint-chat', endpoint: '/v1/chat/completions', upstreamEndpoint: '/v1/responses' },
  { id: 'endpoint-legacy', endpoint: '/v1/messages' },
  { id: 'endpoint-long', endpoint: '/v1/responses', upstreamEndpoint: '/v1/' + 'long-path/'.repeat(45) },
].map(entry => ({ ...entry, model: entry.id, provider: 'codex', connectionId: 'demo-codex', timestamp: new Date().toISOString(), status: 'success', tokens: {}, responseMode: 'streaming' }));

try {
  await page.goto(base + '/dashboard/logs');
  await page.getByLabel('登录密码').fill('linear-demo');
  await page.getByRole('button', { name: '进入管理端' }).click();
  await page.getByRole('heading', { name: '请求日志', exact: true }).waitFor();
  await page.route('**/api/usage/request-details?**', route => route.fulfill({ json: { details, pagination: { page: 1, pageSize: 20, totalItems: 4, totalPages: 1 } } }));
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await page.getByRole('cell', { name: 'endpoint-responses', exact: true }).waitFor();
  await page.getByLabel('自动刷新日志').uncheck();
  assert.equal(await page.locator('.log-endpoint-trigger').count(), 4, 'Each endpoint needs a hover/focus trigger');
  const responses = page.getByRole('button', { name: '查看请求端点 endpoint-responses', exact: true });
  const tooltip = page.getByRole('tooltip');
  await responses.hover();
  await tooltip.waitFor();
  assert.equal(await tooltip.locator('dt').nth(0).innerText(), '入口端点');
  assert.equal(await tooltip.locator('dt').nth(1).innerText(), '出口端点');
  assert.equal(await tooltip.locator('dd').nth(0).innerText(), '/v1/responses');
  assert.equal(await tooltip.locator('dd').nth(1).innerText(), '/v1/chat/completions');
  assert.equal(await responses.getAttribute('title'), null);
  await tooltip.hover();
  assert.equal(await tooltip.isVisible(), true);
  await page.keyboard.press('Escape');
  await tooltip.waitFor({ state: 'hidden' });
  await page.waitForTimeout(200);
  assert.equal(await tooltip.count(), 0, 'Removing the card must not reopen the underlying row without pointer movement');
  await page.getByRole('button', { name: '查看请求端点 endpoint-chat', exact: true }).focus();
  await tooltip.waitFor();
  assert.equal(await tooltip.locator('dd').nth(0).innerText(), '/v1/chat/completions');
  assert.equal(await tooltip.locator('dd').nth(1).innerText(), '/v1/responses');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '查看请求端点 endpoint-legacy', exact: true }).hover();
  await tooltip.waitFor();
  assert.equal(await tooltip.locator('dd').nth(1).innerText(), '未记录');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '查看请求 endpoint-responses', exact: true }).click();
  const dialog = page.getByRole('dialog');
  assert((await dialog.innerText()).includes('入口端点'));
  assert((await dialog.innerText()).includes('出口端点'));
  assert((await dialog.innerText()).includes('/v1/chat/completions'));
  await page.getByRole('button', { name: '关闭窗口' }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出当前页', exact: true }).click();
  const stream = await (await downloading).createReadStream();
  let csv = '';
  for await (const chunk of stream) csv += chunk.toString();
  assert(csv.includes('"入口端点","出口端点"'));
  assert(csv.includes('"/v1/responses","/v1/chat/completions"'));
  await mkdir('screenshots', { recursive: true });
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    await page.mouse.move(0, 0);
    await responses.hover();
    await tooltip.waitFor();
    await page.screenshot({ path: 'screenshots/endpoint-tooltip-' + theme + '.png' });
    await page.keyboard.press('Escape');
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: '查看请求端点 endpoint-long', exact: true }).tap();
  await tooltip.waitFor();
  const bounds = await tooltip.boundingBox();
  assert(bounds.x >= 0 && bounds.x + bounds.width <= 375);
  assert(bounds.y >= 0 && bounds.y + bounds.height <= 812);
  assert(await tooltip.evaluate(element => element.scrollWidth <= element.clientWidth));
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: 'screenshots/endpoint-tooltip-mobile.png' });
  await page.getByRole('heading', { name: '请求日志', exact: true }).click();
  await tooltip.waitFor({ state: 'hidden' });
  assert.deepEqual(errors, []);
  console.log('PASS: endpoint hover/focus/touch card, actual values, unknown history, Escape, details, CSV, themes and viewport bounds');
} finally {
  await browser.close();
}

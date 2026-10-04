import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4318';
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
  page.setDefaultNavigationTimeout(120000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  assert.equal((await (await page.request.get(`${base}/api/auth/status`)).json()).demo, true);
  await page.goto(`${base}/dashboard/models`);
  await page.getByLabel('登录密码').fill('linear-demo');
  await page.getByRole('button', { name: '进入管理端' }).click();
  await page.locator('tbody .provider-link').first().waitFor();
  const models = [
    { provider: 'cx', model: 'model-a', routedModel: 'cx/model-a', name: '模型甲', caps: {} },
    { provider: 'codex', model: 'model-b', routedModel: 'codex/model-b', name: '模型乙', caps: {} },
    { provider: 'demo', model: 'model-c', routedModel: 'demo/model-c', name: '模型丙', caps: {} },
    { provider: 'codebuddy-cn', model: 'model-d', routedModel: 'codebuddy-cn/model-d', name: '模型丁', caps: {} },
  ];
  await page.route('**/api/models', route => route.fulfill({ json: { models } }));
  await page.route('**/api/models/custom', route => route.fulfill({ json: { models: [] } }));
  await page.route('**/api/providers', route => route.fulfill({ json: { connections: [
    { id: 'a', provider: 'codex', name: '开发账号', isActive: true },
    { id: 'b', provider: 'openai-compatible-chat-demo', name: '兼容账号', isActive: true },
    { id: 'c', provider: 'codebuddy-cn', name: '腾讯账号', isActive: true },
  ] } }));
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 4);
  assert.equal(await page.getByLabel('模型供应商').locator('option').count(), 4);
  assert((await page.getByLabel('模型供应商').innerText()).includes('WorkBuddy / CodeBuddy CN'));
  assert((await page.locator('tbody').innerText()).includes('演示兼容节点'));
  await page.getByLabel('模型供应商').selectOption('codex');
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 2);
  assert((await page.locator('tbody').innerText()).includes('cx/model-a'));
  assert((await page.locator('tbody').innerText()).includes('codex/model-b'));
  await page.getByLabel('模型供应商').selectOption('');
  await page.getByLabel('搜索模型').fill('兼容节点');
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1);
  await page.getByRole('link', { name: '演示兼容节点', exact: true }).click();
  await page.getByRole('heading', { name: '演示兼容节点', exact: true }).waitFor();
  assert(page.url().endsWith('/dashboard/providers/openai-compatible-chat-demo'));
  await page.goto(`${base}/dashboard/models`);
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 4);
  await mkdir('screenshots', { recursive: true });
  await page.waitForFunction(() => [...document.querySelectorAll('.provider-mark img')].every(image => image.complete && image.naturalWidth > 0));
  await page.screenshot({ path: 'screenshots/model-suppliers.png', fullPage: true });
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(200);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/dashboard/overview`);
  await page.locator('.usage-total-row').waitFor();
  const cells = await page.locator('.usage-total-row td').allTextContents();
  assert.deepEqual(cells.slice(2, 6), ['3,922,080', '1,824,240', '5,746,320', '2,141,040']);
  assert.equal(await page.getByTestId('cache-rate').innerText(), '54.6%');
  await page.getByRole('button', { name: '7 天', exact: true }).click();
  await page.getByTestId('request-value').filter({ hasText: '79,891' }).waitFor();
  assert.deepEqual((await page.locator('.usage-total-row td').allTextContents()).slice(2, 6), ['20,917,760', '9,729,280', '30,647,040', '11,418,880']);
  await page.waitForFunction(() => [...document.querySelectorAll('.provider-mark img')].every(image => image.complete && image.naturalWidth > 0));
  await page.screenshot({ path: 'screenshots/token-cache-table.png', fullPage: true });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.waitForTimeout(200);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: 'screenshots/mobile-token-table.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const byModel = Object.fromEntries(Array.from({ length: 45 }, (_, index) => [`model-${index}`, { rawModel: `model-${index}`, provider: 'codex', requests: index + 1, promptTokens: 100, completionTokens: 20, cachedTokens: index % 2 ? 0 : 25 }]));
  await page.route('**/api/usage/stats?**', route => route.fulfill({ json: { totalRequests: 1035, totalPromptTokens: 4500, totalCompletionTokens: 900, totalCachedTokens: 575, totalCost: 0, byModel, recentRequests: [] } }));
  await page.goto(`${base}/dashboard/overview`);
  await page.waitForFunction(() => document.querySelectorAll('.token-usage-section tbody tr').length === 21);
  await page.getByRole('button', { name: '下一页用量模型' }).click();
  await page.getByRole('button', { name: '下一页用量模型' }).click();
  assert.equal(await page.locator('.token-usage-section tbody tr').count(), 6);
  assert.equal(await page.getByRole('button', { name: '下一页用量模型' }).isDisabled(), true);
  assert.deepEqual((await page.locator('.usage-total-row td').allTextContents()).slice(2, 6), ['4,500', '900', '5,400', '575']);
  assert.deepEqual(errors, []);
  console.log('PASS: readable model supplier names, alias filter grouping, custom node navigation, unchanged route IDs, input/output/cache totals, period changes, 45-model pagination, desktop/mobile layouts.');
} finally { await browser.close(); }

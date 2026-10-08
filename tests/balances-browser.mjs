import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4318';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  assert.equal((await (await page.request.get(`${base}/api/auth/status`)).json()).demo, true);
  const at = '2026-10-03T00:00:00Z';
  const payload = { generatedAt: at, channelOptions: [{ id: 'one', name: 'Zero Wallet', enabled: true }, { id: 'two', name: 'No Adapter', enabled: true }], channels: [{ id: 'one', name: 'Zero Wallet', connections: [{ id: 'account', name: 'Account', status: 'partial', checkedAt: at, stale: true, wallet: { amount: 0, currency: 'USD' }, available: { amount: 20, currency: 'USD' }, limits: [{ period: 'daily', limit: 100, used: 80, remaining: 20, currency: 'USD', resetsAt: at }], keyQuota: { unlimited: true, used: 10, remaining: null }, error: 'Upstream timed out' }], subscriptions: [{ id: 'shared', name: 'Shared plan', windows: [{ period: 'weekly', limit: 1000, used: 40, remaining: 960, currency: 'USD' }] }] }], errors: [] };
  const requests = [];
  let quotaRequests = 0;
  await page.route('**/api/channel-balances**', async route => {
    requests.push(route.request().url());
    if (route.request().method() === 'PATCH') { const change = route.request().postDataJSON(); payload.channelOptions.find(item => item.id === change.channelId).enabled = change.enabled; }
    await route.fulfill({ json: payload });
  });
  await page.route('**/api/usage/quotas**', route => { quotaRequests += 1; return route.fulfill({ json: { generatedAt: at, connections: [{ id: 'quota', providerName: 'Codex', name: 'Quota account', isActive: true, checkedAt: at, quotas: [{ name: '5h', total: 100, used: 75, remaining: 25, resetAt: at }] }] } }); });
  await page.goto(`${base}/dashboard/balances`);
  await page.getByLabel('登录密码').fill('linear-demo');
  await page.getByRole('button', { name: '进入管理端' }).click();
  const quotaTab = page.getByRole('tab', { name: '账号配额', exact: true });
  const balanceTab = page.getByRole('tab', { name: '供应商余额', exact: true });
  async function showView(tab, name) {
    await tab.click();
    await page.getByRole('tabpanel', { name, exact: true }).waitFor();
  }
  await quotaTab.waitFor();
  assert.equal(await quotaTab.getAttribute('aria-selected'), 'true');
  assert.equal(await page.getByRole('tabpanel', { name: '账号配额', exact: true }).isVisible(), true);
  assert.equal(await page.getByRole('tabpanel', { name: '供应商余额', exact: true }).count(), 0);
  await page.locator('.quota-card').waitFor();
  const initialBalanceRequests = requests.length;
  const initialQuotaRequests = quotaRequests;
  await page.getByLabel('搜索配额账号').fill('Quota');
  await showView(balanceTab, '供应商余额');
  assert.equal(new URL(page.url()).searchParams.get('view'), 'balances');
  assert.equal(await page.getByLabel('搜索余额账号').inputValue(), '');
  await page.getByLabel('搜索余额账号').fill('Zero');
  await showView(quotaTab, '账号配额');
  assert.equal(await page.getByLabel('搜索配额账号').inputValue(), 'Quota');
  await page.getByLabel('搜索配额账号').fill('');
  await showView(balanceTab, '供应商余额');
  assert.equal(await page.getByLabel('搜索余额账号').inputValue(), 'Zero');
  await page.getByLabel('搜索余额账号').fill('');
  assert.equal(requests.length, initialBalanceRequests, 'Changing tabs must not refresh the wallet');
  assert.equal(quotaRequests, initialQuotaRequests, 'Changing tabs must not refresh quotas');
  await balanceTab.focus();
  await page.keyboard.press('ArrowLeft');
  await page.getByRole('tabpanel', { name: '账号配额', exact: true }).waitFor();
  assert.equal(await quotaTab.getAttribute('aria-selected'), 'true');
  assert.equal(await quotaTab.evaluate(element => element === document.activeElement), true);
  await page.keyboard.press('End');
  await page.getByRole('tabpanel', { name: '供应商余额', exact: true }).waitFor();
  assert.equal(await balanceTab.getAttribute('aria-selected'), 'true');
  await page.reload();
  await page.getByRole('tabpanel', { name: '供应商余额', exact: true }).waitFor();
  assert.equal(await balanceTab.getAttribute('aria-selected'), 'true');
  assert((await page.evaluate(() => getComputedStyle(document.body).fontFamily)).includes('SF Pro Text'));
  await page.getByText('0 USD', { exact: true }).waitFor();
  await page.getByText('20 USD', { exact: true }).first().waitFor();
  await page.getByText('不限额', { exact: true }).first().waitFor();
  await page.getByRole('alert').filter({ hasText: 'Upstream timed out' }).waitFor();
  await page.getByText('该供应商尚未提供可查询的余额数据。', { exact: true }).waitFor();
  assert((await page.locator('.finance-values').innerText()).includes('上次数据'));
  await page.getByLabel('查询余额 Zero Wallet').click();
  await page.getByText('余额查询已关闭', { exact: true }).waitFor();
  await page.getByLabel('查询余额 Zero Wallet').click();
  await page.getByText('0 USD', { exact: true }).waitFor();
  const refreshed = page.waitForResponse(response => response.url().includes('channel-balances?force=1'));
  await page.getByRole('button', { name: '刷新余额与配额', exact: true }).click();
  await refreshed;
  assert(requests.some(url => url.includes('force=1')));
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('主题模式').selectOption(theme);
    for (const width of [320, 375, 768, 960, 1280, 1536, 1920]) {
      await page.setViewportSize({ width, height: width === 1280 ? 720 : 1000 });
      await page.waitForTimeout(250);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await showView(quotaTab, '账号配额');
      assert.equal(await page.getByRole('tabpanel', { name: '账号配额', exact: true }).isVisible(), true);
      assert.equal(await page.getByRole('tabpanel', { name: '供应商余额', exact: true }).count(), 0);
      await showView(balanceTab, '供应商余额');
      assert.equal(await page.getByRole('tabpanel', { name: '账号配额', exact: true }).count(), 0);
    }
    await page.screenshot({ path: `screenshots/balances-${theme}.png`, fullPage: true });
  }
  await page.getByLabel('搜索余额账号').fill('No Adapter');
  assert.equal(await page.locator('.finance-account').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: quota/wallet tabs, independent searches, keyboard, URL reload, no refresh on switching, SF font stack, wallet semantics and seven responsive widths in both themes.');
} finally { await browser.close(); }

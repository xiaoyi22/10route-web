import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4320';
const live = process.argv.includes('--live');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  const writes = [];
  const apiStatuses = [];
  const resourceFailures = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) writes.push(pathname);
  });
  page.on('response', response => {
    const pathname = new URL(response.url()).pathname;
    if (['/api/usage/request-details', '/api/pricing'].includes(pathname)) apiStatuses.push({ pathname, status: response.status() });
    if (response.status() >= 400) resourceFailures.push({ pathname, status: response.status() });
  });
  const status = await page.request.get(`${base}/api/auth/status`);
  assert.equal(status.status(), 200);
  assert.equal(Boolean((await status.json()).demo), !live);
  if (live) {
    const credentials = parseEnv(await readFile(process.env.TENROUTER_TEST_LOGIN_ENV || 'C:/Users/Meet/.codex/credentials/10router-web.env', 'utf8'));
    const login = await page.request.post(`${base}/api/auth/login`, { data: { password: credentials.TENROUTER_TEST_PASSWORD.trim() } });
    assert.equal(login.status(), 200);
  } else {
    await page.route('**/api/usage/request-details?**', route => route.fulfill({ json: {
      details: [{ id: 'layout-long', model: 'claude-sonnet-4-20250514-long-model-name', provider: 'claude', status: 'success', endpoint: '/v1/chat/completions', reasoningEffort: 'high', billingMode: 'token', responseMode: 'non-streaming', timestamp: '2026-10-10T08:52:31.000Z', cost: 123.456789, latency: { ttft: 16740, total: 137000 }, tokens: { prompt_tokens: 1234567, completion_tokens: 168765, cached_tokens: 987654 } }],
      pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1, hasNext: false, hasPrev: false },
    } }));
  }
  await page.goto(`${base}/dashboard/logs`);
  if (!live) {
    await page.getByLabel('登录密码').fill('linear-demo');
    await page.getByRole('button', { name: '进入管理端', exact: true }).click();
  }
  await page.locator('.log-model').first().waitFor();
  const rowCount = await page.locator('.log-model').count();
  await page.getByLabel('自动刷新日志').uncheck();
  await page.evaluate(() => document.fonts.ready);
  assert.deepEqual(resourceFailures, [], 'page resources must load through the production server');
  assert(await page.locator('.avatar img').evaluate(image => image.complete && image.naturalWidth > 0), 'profile image must load through the production server');
  const widths = [];
  for (const prices of [false, true]) {
    await page.getByLabel('显示日志价格').setChecked(prices);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const modelWidth = await page.locator('.logs-table tbody td').first().evaluate(cell => cell.getBoundingClientRect().width);
    assert(modelWidth >= 160 && modelWidth <= 220, `prices=${prices}: model column must not absorb spare width; actual=${modelWidth}`);
    for (const theme of ['dark', 'light']) {
      await page.getByLabel('主题模式').selectOption(theme);
      for (const width of [320, 375, 768, 1280, 1440, 1920]) {
        await page.setViewportSize({ width, height: 1080 });
        const layout = await page.evaluate(() => {
          const table = document.querySelector('.logs-table');
          const shell = table.parentElement;
          const headers = [...table.querySelectorAll('thead th')];
          const cellWidths = Object.fromEntries(headers.map(header => [header.textContent, header.getBoundingClientRect().width]));
          const failures = [];
          for (const row of table.querySelectorAll('tbody tr')) {
            for (const cell of row.cells) {
              const rect = cell.getBoundingClientRect();
              for (const element of cell.querySelectorAll('.log-model, .log-latency > *, .log-time > *, .log-token-lines b, .log-token-cache, .status, .provider-link, .log-endpoint-trigger, .icon-button')) {
                const child = element.getBoundingClientRect();
                if (child.left < rect.left - 1 || child.right > rect.right + 1 || child.top < rect.top - 1 || child.bottom > rect.bottom + 1) failures.push(`${headers[cell.cellIndex].textContent}: ${element.textContent} outside cell (width=${rect.width.toFixed(1)}, right overflow=${(child.right - rect.right).toFixed(1)})`);
              }
              if (cell.classList.contains('log-cost')) {
                const range = document.createRange();
                range.selectNodeContents(cell);
                if (range.getBoundingClientRect().right > rect.right - 7 || range.getClientRects().length !== 1) failures.push('price wraps or exceeds available cell width');
              }
            }
          }
          return { cellWidths, failures, pageOverflow: document.documentElement.scrollWidth > innerWidth + 1, shellOverflow: shell.scrollWidth > shell.clientWidth + 1 };
        });
        const label = `${live ? 'live' : 'stress'}/${theme}/prices=${prices}/${width}`;
        assert.deepEqual(layout.failures, [], label);
        assert.equal(layout.pageOverflow, false, `${label}: page overflow`);
        if (width >= 1440) assert.equal(layout.shellOverflow, false, `${label}: desktop table overflow`);
        assert.equal(Object.hasOwn(layout.cellWidths, '费用 · USD'), prices, `${label}: price column visibility`);
        if (theme === 'dark' && width >= 1440) widths.push({ prices, width, columns: layout.cellWidths });
      }
    }
    const narrow = widths.find(sample => sample.prices === prices && sample.width === 1440).columns;
    const wide = widths.find(sample => sample.prices === prices && sample.width === 1920).columns;
    for (const name of ['端点', '供应商', 'Token', '延迟']) assert(wide[name] > narrow[name] + 15, `${name} must share spare desktop width (prices=${prices})`);
    await page.getByLabel('主题模式').selectOption('dark');
    await mkdir('screenshots', { recursive: true });
    await page.screenshot({ path: `screenshots/log-layout-${live ? 'live' : 'stress'}-${prices ? 'prices' : 'default'}.png`, fullPage: true });
  }
  const model = page.locator('.log-model').first();
  assert.equal(await model.getAttribute('title'), await model.innerText());
  if (!live) {
    assert.equal(await page.locator('.log-cost').first().innerText(), '$123.456789');
    await page.unroute('**/api/usage/request-details?**');
    await page.route('**/api/usage/request-details?**', route => route.fulfill({ json: { details: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } } }));
    await page.setViewportSize({ width: 320, height: 1080 });
    await page.getByRole('button', { name: '刷新', exact: true }).click();
    await page.getByText('没有匹配的请求记录', { exact: true }).waitFor();
    for (const prices of [false, true]) {
      await page.getByLabel('显示日志价格').setChecked(prices);
      const empty = await page.locator('.table-shell').evaluate(shell => ({ overflow: shell.scrollWidth > shell.clientWidth + 1 && getComputedStyle(shell).overflowX !== 'hidden', span: shell.querySelector('td.table-empty').colSpan }));
      assert.equal(empty.overflow, false, `empty/prices=${prices}: unnecessary table scroll`);
      assert.equal(empty.span, prices ? 12 : 11);
    }
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(resourceFailures, []);
  assert.deepEqual(writes, live ? [] : ['/api/auth/login']);
  for (const pathname of ['/api/usage/request-details', '/api/pricing']) {
    const responses = apiStatuses.filter(response => response.pathname === pathname);
    assert(responses.length > 0, `${pathname}: missing HTTP response`);
    assert(responses.every(response => response.status === 200), `${pathname}: non-200 HTTP response`);
  }
  console.log(`HTTP auth/status=200, request-details=200, pricing=200; ${live ? 'auth/login=200; real data' : 'long model/endpoint + large token counts'}; rows=${rowCount}; PASS: 24 theme/price/viewport combinations, bounded model width, shared spare space, contained content, no console errors/business writes.`);
  console.log(JSON.stringify(widths, null, 2));
} finally {
  await browser.close();
}

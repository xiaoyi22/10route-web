import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4320';
const live = process.argv.includes('--live');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const cases = [
  [16740, 137000, 5.1, '16.74s', '2m 17s', 'warning'],
  [36830, 75000, 13.4, '36.83s', '1m 15s', 'slow'],
  [3250, 24900, 27.6, '3.25s', '24.90s', 'fast'],
  [6540, 10810, 23.8, '6.54s', '10.81s', 'fast'],
  [23800, 32850, 13.0, '23.80s', '32.85s', 'slow'],
  [2730, 14590, 25.7, '2.73s', '14.59s', 'fast'],
];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  const writes = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) writes.push(new URL(request.url()).pathname); });
  const status = await page.request.get(`${base}/api/auth/status`);
  assert.equal(status.status(), 200);
  assert.equal(Boolean((await status.json()).demo), !live);
  if (live) {
    const credentials = parseEnv(await readFile(process.env.TENROUTER_TEST_LOGIN_ENV || 'C:/Users/Meet/.codex/credentials/10router-web.env', 'utf8'));
    const login = await page.request.post(`${base}/api/auth/login`, { data: { password: credentials.TENROUTER_TEST_PASSWORD.trim() } });
    assert.equal(login.status(), 200);
    console.log('HTTP auth/status=200, auth/login=200 (live)');
  } else {
    await page.route('**/api/usage/request-details?**', async route => {
      const details = cases.map(([ttft, total, tps], index) => ({ id: `latency-${index}`, model: 'claude-sonnet', provider: 'claude', status: 'success', responseMode: 'non-streaming', timestamp: '2026-10-09T08:52:31.000Z', latency: { ttft, total }, tokens: { prompt_tokens: 1200, completion_tokens: Math.round(tps * total / 1000) } }));
      details.push({ id: 'unknown', model: 'imported-record', imported: true, timestamp: 'invalid', latency: { ttft: 1000, total: 3000 } });
      details.push({ id: 'zero', model: 'zero-record', timestamp: '2026-10-09T08:52:31.000Z', latency: { ttft: 0, total: 0 } });
      await route.fulfill({ json: { details, pagination: { page: 1, pageSize: 20, totalItems: details.length, totalPages: 1, hasNext: false, hasPrev: false } } });
    });
  }
  await page.goto(`${base}/dashboard/logs`);
  if (!live) {
    await page.getByLabel('登录密码').fill('linear-demo');
    await page.getByRole('button', { name: '进入管理端', exact: true }).click();
  }
  await page.locator('.log-latency').first().waitFor();
  await page.getByLabel('自动刷新日志').uncheck();
  await page.evaluate(() => document.fonts.ready);
  if (!live) {
    for (const [index, [, , tps, first, total, tone]] of cases.entries()) {
      const block = page.locator('.log-latency').nth(index);
      assert.deepEqual(await block.locator('b').allTextContents(), [first, `${tps.toFixed(1)} tok/s`, total]);
      assert.deepEqual(await block.locator('span').allTextContents(), ['首字', '生成速度', '总耗时']);
      assert((await block.getAttribute('class')).includes(`log-latency-${tone}`));
    }
    assert.deepEqual(await page.locator('.log-latency').nth(6).locator('b').allTextContents(), ['—', '—', '—']);
    assert.deepEqual(await page.locator('.log-latency').nth(7).locator('b').allTextContents(), ['0.00s', '—', '0.00s']);
  }
  await mkdir('screenshots', { recursive: true });
  for (const theme of ['dark', 'light']) {
    await page.getByLabel('主题模式').selectOption(theme);
    for (const prices of [false, true]) {
      await page.getByLabel('显示日志价格').setChecked(prices);
      for (const width of [320, 375, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.waitForTimeout(100);
        const layout = await page.evaluate(() => {
          const failures = [];
          for (const block of document.querySelectorAll('.log-latency')) {
            const cell = block.parentElement.getBoundingClientRect();
            const values = [...block.children].filter(element => element.tagName === 'B').map(element => element.getBoundingClientRect());
            if (values.some(value => value.right > cell.right + 1)) failures.push('latency outside cell');
            if (values.some(value => Math.abs(value.left - values[0].left) > 1)) failures.push('values misaligned');
            if (getComputedStyle(block, '::before').width !== '4px') failures.push('missing color bar');
            for (const value of block.children) {
              const rect = value.getBoundingClientRect();
              if (rect.top < cell.top || rect.bottom > cell.bottom) failures.push('vertical overlap');
            }
          }
          for (const clock of document.querySelectorAll('.log-time')) {
            const cell = clock.parentElement.getBoundingClientRect();
            if ([...clock.children].some(value => value.getBoundingClientRect().right > cell.right + 1)) failures.push('time outside cell');
          }
          return { failures, pageOverflow: document.documentElement.scrollWidth > innerWidth + 1, shellOverflow: document.querySelector('.table-shell').scrollWidth > document.querySelector('.table-shell').clientWidth + 1 };
        });
        assert.deepEqual(layout.failures, [], `${theme}/${prices}/${width}`);
        assert.equal(layout.pageOverflow, false, `${theme}/${prices}/${width}: page overflow`);
        if (width === 1440) assert.equal(layout.shellOverflow, false, 'desktop table overflow');
      }
    }
    await page.screenshot({ path: `screenshots/request-latency-${live ? 'live' : 'sample'}-${theme}.png`, fullPage: true });
    if (live && theme === 'dark') await page.screenshot({ path: 'screenshots/request-latency-live-preview.png' });
    if (!live && theme === 'dark') {
      await page.setViewportSize({ width: 1440, height: 1600 });
      const cells = page.locator('.logs-table tbody td').filter({ has: page.locator('.log-latency') });
      const first = await cells.nth(0).boundingBox();
      const last = await cells.nth(5).boundingBox();
      await page.screenshot({ path: 'screenshots/request-latency-reference.png', clip: { x: first.x, y: first.y, width: first.width, height: last.y + last.height - first.y } });
    }
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, live ? [] : ['/api/auth/login']);
  console.log(`PASS: ${live ? 'real data' : 'six reference rows + unknown/zero'}; 16 theme/price/viewport combinations; alignment, 4px bars, time separation, no console errors or business writes.`);
} finally { await browser.close(); }

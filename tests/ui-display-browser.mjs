import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4318';
const directory = resolve(process.env.SCREENSHOT_DIR || 'screenshots/ui-display');
const cases = [
  { name: '1080p-100', width: 1920, height: 1080, scale: 1 },
  { name: '1080p-125', width: 1536, height: 864, scale: 1.25 },
  { name: '1080p-150', width: 1280, height: 720, scale: 1.5 },
  { name: '1080p-200', width: 960, height: 540, scale: 2 },
  { name: '1080p-150-toolbar', width: 1280, height: 620, scale: 1.5 },
  { name: 'mobile', width: 375, height: 812, scale: 1 },
];
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const checks = [];
await mkdir(directory, { recursive: true });
try {
  for (const screen of cases) {
    const context = await browser.newContext({ viewport: { width: screen.width, height: screen.height }, deviceScaleFactor: screen.scale });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    const writes = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method()) && path !== '/api/auth/login') writes.push(path);
    });
    const status = await context.request.get(base + '/api/auth/status');
    assert.equal(status.status(), 200);
    const demo = (await status.json()).demo === true;
    let password = 'linear-demo';
    if (!demo) {
      const credentials = parseEnv(await readFile(process.env.TENROUTER_TEST_LOGIN_ENV || resolve(process.env.USERPROFILE, '.codex/credentials/10router-web.env'), 'utf8'));
      password = credentials.TENROUTER_TEST_PASSWORD;
      assert(password, 'Real-gateway credentials are missing');
    }
    const login = await context.request.post(base + '/api/auth/login', { data: { password } });
    assert.equal(login.status(), 200, 'Login failed; do not retry automatically');
    await page.goto(base + '/dashboard/providers');
    await page.getByRole('heading', { name: '供应商', exact: true }).waitFor();
    for (const theme of ['light', 'dark']) {
      await page.getByLabel('主题模式').selectOption(theme);
      await page.keyboard.press('Control+k');
      const dialog = page.getByRole('dialog', { name: '快速跳转' });
      await dialog.waitFor();
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.evaluate(() => document.characterSet), 'UTF-8');
      assert(!(await dialog.innerText()).includes('�'), 'Search contains replacement characters');
      assert.equal(await page.getByLabel('搜索页面').getAttribute('placeholder'), '搜索页面…');
      assert.equal(await dialog.locator('.search-results a').count(), 17);
      assert.equal(await page.getByLabel('搜索页面').evaluate(element => element === document.activeElement), true);
      const bounds = await dialog.boundingBox();
      assert(bounds.y >= 16 && bounds.y + bounds.height <= screen.height - 16 + 1, screen.name + ': search dialog leaves the viewport');
      const results = dialog.locator('.search-results');
      const headerBefore = await dialog.locator('.dialog-top').boundingBox();
      await results.evaluate(element => { element.scrollTop = element.scrollHeight; });
      const lastResult = results.getByRole('link', { name: '协议调试', exact: true });
      const lastBounds = await lastResult.boundingBox();
      const resultBounds = await results.boundingBox();
      assert(lastBounds.y >= resultBounds.y - 1 && lastBounds.y + lastBounds.height <= resultBounds.y + resultBounds.height + 1, 'Last search result is not reachable');
      assert.deepEqual(await dialog.locator('.dialog-top').boundingBox(), headerBefore, 'Search header moves when results scroll');
      await page.screenshot({ path: resolve(directory, screen.name + '-' + theme + '-search.png'), animations: 'disabled' });
      await page.getByLabel('搜索页面').fill('模型');
      assert.deepEqual(await results.getByRole('link').allTextContents(), ['模型', '组合模型', '模型检测', '模型价格']);
      await page.getByLabel('搜索页面').fill('不存在的页面');
      await dialog.getByText('没有匹配的页面', { exact: true }).waitFor();
      await page.getByLabel('搜索页面').fill('供应商');
      await dialog.getByRole('link', { name: '供应商', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      await page.keyboard.press('Control+k');
      await dialog.waitFor();
      await page.waitForFunction(() => document.querySelector('.search-input input')?.value === '');
      assert.equal(await page.getByLabel('搜索页面').inputValue(), '');
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      for (const path of ['providers', 'models', 'logs', 'pricing']) {
        await page.goto(base + '/dashboard/' + path);
        await page.locator('#main h1').waitFor();
        await page.evaluate(() => document.fonts.ready);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), screen.name + ': page overflow at ' + path);
        assert(!(await page.locator('#main').innerText()).includes('�'), 'Replacement characters at ' + path);
        for (const input of await page.locator('.filter-search input').all()) {
          await input.fill('中文搜索测试');
          assert.equal(await input.inputValue(), '中文搜索测试');
          const inputBounds = await input.boundingBox();
          const iconBounds = await input.locator('..').locator('.icon').first().boundingBox();
          assert(inputBounds.width > 80 && inputBounds.x >= iconBounds.x + iconBounds.width, 'Search text overlaps its icon');
          await input.fill('');
        }
        if (path === 'logs') {
          await page.getByRole('button', { name: /查看请求/ }).first().click();
          const detail = page.getByRole('dialog', { name: '请求详情' });
          await detail.waitFor();
          const detailBounds = await detail.boundingBox();
          assert(detailBounds.x >= 0 && detailBounds.y >= 0 && detailBounds.x + detailBounds.width <= screen.width + 1 && detailBounds.y + detailBounds.height <= screen.height + 1, 'Request detail leaves the viewport');
          assert(!(await detail.innerText()).includes('�'), 'Replacement characters in request detail');
          await page.getByRole('button', { name: '关闭窗口' }).click();
          await detail.waitFor({ state: 'hidden' });
        }
        if (screen.name === '1080p-150') await page.screenshot({ path: resolve(directory, screen.name + '-' + theme + '-' + path + '.png'), animations: 'disabled' });
      }
      checks.push({ screen: screen.name, scale: screen.scale, viewport: { width: screen.width, height: screen.height }, theme, data: demo ? 'demo' : 'real', passed: true });
      console.log('PASS: ' + screen.name + ' ' + theme + ': search bounds, scroll, Chinese input, keyboard and four pages.');
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(writes, [], 'UI audit must not mutate gateway data');
    await context.close();
  }
  await writeFile(resolve(directory, 'acceptance.json'), JSON.stringify({ checks, passed: true }, null, 2));
} finally { await browser.close(); }

import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { chromium } from 'playwright';
import { selectTheme } from './theme-control.mjs';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4400';
const output = resolve('screenshots/provider-model-cards');
const report = { base, http: [], layouts: [], errors: [], failedResources: [], writes: [], checks: [] };
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const get = async path => {
    const response = await context.request.get(base + path);
    report.http.push({ path, status: response.status() });
    assert.equal(response.status(), 200, path);
    return response.json();
  };
  assert.equal((await get('/api/health')).driver, 'better-sqlite3');
  assert.notEqual((await get('/api/auth/status')).demo, true);
  const credentials = parseEnv(await readFile(process.env.TENROUTER_TEST_LOGIN_ENV || resolve(process.env.USERPROFILE, '.codex/credentials/10router-web.env'), 'utf8'));
  const login = await context.request.post(base + '/api/auth/login', { data: { password: credentials.TENROUTER_TEST_PASSWORD } });
  report.http.push({ path: '/api/auth/login', status: login.status() });
  assert.equal(login.status(), 200);
  for (const path of ['/api/models', '/api/models/custom', '/api/models/caps', '/api/models/disabled', '/api/providers', '/api/provider-nodes']) await get(path);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) report.errors.push(message.text());
  });
  page.on('response', response => {
    if (response.status() >= 400) report.failedResources.push({ path: new URL(response.url()).pathname, status: response.status() });
  });
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) report.writes.push({ path: new URL(request.url()).pathname, method: request.method() });
  });
  const panel = page.locator('.provider-model-catalog');
  const cards = panel.locator('.provider-model-card');
  const search = page.getByLabel('搜索模型', { exact: true });
  assert.equal((await page.goto(base + '/dashboard/providers/antigravity')).status(), 200);
  await page.waitForFunction(() => document.querySelector('.provider-model-card') && [...document.querySelectorAll('button')].some(button => button.textContent.trim() === '刷新模型' && !button.disabled));
  assert.equal(await cards.count(), 20);
  assert.equal(await panel.locator('table, select').count(), 0);
  assert.match(await cards.first().locator('.provider-model-card-context').innerText(), /上下文[\s\S]+(?:Token|未提供)/);
  assert.equal(await cards.first().locator('.provider-model-card-status > span').count(), 2);
  const firstId = await cards.first().locator('.model-name code').innerText();
  for (const label of ['复制模型', '测试模型', '编辑模型', '停用模型']) assert.equal(await cards.first().getByRole('button', { name: `${label} ${firstId}`, exact: true }).count(), 1);
  await cards.first().getByRole('button', { name: `复制模型 ${firstId}`, exact: true }).click();
  // http 内网入口是非安全上下文：clipboard API 不存在时，按钮应降级为选中文本并给出提示，而不是谎报“已复制”。
  const clipboard = await page.evaluate(() => ({ available: !!navigator.clipboard?.readText, secure: isSecureContext }));
  if (clipboard.available) assert.equal(await page.evaluate(() => navigator.clipboard.readText()), firstId);
  else {
    // 降级后按钮的可访问名称变为「已选中文本」，按提示文案等待即可。
    await page.locator('.copy-control .copy-hint').first().waitFor();
    const hint = await page.locator('.copy-control .copy-hint').first().innerText();
    assert.equal(hint, '已选中，请按 Ctrl+C');
    assert.equal(await page.locator('.copy-control .error-message').count(), 0);
  }
  await cards.first().getByRole('button', { name: `编辑模型 ${firstId}`, exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  report.checks.push('真实模型显示完整名称与路由，操作齐全，复制正确，编辑弹窗正常');
  for (const width of [1440, 1024, 768, 700, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark']) {
      await selectTheme(page, theme);
      await page.evaluate(() => document.fonts.ready);
      const layout = await panel.evaluate(element => {
        const grid = element.querySelector('.provider-model-grid');
        const cards = [...grid.children];
        const first = cards[0].getBoundingClientRect();
        const second = cards[1].getBoundingClientRect();
        return {
          columns: first.top === second.top ? 2 : 1,
          heights: [...new Set(cards.map(card => Math.round(card.getBoundingClientRect().height)))],
          pageOverflow: document.documentElement.scrollWidth > innerWidth,
          cardOverflow: cards.some(card => card.scrollWidth > card.clientWidth),
          clippedId: cards.some(card => {
            const code = card.querySelector('.model-name code');
            return code.scrollWidth > code.clientWidth || getComputedStyle(code).textOverflow === 'ellipsis';
          }),
          clippedActions: cards.some(card => [...card.querySelectorAll('.row-actions button')].some(button => {
            const bounds = button.getBoundingClientRect();
            const container = card.getBoundingClientRect();
            return bounds.left < container.left || bounds.right > container.right;
          })),
        };
      });
      assert.equal(layout.columns, width > 700 ? 2 : 1);
      for (const key of ['pageOverflow', 'cardOverflow', 'clippedId', 'clippedActions']) assert.equal(layout[key], false, `${width}/${theme}: ${key}`);
      report.layouts.push({ width, theme, ...layout });
      if ([1440, 390].includes(width)) {
        await panel.scrollIntoViewIfNeeded();
        await panel.screenshot({ path: resolve(output, `${width}-${theme}.png`) });
      }
    }
  }
  report.checks.push('六种屏宽与深浅主题：桌面双列、手机单列，无横向溢出、路由截断或操作裁切');
  await panel.getByRole('button', { name: '下一页模型', exact: true }).click();
  await page.waitForFunction(firstId => document.querySelector('.provider-model-card .model-name code')?.textContent !== firstId, firstId);
  assert(await cards.count() > 0 && await cards.count() < 20);
  await search.fill(firstId);
  await page.waitForFunction(firstId => document.querySelector('.provider-model-card .model-name code')?.textContent === firstId, firstId);
  assert.equal(await cards.count(), 1);
  assert.equal(await panel.getByRole('button', { name: '上一页模型', exact: true }).isDisabled(), true);
  await search.fill('__no_matching_provider_model__');
  await panel.getByText('没有匹配的模型', { exact: true }).waitFor();
  assert.equal(await cards.count(), 0);
  report.checks.push('分页、搜索重置页码、空结果正常');
  await page.setViewportSize({ width: 1440, height: 1000 });
  assert.equal((await page.goto(base + '/dashboard/models')).status(), 200);
  await page.getByRole('table', { name: '已登记的模型目录，不代表上游实时可用性' }).waitFor();
  assert.equal(await page.getByLabel('模型供应商', { exact: true }).count(), 1);
  assert.equal(await page.locator('.provider-model-card').count(), 0);
  report.checks.push('全部模型页保留表格和供应商筛选');
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.writes, []);
  console.log(JSON.stringify(report, null, 2));
  console.log('PASS ' + report.checks.join('；'));
} finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}

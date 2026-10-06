import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';
import { modelCatalog } from '../src/api/data.js';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'C:/Users/20449/AppData/Local/Temp/hermes-e2e/.venv/Lib/site-packages/playwright/driver/package');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4317';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
page.setDefaultTimeout(30000);
page.setDefaultNavigationTimeout(30000);
const errors = [];
const writes = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text()); });
page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) writes.push(request.method()); });
const read = async path => { const response = await context.request.get(base + path); assert.equal(response.status(), 200, path); return response.json(); };
const rows = page.locator('.distribution-table tbody tr[data-model-id]');
const mode = page.getByRole('group', { name: '分发模式' });
const search = page.getByLabel('搜索分发模型');
const save = page.getByRole('button', { name: '保存分发设置' });
const discard = page.getByRole('button', { name: '撤销更改' });
const screenshotDir = process.env.SCREENSHOT_DIR || 'C:/Users/20449/.codex/tmp/distribution-real';
try {
  assert(!(await read('/api/auth/status')).demo, 'Real backend required');
  const loginFile = process.env.TENROUTER_TEST_LOGIN_ENV || resolve(process.env.USERPROFILE || process.env.HOME, '.codex/credentials/10router-web.env');
  const env = parseEnv(await readFile(loginFile, 'utf8'));
  const login = await context.request.post(base + '/api/auth/login', { data: { password: env.TENROUTER_TEST_PASSWORD || env.INITIAL_PASSWORD } });
  assert.equal(login.status(), 200, 'Real gateway login failed; no retry attempted');
  const [initial, built, custom, providers, nodes, disabled, combos] = await Promise.all(['/api/models/distribution', '/api/models', '/api/models/custom', '/api/providers', '/api/provider-nodes', '/api/models/disabled', '/api/combos'].map(read));
  const models = modelCatalog(built.models, custom.models, providers.connections, nodes.nodes, disabled.disabled).filter(model => model.enabled && model.connected);
  const selectedRows = page.locator('[data-selected-model-id]');
  assert(models.length && combos.combos.length, 'Acceptance requires connected real models and combos');
  assert.equal(initial.mode, 'all', 'This acceptance edits drafts from the current real all-published config');
  const distributionResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/models/distribution');
  await page.goto(base + '/dashboard/distribution', { waitUntil: 'domcontentloaded' });
  const loaded = await (await distributionResponse).json();
  const modelIds = loaded.catalog?.map(model => model.id) || [...models.map(model => model.id), ...combos.combos.map(combo => combo.name)];
  const total = modelIds.length;
  await page.waitForFunction(total => document.querySelector('.distribution-savebar strong')?.textContent === `当前发布 ${total} 个模型`, total);
  assert.equal(await rows.count(), Math.min(20, total));
  assert.deepEqual(await rows.evaluateAll(elements => elements.map(element => element.dataset.modelId)), modelIds.slice(0, 20));
  assert.equal(await selectedRows.count(), total);
  assert.equal(await rows.locator('.distribution-state.published').count(), Math.min(20, total));
  assert.equal(await save.isEnabled(), false);
  await page.waitForFunction(() => {
    const images = [...document.querySelectorAll('.provider-mark img')];
    return images.length > 0 && images.every(image => image.complete && image.naturalWidth > 0);
  });
  await mkdir(screenshotDir, { recursive: true });
  for (const width of [1440, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark']) {
      await page.getByLabel('主题模式').selectOption(theme);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Page overflow ${width}`);
      assert.equal(await page.locator('.distribution-table').evaluate(element => element.scrollWidth <= element.clientWidth), true, `Table overflow ${width}`);
      await page.screenshot({ path: resolve(screenshotDir, `distribution-${width}-${theme}.png`), fullPage: true, animations: 'disabled' });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: '下一页模型' }).click();
  assert.equal(await rows.first().getAttribute('data-model-id'), modelIds[20]);
  await search.fill(models[0].id);
  await page.waitForFunction(id => document.querySelectorAll('.distribution-table tbody tr[data-model-id]').length === 1 && document.querySelector('.distribution-table tbody tr[data-model-id]')?.dataset.modelId === id, models[0].id);
  await search.fill('');
  await page.getByRole('button', { name: `移除发布模型 ${models[0].id}`, exact: true }).click();
  await page.getByText(`保存后发布 ${total - 1} 个模型`, { exact: true }).waitFor();
  assert.equal(await mode.getByRole('button', { name: '指定模型' }).getAttribute('aria-pressed'), 'true');
  assert.equal(await selectedRows.count(), total - 1);
  await discard.click();
  assert.equal(await save.isEnabled(), false);
  await mode.getByRole('button', { name: '指定模型' }).click();
  await page.getByText(`保存后发布 ${total} 个模型`, { exact: true }).waitFor();
  assert.equal(await selectedRows.count(), total, 'Switching to a whitelist must retain the current publication list');
  await page.getByRole('button', { name: '清空清单', exact: true }).click();
  await page.getByText('未选择任何模型，保存后将禁止全部下游模型调用。', { exact: true }).waitFor();
  await page.getByRole('button', { name: `选择筛选结果（${total}）`, exact: true }).click();
  assert.equal(await selectedRows.count(), total);
  await page.getByRole('button', { name: '下一页模型' }).click();
  assert.equal(await rows.locator('input[type="checkbox"]:checked').count(), await rows.count(), 'Cross-page selection must include the second page');
  await search.fill(models[0].id);
  await page.getByRole('button', { name: '取消筛选结果（1）', exact: true }).click();
  assert.equal(await selectedRows.count(), total - 1, 'Filtered cancellation must preserve models outside the search');
  assert.equal(await selectedRows.filter({ has: page.locator(`code`, { hasText: models[0].id }) }).count(), 0);
  await search.fill('');
  await page.locator('.distribution-suppliers').getByRole('button', { name: /组合模型/ }).click();
  assert.equal(await rows.count(), combos.combos.length);
  const combo = combos.combos[0].name;
  const canReadClipboard = await page.evaluate(() => !!navigator.clipboard?.readText);
  if (!canReadClipboard) await page.evaluate(() => document.addEventListener('copy', () => {
    const text = document.activeElement;
    window.distributionCopiedId = text?.value?.slice(text.selectionStart, text.selectionEnd);
  }, { once: true }));
  await page.getByRole('button', { name: `复制下游模型 ID ${combo}`, exact: true }).click();
  assert.equal(await page.evaluate(canRead => canRead ? navigator.clipboard.readText() : window.distributionCopiedId, canReadClipboard), combo);
  await rows.filter({ has: page.locator('code', { hasText: combo }) }).getByRole('button', { name: '已复制', exact: true }).waitFor();
  await page.getByRole('button', { name: '清空清单', exact: true }).click();
  await page.getByLabel(`发布 ${combo}`, { exact: true }).check();
  assert.equal(await save.isEnabled(), true);
  await page.getByText('保存后发布 1 个模型', { exact: true }).waitFor();
  assert((await page.locator('.distribution-live').innerText()).includes('全部发布'));
  await page.getByLabel('选择本页模型').check();
  await page.getByText(`保存后发布 ${combos.combos.length} 个模型`, { exact: true }).waitFor();
  await page.getByLabel(`发布 ${combo}`, { exact: true }).uncheck();
  assert.equal(await page.getByLabel('选择本页模型').evaluate(input => input.indeterminate), true);
  await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === '/api/models/distribution'),
    page.getByRole('button', { name: '刷新', exact: true }).click(),
  ]);
  await page.waitForFunction(() => !document.querySelector('.distribution-segment button').disabled);
  assert.equal(await mode.getByRole('button', { name: '指定模型' }).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByLabel(`发布 ${combo}`, { exact: true }).isChecked(), false);
  assert.equal(await save.isEnabled(), true);
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.getByLabel('模型供应商').selectOption('');
  await page.getByRole('group', { name: '发布状态筛选' }).getByRole('button', { name: /^未发布/ }).click();
  assert.equal(await rows.locator('.distribution-state.pending').count(), await rows.count());
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: resolve(screenshotDir, 'distribution-draft-375.png'), fullPage: true, animations: 'disabled' });
  await discard.click();
  await page.getByRole('group', { name: '发布状态筛选' }).getByRole('button', { name: /^全部/ }).click();
  assert.equal(await mode.getByRole('button', { name: '全部发布' }).getAttribute('aria-pressed'), 'true');
  assert.equal(await save.isEnabled(), false);
  assert.equal(await rows.count(), Math.min(20, total));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.querySelector('.distribution-segment button')?.disabled);
  const final = await read('/api/models/distribution');
  assert.deepEqual({ mode: final.mode, models: final.models }, { mode: initial.mode, models: initial.models });
  assert.deepEqual(writes, [], 'Live acceptance must not change production distribution');
  assert.deepEqual(errors, []);
  const report = { base, models: models.length, combos: combos.combos.length, available: total, catalog: initial.catalog ? 'gateway' : 'registered-models', mode: initial.mode, writes, errors, checks: ['always-visible model list', 'real model IDs and publication counts', 'provider and combo grouping', 'pagination and search', 'copy ID', 'fixed selected list independent of search', 'switch to whitelist preserves published models', 'cross-page batch selection and filtered cancellation', 'clear list explicitly blocks all calls', 'draft selection and indeterminate batch checkbox', 'current versus pending scope', 'refresh retains draft', 'discard and reload', 'desktop/mobile light/dark layout'] };
  await writeFile(resolve(screenshotDir, 'acceptance.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (failure) { console.error('真实分发页面验收失败：', failure.message); throw failure; }
finally { await browser.close(); }

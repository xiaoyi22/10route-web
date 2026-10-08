import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4319';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
let page;
let original;
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  assert.equal((await (await page.request.get(base + '/api/auth/status')).json()).demo, true);
  await page.goto(base + '/dashboard/monitor');
  await page.getByLabel('登录密码').fill('linear-demo');
  await page.getByRole('button', { name: '进入管理端' }).click();
  await page.getByRole('heading', { name: '模型检测', exact: true }).waitFor();
  original = await (await page.request.get(base + '/api/iq-monitor')).json();
  let legacy = false;
  let knownLevels;
  let putCount = 0;
  page.on('request', request => { if (request.url().endsWith('/api/iq-monitor') && request.method() === 'PUT') putCount++; });
  await page.route('**/api/iq-monitor', async route => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    const data = await response.json();
    for (const provider of data.catalog) {
      delete provider.thinkingLevels;
      if (knownLevels !== undefined && provider.id === 'codex') provider.thinkingLevels = { gpt: knownLevels };
    }
    if (legacy) delete data.capabilities;
    await route.fulfill({ response, json: data });
  });
  const openConfig = async () => {
    await page.reload();
    await page.getByRole('tab', { name: '自动检测配置', exact: true }).click();
    await page.getByLabel('自动刷新检测结果').uncheck();
    await page.locator('.monitor-provider-config').filter({ has: page.locator('summary strong', { hasText: 'OpenAI Codex' }) }).locator('summary').click();
  };
  await openConfig();
  const thinking = page.getByLabel('OpenAI Codex gpt 智商检测思考强度', { exact: true });
  const generic = ['', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
  assert.deepEqual(await thinking.locator('option').evaluateAll(options => options.map(option => option.value)), generic);
  assert.equal(await thinking.isDisabled(), false);
  const hintId = await thinking.getAttribute('aria-describedby');
  assert((await page.locator('[id=' + JSON.stringify(hintId) + ']').innerText()).includes('模型是否支持尚未确认'));
  assert(await page.locator('[id=' + JSON.stringify(hintId) + ']').evaluate(hint => hint.scrollWidth <= hint.clientWidth), '思考强度提示应在单元格内完整换行');
  await thinking.selectOption('high');
  await page.getByRole('button', { name: '保存检测配置', exact: true }).click();
  await page.getByText(/^已保存，/).waitFor();
  await openConfig();
  assert.equal(await thinking.inputValue(), 'high');
  const automatic = (await (await page.request.get(base + '/api/iq-monitor')).json()).config;
  await page.getByRole('tab', { name: '模型状态', exact: true }).click();
  await page.getByRole('button', { name: '智商检测', exact: true }).click();
  await page.getByRole('button', { name: '单次智商检测 gpt', exact: true }).click();
  const manual = page.getByRole('dialog').getByLabel('单次智商检测思考强度', { exact: true });
  assert.equal(await manual.inputValue(), 'high');
  await manual.selectOption('low');
  let modelRequest;
  await page.route('**/api/models/test', route => {
    modelRequest = route.request().postDataJSON();
    return route.fulfill({ json: { ok: true, status: 200, iq: { correct: true }, latencyMs: 10 } });
  });
  await page.getByRole('button', { name: '开始检测', exact: true }).click();
  await page.getByRole('dialog').getByText('100%', { exact: true }).waitFor();
  assert.deepEqual(modelRequest, { model: 'codex/gpt(low)', kind: 'llm', probe: 'iq' });
  await page.getByRole('button', { name: '关闭窗口' }).click();
  assert.deepEqual((await (await page.request.get(base + '/api/iq-monitor')).json()).config, automatic);
  knownLevels = [];
  await openConfig();
  assert.deepEqual(await thinking.locator('option').evaluateAll(options => options.map(option => option.value)), ['', 'high']);
  assert.equal(await thinking.locator('option[value=high]').isDisabled(), true);
  await thinking.selectOption('');
  assert.equal(await thinking.isDisabled(), true);
  knownLevels = ['low', 'high'];
  await openConfig();
  assert.deepEqual(await thinking.locator('option').evaluateAll(options => options.map(option => option.value)), ['', 'low', 'high']);
  knownLevels = undefined;
  legacy = true;
  await openConfig();
  await thinking.selectOption('medium');
  const before = putCount;
  await page.getByRole('button', { name: '保存检测配置', exact: true }).click();
  await page.getByText(/当前后端尚不支持保存思考强度/).waitFor();
  assert.equal(putCount, before);
  assert.equal(await thinking.inputValue(), 'medium');
  assert.equal(await page.getByText(/^已保存，/).count(), 0);
  legacy = false;
  await openConfig();
  await thinking.selectOption('medium');
  await page.route('**/api/iq-monitor', async route => {
    if (route.request().method() !== 'PUT') return route.fallback();
    const config = route.request().postDataJSON();
    for (const provider of config.providers) delete provider.modelThinking;
    return route.fulfill({ json: { config } });
  });
  await page.getByRole('button', { name: '保存检测配置', exact: true }).click();
  await page.getByText(/思考强度未完整保存/).waitFor();
  assert.equal(await thinking.inputValue(), 'medium');
  assert.equal(await page.getByText(/^已保存，/).count(), 0);
  for (const width of [1440, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), String(width));
  }
  assert.deepEqual(errors, []);
  console.log('PASS: generic fallback, warning accessibility, persisted strengths, single-request override, known restrictions, legacy preflight, dropped-save detection, and four responsive widths.');
} catch (error) {
  console.error('Thinking browser state:', await page?.locator('body').innerText());
  throw error;
} finally {
  if (original && page) assert.equal((await page.request.put(base + '/api/iq-monitor', { data: original.config })).status(), 200);
  await browser.close();
}

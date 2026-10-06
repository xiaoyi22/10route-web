import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark', permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
page.setDefaultNavigationTimeout(120000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const url = process.env.PREVIEW_URL || 'http://127.0.0.1:4317';
const screenshotDir = process.env.SCREENSHOT_DIR || 'screenshots';
const section = process.argv.find(argument => argument.startsWith('--section='))?.split('=')[1] || 'all';
assert(['all', 'keys', 'providers', 'models', 'logs', 'layout'].includes(section));
const includes = name => section === 'all' || section === name;
await mkdir(screenshotDir, { recursive: true });
try {
  const initialAuth = await context.request.get(`${url}/api/auth/status`);
  assert.equal(initialAuth.status(), 200);
  assert.equal((await initialAuth.json()).demo, true, 'Management acceptance requires the isolated demo backend before login');
  await page.goto(`${url}/dashboard/endpoint`);
  await page.getByLabel('登录密码').fill('linear-demo');
  await page.getByRole('button', { name: '进入管理端' }).click();
  await page.getByRole('heading', { name: 'API 密钥', exact: false }).waitFor();
  const auth = await (await context.request.get(`${url}/api/auth/status`)).json();
  assert.equal(auth.demo, true, 'Management acceptance must run against the isolated demo');
  if (includes('keys')) {
  const oldKeys = await (await context.request.get(`${url}/api/keys`)).json();
  for (const key of oldKeys.keys.filter(key => key.name === '浏览器验收密钥')) await context.request.delete(`${url}/api/keys/${key.id}`);
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await page.getByRole('button', { name: '创建密钥', exact: true }).click();
  await page.getByLabel('密钥名称').fill('浏览器验收密钥');
  await page.getByRole('dialog').getByRole('button', { name: '创建密钥', exact: true }).click();
  await page.getByRole('heading', { name: '密钥已创建' }).waitFor();
  const newKey = await page.locator('.created-key code').innerText();
  assert(newKey.startsWith('demo_sk_'));
  await page.getByRole('button', { name: '复制新密钥', exact: true }).click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), newKey);
  await page.getByRole('button', { name: '完成', exact: true }).click();
  const keyRow = page.getByRole('row').filter({ has: page.getByRole('cell', { name: '浏览器验收密钥', exact: true }) });
  await keyRow.waitFor();
  assert(!(await keyRow.innerText()).includes(newKey));
  await page.getByRole('button', { name: '显示密钥 浏览器验收密钥', exact: true }).click();
  assert((await keyRow.innerText()).includes(newKey));
  await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/api/keys') && response.request().method() === 'GET'),
    page.getByRole('switch', { name: '启用密钥 浏览器验收密钥', exact: true }).click(),
  ]);
  await page.reload();
  await page.getByRole('switch', { name: '启用密钥 浏览器验收密钥', exact: true }).waitFor();
  assert.equal(await page.getByRole('switch', { name: '启用密钥 浏览器验收密钥', exact: true }).isChecked(), false);
  await page.getByRole('button', { name: '删除密钥 浏览器验收密钥', exact: true }).click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await keyRow.waitFor();
  await page.getByRole('button', { name: '删除密钥 浏览器验收密钥', exact: true }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await keyRow.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Anthropic', exact: true }).click();
  assert((await page.locator('.config-code').innerText()).includes('ANTHROPIC_AUTH_TOKEN'));
  await page.waitForTimeout(200);
  await page.screenshot({ path: resolve(screenshotDir, 'endpoint.png'), fullPage: true });
  }

  if (includes('providers')) {
  await page.goto(`${url}/dashboard/providers`);
  const oldProviders = await (await context.request.get(`${url}/api/providers`)).json();
  for (const connection of oldProviders.connections.filter(connection => ['浏览器验收连接', '浏览器验收连接已编辑'].includes(connection.name))) await context.request.delete(`${url}/api/providers/${connection.id}`);
  await page.getByRole('button', { name: '刷新连接', exact: true }).click();
  await page.getByRole('button', { name: '新增连接', exact: true }).click();
  await page.getByLabel('连接名称', { exact: true }).fill('浏览器验收连接');
  await page.getByLabel('上游 API Key', { exact: true }).fill('demo-only-key');
  await page.getByLabel('优先级', { exact: true }).fill('3');
  await page.getByRole('button', { name: '保存连接', exact: true }).click();
  await page.locator('.connection-name strong').getByText('浏览器验收连接', { exact: true }).waitFor();
  await page.getByRole('button', { name: '编辑 浏览器验收连接', exact: true }).click();
  await page.getByLabel('连接名称', { exact: true }).fill('浏览器验收连接已编辑');
  await page.getByRole('button', { name: '保存连接', exact: true }).click();
  await page.locator('.connection-name strong').getByText('浏览器验收连接已编辑', { exact: true }).waitFor();
  await page.getByRole('button', { name: '测试 浏览器验收连接已编辑', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '测试通过' }).waitFor();
  await page.getByRole('switch', { name: '启用 浏览器验收连接已编辑', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '已停用' }).waitFor();
  await page.getByRole('switch', { name: '启用 浏览器验收连接已编辑', exact: true, checked: false }).waitFor();
  assert.equal(await page.getByRole('button', { name: '测试 浏览器验收连接已编辑', exact: true }).isDisabled(), true);
  await page.getByRole('switch', { name: '启用 浏览器验收连接已编辑', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '已启用' }).waitFor();
  await page.getByRole('switch', { name: '启用 浏览器验收连接已编辑', exact: true, checked: true }).waitFor();
  await page.goto(`${url}/dashboard/providers/openrouter`);
  await page.getByRole('button', { name: '测试 OpenRouter · 备用', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '演示认证异常' }).waitFor();
  await page.goto(`${url}/dashboard/providers/openai`);
  await page.getByRole('button', { name: '代理 浏览器验收连接已编辑', exact: true }).click();
  await page.getByLabel('代理方式', { exact: true }).selectOption('pool');
  await page.getByLabel('代理池', { exact: true }).selectOption('demo-best');
  await page.getByRole('button', { name: '保存代理配置', exact: true }).click();
  await page.getByRole('cell').filter({ hasText: 'mihomo-优选' }).waitFor();
  let saved = (await (await context.request.get(`${url}/api/providers`)).json()).connections.find(item => item.name === '浏览器验收连接已编辑');
  assert.equal(saved.priority, 3);
  assert.equal(saved.providerSpecificData.proxyPoolId, 'demo-best');
  await page.getByRole('button', { name: '查看连接 浏览器验收连接已编辑', exact: true }).click();
  assert((await page.getByRole('dialog').innerText()).includes('http://127.0.0.1:7892'));
  assert((await page.getByRole('dialog').innerText()).includes('强制代理'));
  await page.screenshot({ path: resolve(screenshotDir, 'provider-connection-detail.png'), fullPage: true });
  await page.setViewportSize({ width: 375, height: 900 });
  assert(await page.getByRole('dialog').evaluate(element => element.getBoundingClientRect().right <= window.innerWidth));
  await page.screenshot({ path: resolve(screenshotDir, 'mobile-provider-detail.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: '关闭窗口' }).click();
  await page.getByRole('button', { name: '代理 浏览器验收连接已编辑', exact: true }).click();
  await page.getByLabel('代理方式', { exact: true }).selectOption('global');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  saved = (await (await context.request.get(`${url}/api/providers`)).json()).connections.find(item => item.id === saved.id);
  assert.equal(saved.providerSpecificData.proxyPoolId, 'demo-best');
  await page.route(`**/api/providers/${saved.id}`, route => route.request().method() === 'PUT' ? route.fulfill({ status: 503, json: { error: '演示代理保存失败' } }) : route.continue());
  await page.getByRole('button', { name: '代理 浏览器验收连接已编辑', exact: true }).click();
  await page.getByLabel('代理方式', { exact: true }).selectOption('global');
  await page.getByRole('button', { name: '保存代理配置', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '演示代理保存失败' }).waitFor();
  assert.equal(await page.getByRole('dialog').count(), 1);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.unroute(`**/api/providers/${saved.id}`);
  await page.getByRole('button', { name: '代理 浏览器验收连接已编辑', exact: true }).click();
  await page.getByLabel('代理方式', { exact: true }).selectOption('connection');
  await page.getByLabel('代理地址', { exact: true }).fill('http://demo:secret@127.0.0.1:9999');
  await page.getByLabel('绕过代理', { exact: true }).fill('.example.invalid');
  await page.getByRole('button', { name: '保存代理配置', exact: true }).click();
  await page.getByRole('cell').filter({ hasText: '连接专用代理' }).waitFor();
  assert(!(await page.getByRole('table', { name: '供应商账号连接列表' }).locator('tbody').innerText()).includes('secret'));
  await page.getByRole('button', { name: '代理 浏览器验收连接已编辑', exact: true }).click();
  await page.getByLabel('代理方式', { exact: true }).selectOption('global');
  await page.getByRole('button', { name: '保存代理配置', exact: true }).click();
  await page.getByRole('cell').filter({ hasText: '全局代理规则' }).waitFor();
  saved = (await (await context.request.get(`${url}/api/providers`)).json()).connections.find(item => item.id === saved.id);
  assert.equal(saved.providerSpecificData.connectionProxyEnabled, false);
  assert.equal(saved.providerSpecificData.proxyPoolId, null);
  await page.getByRole('button', { name: '删除 浏览器验收连接已编辑', exact: true }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.locator('.connection-name strong').getByText('浏览器验收连接已编辑', { exact: true }).waitFor({ state: 'detached' });
  await page.goto(`${url}/dashboard/providers`);
  await page.locator('.provider-link').first().waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.provider-mark img')].every(image => image.complete && image.naturalWidth > 0));
  await page.screenshot({ path: resolve(screenshotDir, 'providers.png'), fullPage: true });
  }

  if (includes('models')) {
  await page.goto(`${url}/dashboard/models`);
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 3);
  assert.equal(await page.locator('tbody .provider-link').count(), 3);
  assert.equal(await page.locator('tbody .provider-link strong').filter({ hasText: 'OpenAI Codex' }).count(), 1);
  assert.equal(await page.locator('tbody .provider-link strong').filter({ hasText: 'Claude Code' }).count(), 1);
  await page.waitForFunction(() => [...document.querySelectorAll('.provider-mark img')].every(image => image.complete && image.naturalWidth > 0));
  assert.equal(await page.locator('.provider-mark img').count(), 3);
  assert.equal(await page.getByText('未接入模型', { exact: true }).count(), 0);
  assert.equal(await page.getByText('演示自定义模型', { exact: true }).count(), 0);
  await page.getByRole('button', { name: '全部目录', exact: true }).click();
  await page.getByText('演示自定义模型', { exact: true }).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 5);
  await page.getByLabel('搜索模型').fill('claude');
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1);
  await page.getByRole('button', { name: '复制模型 cc/claude-sonnet', exact: true }).click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'cc/claude-sonnet');
  await page.getByLabel('搜索模型').fill('');
  await page.getByLabel('模型供应商').selectOption('openai-compatible-chat-demo');
  await page.getByText('演示自定义模型', { exact: true }).waitFor();
  await page.getByLabel('模型供应商').selectOption('');
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 5);
  await page.getByRole('button', { name: '已接入供应商', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 3);
  await page.screenshot({ path: resolve(screenshotDir, 'models.png'), fullPage: true });
  }

  if (includes('logs')) {
  await page.goto(`${url}/dashboard/logs`);
  await page.getByRole('button', { name: '下一页日志' }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 20);
  await Promise.all([
    page.waitForResponse(response => response.url().includes('page=2') && response.status() === 200),
    page.getByRole('button', { name: '下一页日志' }).click(),
  ]);
  await page.getByRole('button', { name: '上一页日志' }).waitFor();
  assert.equal(await page.getByRole('button', { name: '上一页日志' }).isDisabled(), false);
  await page.getByLabel('状态', { exact: true }).selectOption('error');
  await page.getByRole('button', { name: '筛选', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 9);
  assert.equal(await page.getByRole('button', { name: '上一页日志' }).isDisabled(), true);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出当前页', exact: true }).click();
  const download = await downloadPromise;
  const csv = await readFile(await download.path(), 'utf8');
  assert(csv.includes('时间'));
  assert.equal(csv.split('\r\n').length, 10);
  await page.getByRole('button', { name: '查看请求 claude-sonnet', exact: true }).first().click();
  await page.getByRole('heading', { name: '请求详情', exact: true }).waitFor();
  assert((await page.getByRole('dialog').innerText()).includes('首 Token 延迟'));
  assert((await page.getByRole('dialog').innerText()).includes('缓存写入 Token'));
  assert((await page.getByRole('dialog').innerText()).includes('Claude · 工作连接'));
  await page.getByRole('button', { name: '元数据', exact: true }).click();
  assert((await page.locator('.request-metadata').innerText()).includes('cache_creation_input_tokens'));
  assert(!(await page.locator('.request-metadata').innerText()).includes('"request"'));
  await page.screenshot({ path: resolve(screenshotDir, 'log-detail.png'), fullPage: true });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.waitForTimeout(200);
  assert(await page.getByRole('dialog').evaluate(element => element.getBoundingClientRect().right <= window.innerWidth));
  await page.screenshot({ path: resolve(screenshotDir, 'mobile-log-detail.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: '关闭窗口' }).click();
  await page.getByRole('button', { name: '清除日志筛选', exact: true }).click();
  await page.getByLabel('日志连接').selectOption('demo-codex');
  await page.getByRole('button', { name: '筛选', exact: true }).click();
  await page.getByLabel('每页日志条数').selectOption('50');
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 22);
  assert((await page.locator('tbody').innerText()).includes('Codex · 开发连接'));
  assert(!(await page.locator('tbody').innerText()).includes('Claude · 工作连接'));
  await page.screenshot({ path: resolve(screenshotDir, 'logs.png'), fullPage: true });
  await page.locator('.provider-link').filter({ hasText: 'Codex · 开发连接' }).first().click();
  await page.getByRole('heading', { name: 'OpenAI Codex', exact: true }).waitFor();
  assert(page.url().endsWith('/dashboard/providers/codex'));
  }

  if (includes('layout')) {
  for (const path of ['endpoint', 'providers', 'models', 'logs']) {
    await page.goto(`${url}/dashboard/${path}`);
    await page.locator('.page-heading').waitFor();
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(100);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${path} overflow at ${width}`);
    }
  }
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(`${url}/dashboard/endpoint`);
  await page.getByRole('button', { name: '创建密钥', exact: true }).click();
  await page.screenshot({ path: resolve(screenshotDir, 'mobile-key-dialog.png'), fullPage: true });
  assert(await page.getByRole('dialog').evaluate(element => element.getBoundingClientRect().right <= window.innerWidth));
  assert(await page.getByRole('dialog').evaluate(element => Math.abs(element.getBoundingClientRect().left - (window.innerWidth - element.getBoundingClientRect().right)) < 2));
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 1000 });
  let requestTotal = 100;
  let requestCount = 0;
  await page.route('**/api/usage/stats?**', route => {
    requestCount += 1;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ totalRequests: requestTotal, totalPromptTokens: 1000, totalCompletionTokens: 200, totalCachedTokens: 0, totalCost: 0, byModel: {}, recentRequests: [] }) });
  });
  await page.goto(`${url}/dashboard/overview`);
  await page.getByTestId('request-value').filter({ hasText: '100' }).waitFor();
  assert.equal(await page.getByTestId('cache-rate').innerText(), '0.0%');
  await page.getByRole('button', { name: '7 天', exact: true }).click();
  await page.getByTestId('request-value').filter({ hasText: '100' }).waitFor();
  requestTotal = 200;
  await page.getByTestId('request-value').filter({ hasText: '200' }).waitFor({ timeout: 8000 });
  assert(await page.getByRole('button', { name: '7 天', exact: true }).getAttribute('aria-pressed') === 'true');
  await page.getByLabel('自动更新用量').uncheck();
  const pausedCount = requestCount;
  await page.waitForTimeout(1800);
  assert.equal(requestCount, pausedCount);
  await page.goto(`${url}/dashboard/endpoint`);
  await page.getByRole('heading', { name: '端点与接入', exact: true }).waitFor();
  await page.route('**/api/keys', route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Unauthorized' }) }));
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await page.getByRole('heading', { name: '连接你的工作空间', exact: true }).waitFor();
  }
  assert.deepEqual(errors, []);
  console.log(`PASS: ${section} core acceptance, no JS errors.`);
} catch (error) {
  console.error((await page.locator('body').innerText()).slice(0, 5000));
  await page.screenshot({ path: resolve(screenshotDir, `failure-${section}.png`), fullPage: true });
  throw error;
} finally { await browser.close(); }

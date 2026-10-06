import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';
import { normalizeProviders } from '../src/api/client.js';
import { groupProviders } from '../src/api/providers.js';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'C:/Users/20449/AppData/Local/Temp/hermes-e2e/.venv/Lib/site-packages/playwright/driver/package');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4317';
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true, args: ['--no-proxy-server'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(60000);
page.setDefaultNavigationTimeout(30000);
const errors = [];
const writes = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text()); });
page.on('request', request => {
  const path = new URL(request.url()).pathname;
  if (path.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) writes.push({ method: request.method(), path });
});
const report = { base, mode: 'real-backend', providers: [], writes, errors };
let stage = 'login';
try {
  const health = await context.request.get(base + '/api/health');
  assert.equal(health.status(), 200);
  report.driver = (await health.json()).driver;
  assert.equal(report.driver, 'better-sqlite3');
  const status = await context.request.get(base + '/api/auth/status');
  assert.equal(status.status(), 200);
  assert(!(await status.json()).demo, 'Real backend required');
  if (process.env.TENROUTER_TEST_COOKIE_FILE) {
    const cookie = (await readFile(process.env.TENROUTER_TEST_COOKIE_FILE, 'utf8')).trim();
    assert(cookie.startsWith('auth_token='));
    await context.addCookies([{ name: 'auth_token', value: cookie.slice('auth_token='.length), url: base, httpOnly: true, sameSite: 'Lax' }]);
  } else {
    const loginFile = process.env.TENROUTER_TEST_LOGIN_ENV || resolve(process.env.USERPROFILE || process.env.HOME, '.codex/credentials/10router-web.env');
    const env = parseEnv(await readFile(loginFile, 'utf8'));
    const password = env.TENROUTER_TEST_PASSWORD || env.INITIAL_PASSWORD;
    assert(password, 'Configured login credential is missing');
    const login = await context.request.post(base + '/api/auth/login', { data: { password: password.trim() } });
    assert.equal(login.status(), 200, `Login failed (HTTP ${login.status()}); no retry attempted`);
  }
  assert.equal((await (await context.request.get(base + '/api/auth/status')).json()).authenticated, true);
  console.log('已登录真实网关');
  const read = async path => {
    const response = await context.request.get(base + path);
    assert.equal(response.status(), 200, path);
    return response.json();
  };
  const [data, nodes, initial] = await Promise.all([read('/api/providers'), read('/api/provider-nodes'), read('/api/settings')]);
  const groups = groupProviders(normalizeProviders(data), nodes.nodes);
  const oauth = groups.filter(group => group.connections.some(connection => connection.authType === 'oauth'));
  assert(oauth.length, 'No real OAuth providers returned');
  report.connections = data.connections.length;
  report.oauthConnections = data.connections.filter(connection => connection.authType === 'oauth').length;
  report.oauthProviders = oauth.length;
  console.log(`已读取 ${report.connections} 个真实连接，${oauth.length} 个 OAuth 供应商`);
  const screenshotDir = process.env.SCREENSHOT_DIR || 'C:/Users/20449/.codex/tmp/provider-routing-real';
  await mkdir(screenshotDir, { recursive: true });
  for (const provider of oauth) {
    stage = provider.id;
    console.log(`核对供应商 ${provider.id}`);
    const providerResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/providers');
    const settingsResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/settings');
    assert.equal((await page.goto(base + '/dashboard/providers/' + encodeURIComponent(provider.id), { waitUntil: 'domcontentloaded' })).status(), 200);
    const accountResponse = await providerResponse;
    const configResponse = await settingsResponse;
    assert.equal(accountResponse.status(), 200);
    assert.equal(configResponse.status(), 200);
    const actual = await configResponse.json();
    const connections = normalizeProviders(await accountResponse.json()).filter(connection => provider.connections.some(expected => expected.id === connection.id));
    const form = page.getByRole('form', { name: '账号调度' });
    await form.waitFor();
    assert.equal(await form.count(), 1);
    const override = actual.providerStrategies?.[provider.id] || {};
    const enabled = override.fallbackStrategy === 'round-robin';
    assert.equal(await form.getByRole('switch', { name: '供应商轮询' }).isChecked(), enabled);
    if (enabled) assert.equal(await form.getByLabel('粘滞请求次数').inputValue(), String(override.stickyRoundRobinLimit ?? actual.stickyRoundRobinLimit ?? 3));
    const rows = page.locator('table').filter({ has: page.locator('caption', { hasText: '供应商账号连接列表' }) });
    await rows.getByRole('button', { name: `查看连接 ${connections[0].name}`, exact: true }).waitFor();
    assert.equal(await rows.getByRole('button', { name: /^查看连接 / }).count(), connections.length);
    for (const connection of connections) assert.equal(await rows.getByRole('button', { name: `查看连接 ${connection.name}`, exact: true }).count(), connections.filter(item => item.name === connection.name).length);
    assert.equal(await form.getByRole('button', { name: '保存调度' }).isEnabled(), false);
    report.providers.push({ id: provider.id, accounts: connections.length, roundRobin: enabled, sticky: enabled ? override.stickyRoundRobinLimit || actual.stickyRoundRobinLimit || 3 : null });
    if (['codex', 'antigravity', 'codebuddy-cn'].includes(provider.id)) {
      for (const width of [1440, 375]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const theme of ['light', 'dark']) {
          await page.getByLabel('主题模式').selectOption(theme);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          assert.equal(await form.evaluate(element => element.scrollWidth <= element.clientWidth), true);
          await page.screenshot({ path: resolve(screenshotDir, `${provider.id}-${width}-${theme}.png`), fullPage: true });
        }
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    console.log(`已核对 ${provider.id}：${connections.length} 个真实账号`);
  }
  stage = 'reload';
  console.log('核对页面刷新');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('form', { name: '账号调度' }).waitFor();
  console.log('核对配置保持一致');
  assert.deepEqual((await read('/api/settings')).providerStrategies, initial.providerStrategies);
  assert.deepEqual(writes, [], 'Live acceptance must only read business data');
  assert.deepEqual(errors, []);
  await writeFile(resolve(screenshotDir, 'acceptance.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (failure) {
  console.error(`真实验收失败，阶段：${stage}，页面：${page.url()}`);
  console.error(failure.message);
  throw failure;
} finally { await browser.close(); }

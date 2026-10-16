import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { normalizeProviders } from '../src/api/client.js';
import { groupProviders } from '../src/api/providers.js';
import { selectTheme } from './theme-control.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4328';
const directory = resolve(process.env.SCREENSHOT_DIR || 'reports/provider-batch-20261013/live');
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
const writes = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('request', request => {
  const path = new URL(request.url()).pathname;
  if (path.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) writes.push({ path, method: request.method() });
});
const read = async path => {
  const response = await context.request.get(base + path);
  assert.equal(response.status(), 200, path);
  return response.json();
};
try {
  assert.equal((await read('/api/health')).driver, 'better-sqlite3');
  assert(!(await read('/api/auth/status')).demo);
  const env = parseEnv(await readFile(process.env.TENROUTER_TEST_LOGIN_ENV || resolve(process.env.USERPROFILE, '.codex/credentials/10router-web.env'), 'utf8'));
  assert.equal((await context.request.post(base + '/api/auth/login', { data: { password: env.TENROUTER_TEST_PASSWORD.trim() } })).status(), 200);
  const [providers, nodes] = await Promise.all([read('/api/providers'), read('/api/provider-nodes')]);
  const groups = groupProviders(normalizeProviders(providers), nodes.nodes);
  const populated = groups.filter(group => group.connections.length);
  const group = populated.find(item => item.connections.length > 1) || populated[0];
  assert(group, '真实网关没有可验收的账号');
  const report = { base, mode: 'real-gateway-read-only-acceptance', providers: populated.length, accounts: providers.connections.length, accountView: { provider: group.id, accounts: group.connections.length }, checks: [] };
  for (const view of ['providers', 'providers/' + encodeURIComponent(group.id)]) {
    assert.equal((await page.goto(base + '/dashboard/' + view)).status(), 200);
    await page.getByRole('checkbox', { name: view === 'providers' ? /^选择供应商 / : /^选择账号 / }).first().waitFor();
    const all = page.getByLabel(view === 'providers' ? '全选当前供应商' : '全选当前账号', { exact: true });
    assert.equal(await all.isChecked(), false);
    await all.check();
    const count = view === 'providers' ? providers.connections.length : group.connections.length;
    const selected = view === 'providers' ? `已选 ${populated.length} 个供应商 · ${count} 个账号` : `已选 ${count} 个账号`;
    await page.locator('.provider-batch-toolbar').getByText(selected, { exact: true }).waitFor();
    for (const theme of ['dark', 'light']) {
      await selectTheme(page, theme);
      for (const width of [320, 375, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${view}/${theme}/${width}: page overflow`);
        assert(await page.locator('.provider-batch-toolbar').evaluate(element => element.scrollWidth <= element.clientWidth));
      }
      await page.screenshot({ path: resolve(directory, `${view === 'providers' ? 'suppliers' : 'accounts'}-${theme}.png`), fullPage: true });
      await page.setViewportSize({ width: 375, height: 1000 });
      await page.getByRole('button', { name: '批量绑定代理', exact: true }).click();
      const dialog = page.getByRole('dialog');
      assert.equal(await dialog.getByLabel('代理方式', { exact: true }).locator('option').count(), 3);
      assert(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth));
      await page.screenshot({ path: resolve(directory, `${view === 'providers' ? 'suppliers' : 'accounts'}-proxy-${theme}.png`), fullPage: true });
      await dialog.getByRole('button', { name: '取消', exact: true }).click();
    }
    report.checks.push(`${view}: 真实账号全选计数、三种代理配置入口、深浅主题与四种屏宽通过`);
  }
  assert.deepEqual(writes, [], '真实数据验收不得批量写入账号或执行连接测试');
  assert.deepEqual(errors, []);
  Object.assign(report, { writes, errors, http: { health: 200, auth: 200, login: 200, providers: 200, nodes: 200, page: 200 } });
  await writeFile(resolve(directory, 'acceptance.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }

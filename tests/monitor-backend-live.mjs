import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4317';
const credentials = parseEnv(await readFile(process.env.TENROUTER_TEST_LOGIN_ENV || resolve(process.env.USERPROFILE || process.env.HOME, '.codex/credentials/10router-web.env'), 'utf8'));
assert(credentials.TENROUTER_TEST_PASSWORD, '真实登录凭据缺失');
const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: credentials.TENROUTER_TEST_PASSWORD }), signal: AbortSignal.timeout(15000) });
assert.equal(login.status, 200, '真实网关登录失败');
const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');

async function request(config) {
  const response = await fetch(base + '/api/iq-monitor', {
    method: config ? 'PUT' : 'GET',
    headers: { cookie, ...(config && { 'content-type': 'application/json' }) },
    ...(config && { body: JSON.stringify(config) }),
    signal: AbortSignal.timeout(15000),
  });
  return { status: response.status, data: await response.json() };
}

const original = await request();
assert.equal(original.status, 200);
assert.equal(original.data.capabilities?.modelThinking, true, '运行中的后端未包含思考强度补丁；仅重启服务不能代替重新构建');
for (const provider of original.data.catalog) {
  for (const model of provider.models) assert(Array.isArray(provider.thinkingLevels?.[model]), '后端缺少模型思考档位信息');
}

if (process.env.TENROUTER_TEST_CONFIG_WRITES === '1') {
  assert.equal(original.data.config.enabled, false, '写入验收仅允许已关闭自动检测的实例，避免影响生产检测计划');
  const provider = original.data.catalog.find(item => item.models.some(model => item.thinkingLevels[model].length));
  assert(provider, '没有可验证思考强度的模型');
  const model = provider.models.find(value => provider.thinkingLevels[value].length);
  const levels = provider.thinkingLevels[model];
  const level = levels.includes('high') ? 'high' : levels[0];
  const config = { ...original.data.config, enabled: false, providers: [{ id: provider.id, mode: 'selected', models: [model], modelChecks: { [model]: ['availability', 'iq'] }, modelThinking: { [model]: level } }] };
  let changed = false;
  try {
    for (const intervalMinutes of [1, 5, 15, 10080]) {
      changed = true;
      const saved = await request({ ...config, intervalMinutes });
      assert.equal(saved.status, 200, '合法检测间隔未被接受');
      assert.equal(saved.data.config.intervalMinutes, intervalMinutes);
      assert.equal(saved.data.config.providers[0].modelThinking?.[model], level, '思考强度被后端丢弃');
      const reloaded = await request();
      assert.equal(reloaded.data.config.intervalMinutes, intervalMinutes);
      assert.equal(reloaded.data.config.providers[0].modelThinking?.[model], level, '重新加载后思考强度丢失');
      assert.deepEqual(reloaded.data.config.providers[0].modelChecks[model], ['availability', 'iq']);
    }
    for (const intervalMinutes of [null, 0, -1, 0.5, 1.5, 10081]) {
      assert.equal((await request({ ...config, intervalMinutes })).status, 400, '非法检测间隔被接受');
    }
    assert.equal((await request({ ...config, intervalMinutes: 1, providers: [{ ...config.providers[0], modelThinking: { [model]: 'unsupported-level' } }] })).status, 400, '非法思考档位被接受');
    if (process.env.TENROUTER_TEST_BROWSER === '1') {
      assert.equal((await request({ ...config, intervalMinutes: 15, providers: [{ ...config.providers[0], modelThinking: {} }] })).status, 200);
      const { chromium } = await import('playwright');
      const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] });
      try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        assert.equal((await context.request.post(base + '/api/auth/login', { data: { password: credentials.TENROUTER_TEST_PASSWORD } })).status(), 200);
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(base + '/dashboard/monitor');
        await page.getByRole('tab', { name: '自动检测配置', exact: true }).click();
        const expandProvider = async () => {
          await page.locator('.monitor-provider-config').nth(original.data.catalog.findIndex(item => item.id === provider.id)).locator('summary').click();
          await page.getByLabel('搜索检测模型 ' + provider.name, { exact: true }).fill(model);
        };
        await expandProvider();
        const thinking = page.getByLabel(provider.name + ' ' + model + ' 智商检测思考强度', { exact: true });
        assert.equal(await thinking.isDisabled(), false);
        await thinking.selectOption(level);
        await page.getByLabel('检测间隔', { exact: true }).fill('1');
        const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/iq-monitor' && response.request().method() === 'PUT');
        await page.getByRole('button', { name: '保存检测配置', exact: true }).click();
        assert.equal((await saved).status(), 200);
        await page.getByRole('status').getByText('已保存，自动检测已关闭。', { exact: true }).waitFor();
        await page.reload();
        await page.getByRole('tab', { name: '自动检测配置', exact: true }).click();
        await expandProvider();
        assert.equal(await page.getByLabel('检测间隔', { exact: true }).inputValue(), '1');
        assert.equal(await thinking.inputValue(), level);
        assert.deepEqual(errors, []);
        console.log('PASS: real-data browser saves one-minute interval and thinking strength, and keeps both after reload.');
      } finally { await browser.close(); }
    }
    console.log('PASS: interval boundaries, model thinking persistence, and invalid-strength rejection.');
  } finally {
    if (changed) {
      assert.equal((await request(original.data.config)).status, 200, '原检测配置恢复失败');
      const { revision: originalRevision, ...expected } = original.data.config;
      const { revision: restoredRevision, ...actual } = (await request()).data.config;
      assert.deepEqual(actual, expected, '原检测配置未完整恢复');
    }
  }
} else {
  assert.deepEqual((await request()).data.config, original.data.config);
  console.log('PASS: deployed backend advertises thinking support and model strengths; configuration unchanged.');
}

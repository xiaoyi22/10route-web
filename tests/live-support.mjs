import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';

export async function openLiveSession(name) {
  const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4317';
  const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'C:/Users/20449/AppData/Local/Temp/hermes-e2e/.venv/Lib/site-packages/playwright/driver/package');
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true, args: ['--no-proxy-server'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const directory = resolve(process.env.USERPROFILE || process.env.HOME, '.codex/tmp/full-integration', name, stamp);
  await mkdir(directory, { recursive: true });
  const report = { base, startedAt: new Date().toISOString(), data: 'real-gateway', checks: [], screenshots: [], writes: [], errors: [] };
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  page.on('request', request => { const path = new URL(request.url()).pathname; if (path.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) report.writes.push({ method: request.method(), path }); });
  const env = parseEnv(await readFile(process.env.TENROUTER_TEST_LOGIN_ENV || resolve(process.env.USERPROFILE || process.env.HOME, '.codex/credentials/10router-web.env'), 'utf8'));
  const password = env.TENROUTER_TEST_PASSWORD;
  assert(password, '真实网关凭据缺失');
  const health = await context.request.get(base + '/api/health');
  assert.equal(health.status(), 200);
  assert.equal((await health.json()).driver, 'better-sqlite3', '禁止使用模拟后端');
  const status = await context.request.get(base + '/api/auth/status');
  assert.equal(status.status(), 200);
  assert(!(await status.json()).demo, '禁止使用演示数据');
  const login = await context.request.post(base + '/api/auth/login', { data: { password } });
  assert.equal(login.status(), 200, '真实登录失败，不自动重试');
  const read = async path => { const response = await context.request.get(base + path); assert.equal(response.status(), 200, path); return response.json(); };
  const check = value => { report.checks.push(value); console.log(value); };
  let backup;
  async function backupDatabase() {
    if (backup) return backup;
    const response = await context.request.get(base + '/api/settings/database', { headers: { 'x-10r-password': password } });
    assert.equal(response.status(), 200, '修改前真实配置备份失败');
    backup = await response.json();
    assert(Array.isArray(backup.providerConnections) && backup.settings);
    const privateDir = resolve(process.env.USERPROFILE || process.env.HOME, '.codex/credentials/full-integration-backups');
    await mkdir(privateDir, { recursive: true });
    await writeFile(resolve(privateDir, `${name}.bak-${stamp}.json`), JSON.stringify(backup), { flag: 'wx', mode: 0o600 });
    check('已保存修改前真实配置备份');
    return backup;
  }
  async function screenshots(route, label) {
    for (const width of [1440, 768, 375, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ['light', 'dark']) {
        await page.getByLabel('主题模式').selectOption(theme);
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))));
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label} 页面横向溢出 ${width} ${theme}`);
        const path = resolve(directory, `${label}-${width}-${theme}.png`);
        await page.screenshot({ path, fullPage: true, animations: 'disabled' });
        report.screenshots.push({ route, width, theme, file: path });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    check(`${label}：四种屏宽、深浅主题无页面横向溢出，已保存截图待视觉审查`);
  }
  async function finish(failure) {
    report.finishedAt = new Date().toISOString();
    report.passed = !failure && !report.errors.length;
    if (failure) report.failure = failure.message;
    await writeFile(resolve(directory, 'acceptance.json'), JSON.stringify(report, null, 2));
    await browser.close();
    console.log(`验收记录：${directory}`);
  }
  return { base, page, context, read, check, report, directory, screenshots, backupDatabase, finish };
}

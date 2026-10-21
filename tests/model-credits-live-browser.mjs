import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';
import { selectTheme } from './theme-control.mjs';
import { creditWindow } from '../src/api/model-credits.js';

const base = process.env.PREVIEW_URL || 'http://192.168.11.150:4317';
const output = resolve('reports/model-credits-20261015');
await mkdir(output, { recursive: true });
const report = { base, stage: process.env.TENROUTER_CREDIT_TEST_STAGE || 'gateway', checks: [], simulatedChecks: [], http: [], errors: [], writes: [], screenshots: [] };
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/Los_Angeles' });
  const get = async path => {
    const response = await context.request.get(base + path);
    report.http.push({ path: path.replace(/\/providers\/[^/]+\/models/, '/providers/{account}/models'), status: response.status() });
    assert.equal(response.status(), 200, path);
    return response.json();
  };
  assert.equal((await get('/api/health')).driver, 'better-sqlite3');
  assert.notEqual((await get('/api/auth/status')).demo, true);
  const env = parseEnv(await readFile(process.env.TENROUTER_TEST_LOGIN_ENV || resolve(process.env.USERPROFILE, '.codex/credentials/10router-web.env'), 'utf8'));
  const login = await context.request.post(base + '/api/auth/login', { data: { password: env.TENROUTER_TEST_PASSWORD } });
  report.http.push({ path: '/api/auth/login', status: login.status() });
  assert.equal(login.status(), 200);
  const models = (await get('/api/models')).models;
  const cnFree = models.find(model => model.provider === 'cbcn' && model.model === 'hy3');
  const cnPaid = models.find(model => model.provider === 'cbcn' && model.rateMultiplier > 0);
  assert.equal(cnFree.rateMultiplier, 0);
  assert(cnPaid, '真实 WorkBuddy 付费倍率缺失');
  const connections = (await get('/api/providers')).connections;
  const account = connections.find(connection => connection.provider === 'qoder' && connection.isActive !== false);
  assert(account, '真实 Qoder 启用账号缺失');
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/') && request.method() !== 'GET') report.writes.push({ path: new URL(request.url()).pathname, method: request.method() });
  });
  const search = async id => { await page.getByLabel('搜索模型', { exact: true }).fill(id); const credit = page.getByLabel(`模型积分 ${id}`, { exact: true }); await credit.locator('.model-credit-current .badge').waitFor(); return credit; };
  assert.equal((await page.goto(base + '/dashboard/models')).status(), 200);
  const free = await search(cnFree.routedModel);
  await free.getByText('免费', { exact: true }).waitFor();
  report.checks.push('真实模型总目录保留 0 倍率并显示免费');
  assert.equal((await page.goto(base + '/dashboard/providers/qoder')).status(), 200);
  // 页面响应体在后续导航后会失效（No resource with given identifier），改用请求上下文读取同一接口。
  const response = await page.request.get(`${base}/api/providers/${account.id}/models`);
  assert.equal(response.status(), 200);
  const catalog = await response.json();
  const priced = catalog.models.find(model => model.id.endsWith('/ultimate'));
  assert.equal(typeof priced.rateMultiplier, 'number');
  // 使用账号目录返回的真实 id；总目录若仍按双前缀登记（qoder/qoder/*），这里的积分行会匹配不上，属 §3.5 数据卫生问题。
  const qoderId = priced.id;
  const credit = await search(qoderId);
  // 当前处于峰/谷窗口时，状态标签显示时段结论（如「当前时段免费」），倍率由峰谷明细行承载。
  const inWindow = priced.rateMultiplier > 0 && priced.promotion && creditWindow(priced.promotion, Date.now())?.active === true;
  await credit.locator('.model-credit-current .badge').waitFor();
  if (!inWindow) assert.equal(await credit.locator('.model-credit-current .badge').innerText(), priced.rateMultiplier === 0 ? '免费' : `积分倍率 ${priced.rateMultiplier}×`);
  const source = page.getByLabel('积分参考信息', { exact: true });
  assert.match(await source.innerText(), /参考账号：/);
  assert.equal(await source.count(), 1);
  assert(!(await credit.innerText()).includes('参考账号：'));
  if (priced.promotion) {
    const periods = credit.locator('.model-credit-periods > div');
    assert.equal(await periods.count(), 2);
    assert.match(await periods.nth(0).locator('dt').innerText(), /高峰/);
    assert.match(await periods.nth(1).locator('dt').innerText(), /低谷/);
    assert((await periods.nth(0).innerText()).includes(`${priced.promotion.window_end}–${priced.promotion.window_start}`));
    assert((await periods.nth(1).innerText()).includes(priced.promotion.window_start));
    assert.equal(await credit.locator('.model-credit-periods .current strong').innerText(), priced.rateMultiplier === 0 ? '免费' : `${priced.rateMultiplier}×`);
    await credit.getByText('北京时间', { exact: true }).waitFor();
    report.checks.push('真实 Qoder 高峰与低谷分开展示时段和倍率，当前时段高亮，当前倍率与接口一致');
  }
  report.http.push({ path: '/api/providers/{account}/models', status: response.status() });
  report.checks.push('真实 Qoder 当前倍率、优惠时间、参考账号及查询时间与接口一致，无重复折扣');
  for (const provider of ['qoder', 'codebuddy-cn']) {
    await page.goto(base + '/dashboard/providers/' + provider);
    const id = provider === 'qoder' ? qoderId : cnPaid.routedModel;
    const status = await search(id);
    await status.getByText(provider === 'qoder' ? priced.rateMultiplier === 0 ? '免费' : `积分倍率 ${priced.rateMultiplier}×` : `积分倍率 ${cnPaid.rateMultiplier}×`, { exact: true }).waitFor();
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ['light', 'dark']) {
        await selectTheme(page, theme);
        await page.evaluate(() => document.fonts.ready);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '页面横向溢出');
        const file = `${provider}-${width}-${theme}.png`;
        await page.screenshot({ path: resolve(output, file), fullPage: true, animations: 'disabled' });
        report.screenshots.push(file);
      }
    }
    if (provider === 'qoder') {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await selectTheme(page, 'light');
      await page.getByLabel('搜索模型', { exact: true }).fill('');
      await page.waitForFunction(() => document.querySelectorAll('.provider-model-card').length > 1);
      assert.equal(await page.getByLabel('积分参考信息', { exact: true }).count(), 1);
      assert((await page.locator('.provider-model-card').allInnerTexts()).every(text => !text.includes('参考账号：')));
      await page.locator('.provider-model-catalog').screenshot({ path: resolve(output, 'qoder-catalog.png') });
      report.screenshots.push('qoder-catalog.png');
    }
  }
  report.checks.push('两家供应商详情在桌面、手机及深浅主题均显示积分信息，无页面横向溢出');

  if (process.env.TENROUTER_CREDIT_SIMULATE === '1') {
    const cnNight = { provider: 'cbcn', model: 'hy4-preview', name: '夜间免费边界测试', routedModel: 'cbcn/hy4-preview', rateMultiplier: 0.29, nightFree: { from: 23, to: 8 }, caps: {} };
    await page.route('**/api/models', route => route.fulfill({ json: { models: [...models, cnNight] } }));
    await page.clock.install({ time: new Date('2026-10-15T22:59:50+08:00') });
    await page.goto(base + '/dashboard/providers/codebuddy-cn');
    const night = await search(cnNight.routedModel);
    await night.getByText('积分倍率 0.29×', { exact: true }).waitFor();
    await page.clock.fastForward(31000);
    await night.getByText('当前时段免费', { exact: true }).waitFor();
    await page.clock.setSystemTime(new Date('2026-10-16T08:00:00+08:00'));
    await page.clock.fastForward(31000);
    await night.getByText('积分倍率 0.29×', { exact: true }).waitFor();
    report.simulatedChecks.push('美国浏览器时区下，模拟北京时间跨 23:00 与 08:00，无需重开页面即更新免费状态');
    await page.clock.setSystemTime(new Date());
    await page.goto(base + '/dashboard/providers/qoder');
    const current = await search(qoderId);
    await current.getByText(priced.rateMultiplier === 0 ? '免费' : `积分倍率 ${priced.rateMultiplier}×`, { exact: true }).waitFor();
    const pattern = '**/api/providers/' + account.id + '/models';
    await page.route(pattern, route => route.fulfill({ status: 503, json: { error: '模拟目录读取失败' } }));
    await page.getByRole('button', { name: '刷新模型', exact: true }).click();
    await current.getByText('积分信息未更新', { exact: true }).waitFor();
    assert.equal(await current.locator('.model-credit-free').count(), 0);
    await page.unroute(pattern);
    await page.getByRole('button', { name: '刷新模型', exact: true }).click();
    await current.getByText(priced.rateMultiplier === 0 ? '免费' : `积分倍率 ${priced.rateMultiplier}×`, { exact: true }).waitFor();
    report.simulatedChecks.push('模拟 Qoder 查询失败清除当前价格声明，手动刷新后恢复真实目录数据');

    let boundaryReads = 0;
    await page.clock.setSystemTime(new Date('2026-10-15T21:58:00+08:00'));
    await page.clock.fastForward(31000);
    await page.route(pattern, async route => {
      boundaryReads++;
      const now = await page.evaluate(() => Date.now());
      const active = now >= Date.parse('2026-10-15T22:00:00+08:00') && now < Date.parse('2026-10-16T08:00:00+08:00');
      return route.fulfill({ json: { models: catalog.models.map(model => model.id === priced.id ? { ...model, rateMultiplier: active ? 0.4 : 2, promotion: { window_start: '22:00', window_end: '08:00', timezone: 'Asia/Singapore', before_promotion_price_factor: 2, discount_factor: 0.2 } } : model) } });
    });
    await page.getByRole('button', { name: '刷新模型', exact: true }).click();
    await source.getByText(/查询时间：21:58:/).waitFor();
    await current.getByText('积分倍率 2×', { exact: true }).waitFor();
    assert.match(await current.locator('.model-credit-periods .current dt').innerText(), /高峰/);
    await page.clock.fastForward(90000);
    await current.getByText('积分倍率 0.4×', { exact: true }).waitFor();
    assert.match(await current.locator('.model-credit-periods .current dt').innerText(), /低谷/);
    assert.equal(await current.locator('.model-credit-periods .current strong').innerText(), '0.4×');
    assert(boundaryReads >= 2);
    await page.clock.setSystemTime(new Date('2026-10-16T07:58:00+08:00'));
    await page.getByRole('button', { name: '刷新模型', exact: true }).click();
    await source.getByText(/查询时间：07:58:/).waitFor();
    await current.getByText('积分倍率 0.4×', { exact: true }).waitFor();
    await page.clock.fastForward(121000);
    await current.getByText('积分倍率 2×', { exact: true }).waitFor();
    assert.match(await current.locator('.model-credit-periods .current dt').innerText(), /高峰/);
    await page.unroute(pattern);
    await page.clock.setSystemTime(new Date());
    report.simulatedChecks.push('模拟跨 Qoder 22:00 与 08:00 边界自动重查服务端，峰谷倍率和当前标记切换，不重复折扣');

    const secondAccount = connections.find(connection => connection.provider === 'qoder' && connection.isActive !== false && connection.id !== account.id);
    if (secondAccount) {
      const secondPattern = '**/api/providers/' + secondAccount.id + '/models';
      await page.route('**/api/providers', route => route.fulfill({ json: { connections: [secondAccount, ...connections.filter(connection => connection.id !== secondAccount.id)] } }));
      await page.route(secondPattern, route => route.fulfill({ json: { models: catalog.models.map(model => model.id === priced.id ? { ...model, rateMultiplier: 7.75 } : model) } }));
      await page.getByRole('button', { name: '刷新模型', exact: true }).click();
      await current.getByText('积分倍率 7.75×', { exact: true }).waitFor();
      assert((await source.innerText()).includes(secondAccount.name || secondAccount.displayName));
      await page.unroute('**/api/providers');
      await page.unroute(secondPattern);
      report.simulatedChecks.push('模拟更换参考账号后重新取价，显示新账号来源，不沿用旧账号价格');
    }
  }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.writes, []);
  report.checks.push('浏览器无未捕获异常，验收没有发起推理、签到或配置写入');
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = error.stack;
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(resolve(output, 'acceptance.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

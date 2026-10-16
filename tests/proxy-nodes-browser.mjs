import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';
import { selectTheme } from './theme-control.mjs';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4326';
const live = process.argv.includes('--live');
const directory = resolve(process.env.SCREENSHOT_DIR || 'reports/proxy-nodes', live ? 'live' : 'isolated');
const credentials = parseEnv(await readFile(process.env.TENROUTER_TEST_LOGIN_ENV || resolve(process.env.USERPROFILE, '.codex/credentials/10router-web.env'), 'utf8'));
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(45000);
const report = { base, live, passed: false, checks: [], http: [], errors: [], networkErrors: [] };
page.on('pageerror', error => report.errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && live && !message.text().startsWith('Failed to load resource:')) report.errors.push(message.text()); });
page.on('response', response => {
  if (response.url().includes('/proxy/delay')) report.http.push(response.status());
  if (response.status() >= 400) report.networkErrors.push({ path: new URL(response.url()).pathname, status: response.status() });
});
const tested = [];
let active = 0;
let maxActive = 0;
await mkdir(directory, { recursive: true });
try {
  const auth = await context.request.get(base + '/api/auth/status');
  assert.equal(auth.status(), 200);
  assert.notEqual((await auth.json()).demo, true);
  const login = await context.request.post(base + '/api/auth/login', { data: { password: credentials.TENROUTER_TEST_PASSWORD } });
  assert.equal(login.status(), 200);
  report.http.push(auth.status(), login.status());
  if (!live) {
    const nodes = [
      { name: 'NODE-10', type: 'VLESS', delay: 300, alive: true },
      { name: 'NODE-2', type: 'AnyTLS', delay: 40, alive: true },
      { name: 'NODE-3', type: 'Hysteria2', delay: 0, alive: false },
      { name: 'NODE-4', type: 'VLESS', delay: null, alive: null },
      { name: 'NODE-5', type: 'AnyTLS', delay: 180, alive: true },
      { name: 'NODE-6', type: 'VLESS', delay: 90, alive: true },
      { name: '订阅信息', type: 'VLESS', is_info: true },
    ];
    await context.route('**/api/hermes/**', async route => {
      const path = new URL(route.request().url()).pathname;
      const send = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
      if (path.endsWith('/proxy/groups')) return send({ groups: [{ name: 'TEST', type: 'Selector', now: 'NODE-2' }] });
      if (path.endsWith('/proxy/status')) return send({ group: 'TEST', now: 'NODE-2', nodes });
      if (path.endsWith('/proxy/delay')) {
        const { name } = route.request().postDataJSON();
        tested.push(name); maxActive = Math.max(maxActive, ++active);
        await new Promise(resolve => setTimeout(resolve, 250));
        active--;
        if (name === 'NODE-3') return send({ error: '测试节点超时' }, 502);
        return send({ delay: name === 'NODE-2' ? 400 : name === 'NODE-4' ? 0 : Number(name.split('-')[1]) * 10 });
      }
      return send({ error: 'Unexpected request' }, 500);
    });
  }
  const entry = await context.request.get(base + '/dashboard/proxy');
  assert.equal(entry.status(), 200); report.http.push(entry.status());
  await page.goto(base + '/dashboard/proxy');
  const table = page.locator('.proxy-section table');
  await table.locator('tbody .proxy-node-name').first().waitFor();
  const names = () => table.locator('tbody .proxy-node-name strong').allTextContents();
  const delays = () => table.locator('tbody td:nth-child(4)').allTextContents();
  async function checkDelays(descending) {
    const values = await delays();
    const numbers = values.filter(value => value.endsWith(' ms')).map(value => Number(value.replace(' ms', '')));
    assert.deepEqual(numbers, [...numbers].sort((a, b) => descending ? b - a : a - b));
    assert(values.slice(0, numbers.length).every(value => value.endsWith(' ms')), 'Unknown and failed delays must stay last');
  }
  await checkDelays(false);
  await table.getByRole('button', { name: '延迟', exact: true }).click();
  await checkDelays(true);
  await table.getByRole('button', { name: '节点名称', exact: true }).click();
  const sortedNames = await names();
  assert.deepEqual(sortedNames, [...sortedNames].sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true })));
  await table.getByRole('button', { name: '协议 / 类型', exact: true }).click();
  const types = await table.locator('tbody td:nth-child(2)').allTextContents();
  assert.deepEqual(types, [...types].sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true })));
  await table.getByRole('button', { name: '检测状态', exact: true }).click();
  const states = await table.locator('tbody td:nth-child(3) .status').allTextContents();
  const order = { '探测正常': 0, '探测失败': 1, '未检测 / 未知': 2 };
  assert.deepEqual(states.map(x => order[x]), states.map(x => order[x]).sort((a, b) => a - b));
  report.checks.push('名称、类型、状态、延迟排序通过，未知延迟始终置后');
  if (!live) {
    await page.getByRole('button', { name: '一键测速', exact: true }).click();
    await page.getByText('测速完成：6 个节点，4 个正常，2 个失败', { exact: true }).waitFor();
    assert.equal(tested.length, 6); assert.equal(new Set(tested).size, 6); assert(maxActive <= 3);
    assert(!tested.includes('订阅信息'));
    await table.getByRole('button', { name: '延迟', exact: true }).click();
    await checkDelays(false);
    report.checks.push('一键测速覆盖6个节点，限制3个并发，失败继续，结果排序使用新延迟');
    tested.length = 0;
    await page.getByRole('searchbox', { name: '搜索节点' }).fill('NODE-2');
  } else {
    const response = await context.request.get(base + '/api/hermes/proxy/status');
    assert.equal(response.status(), 200); report.http.push(response.status());
    const data = await response.json();
    const target = data.nodes.find(node => node.name === '日本 JP2 住宅') || data.nodes.find(node => !node.is_info && !['Selector', 'URLTest', 'Fallback', 'LoadBalance'].includes(node.type));
    assert(target);
    await page.getByRole('searchbox', { name: '搜索节点' }).fill(target.name);
  }
  const targets = await names();
  assert(targets.length > 0);
  await page.getByRole('button', { name: '一键测速', exact: true }).click();
  await page.getByText(new RegExp(`测速完成：${targets.length} 个节点`)).waitFor();
  assert.equal(await table.getByText('本次手动检测', { exact: true }).count(), targets.length);
  if (!live) assert.deepEqual(tested, targets);
  else assert(report.http.every(status => status === 200), 'Real delay API must return HTTP 200');
  report.checks.push(`搜索后仅测速当前显示的${targets.length}个节点，显示手动检测结果`);
  await page.getByRole('searchbox', { name: '搜索节点' }).fill('');
  for (const theme of ['light', 'dark']) {
    await selectTheme(page, theme);
    await page.screenshot({ path: resolve(directory, `${theme}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 375, height: 812 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(report.errors, []);
  if (live && report.networkErrors.length) {
    assert(report.networkErrors.every(error => error.path === '/api/hermes/egress-ip'), 'Only the known egress failure may be separate from node acceptance');
    assert(await page.getByRole('alert').filter({ hasText: '出口检测失败' }).count() > 0, 'Egress failure must remain visible');
    report.checks.push('出口检测失败已在页面显示，详见 networkErrors');
  }
  report.passed = true;
  console.log('PASS ' + (live ? 'live' : 'isolated') + ': ' + report.checks.join('；') + '；HTTP ' + report.http.join(',') + '；网络异常 ' + JSON.stringify(report.networkErrors));
} catch (failure) { report.failure = failure.message; throw failure; }
finally { await writeFile(resolve(directory, 'acceptance.json'), JSON.stringify(report, null, 2)); await browser.close(); }

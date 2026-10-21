import assert from 'node:assert/strict';
import http from 'node:http';
import { fork, spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { startFixtureServer } from '../scripts/fixture-server.mjs';

const fixture = await startFixtureServer();
const screenshotDir = process.env.SCREENSHOT_DIR || join(tmpdir(), '10router-balances-refresh');
await mkdir(screenshotDir, { recursive: true });

const at = new Date().toISOString();
const daysFromNow = days => new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(6, 0, 0, 0);

const balances = {
  channelOptions: [
    { id: 'nova', name: 'Nova AI', enabled: true },
    { id: 'codex', name: 'Codex 优选', enabled: true },
    { id: 'multi', name: 'Multi 账户', enabled: true },
    { id: 'zero', name: 'Zero Wallet', enabled: true },
    { id: 'ghost', name: 'Ghost 上游', enabled: true },
    { id: 'none', name: '未返回数据', enabled: true },
    { id: 'off', name: '已关闭渠道', enabled: false },
  ],
  channels: [
    { id: 'nova', connections: [{
      id: 'nova-a', name: 'Nova account',
      wallet: { amount: 534.21, currency: 'CNY' },
      available: { amount: 500, currency: 'CNY' },
      today: { cost: 2.34, calls: 57, tokens: 91234, currency: 'CNY' },
      checkedAt: at,
      channelFunding: [{ id: 'f1', name: 'API 套餐', status: 'available', windows: [
        { period: 'daily', used: 0, remaining: 100, limit: 100, unit: 'CNY', resetsAt: tomorrow.toISOString() },
      ] }],
    }], subscriptions: [] },
    { id: 'codex', connections: [{
      id: 'codex-a', name: 'Codex account', checkedAt: at,
      limits: [
        { period: 'rolling5h', used: 24, remaining: 76, limit: 100, unit: '百分比', resetsAt: new Date(Date.now() + 4 * 3600 * 1000).toISOString() },
        { period: 'weekly', used: 64, remaining: 36, limit: 100, unit: '百分比', resetsAt: daysFromNow(3) },
      ],
    }], subscriptions: [] },
    { id: 'multi', connections: [
      { id: 'multi-a', name: '主账号', wallet: { amount: 25, currency: 'USD' }, today: { cost: 0.42, calls: 12, tokens: 5432, currency: 'USD' }, checkedAt: at },
      { id: 'multi-b', name: '备用账号', wallet: { amount: 10, currency: 'USD' }, today: { cost: 0, calls: 0, tokens: 0, currency: 'USD' }, checkedAt: at },
      { id: 'multi-c', name: '冷账号', wallet: { amount: 0, currency: 'USD' }, today: { cost: 0, calls: 0, tokens: 0, currency: 'USD' }, checkedAt: at },
    ], subscriptions: [{ id: 's1', name: '年度订阅', expiresAt: daysFromNow(180), windows: [
      { period: 'monthly', used: 1000, remaining: 9000, limit: 10000, unit: '次', resetsAt: daysFromNow(12) },
    ] }] },
    { id: 'zero', connections: [{ id: 'zero-a', name: 'Zero account', wallet: { amount: 0, currency: 'USD' }, checkedAt: at, stale: true }], subscriptions: [] },
    { id: 'ghost', connections: [{ id: 'ghost-a', name: 'Ghost account', checkedAt: at, error: '上游 502' }], subscriptions: [] },
    { id: 'off', connections: [], subscriptions: [] },
  ],
  errors: [{ channelId: 'ghost', connectionName: 'Ghost account', error: '上游 502' }],
};
const quotas = { connections: [] };

const calls = [];
const backend = http.createServer(async (request, response) => {
  let raw = ''; for await (const chunk of request) raw += chunk;
  calls.push({ url: request.url, method: request.method });
  const url = new URL(request.url, 'http://localhost');
  if (['/api/channel-balances', '/api/usage/quotas'].includes(url.pathname)) {
    const auth = await fetch(fixture.url + '/api/auth/status', { headers: { Cookie: request.headers.cookie || '' } }).then(result => result.json());
    response.setHeader('Content-Type', 'application/json');
    if (!auth.authenticated) { response.writeHead(401); return response.end('{"error":"Unauthorized"}'); }
    if (request.method === 'PATCH') balances.channelOptions.find(option => option.id === JSON.parse(raw).channelId).enabled = JSON.parse(raw).enabled;
    return response.end(JSON.stringify(url.pathname === '/api/usage/quotas' ? quotas : balances));
  }
  const controller = new AbortController();
  response.once('close', () => controller.abort());
  try {
    const result = await fetch(fixture.url + request.url, { signal: controller.signal, method: request.method, headers: { Cookie: request.headers.cookie || '', 'Content-Type': 'application/json' }, ...(raw ? { body: raw } : {}) });
    response.writeHead(result.status, Object.fromEntries(result.headers));
    await pipeline(Readable.fromWeb(result.body), response);
  } catch (error) { if (!controller.signal.aborted) throw error; }
});
await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
Object.assign(process.env, { TENROUTER_INTERNAL_TARGET: `http://127.0.0.1:${backend.address().port}`, TENROUTER_DATA_MODE: 'demo', TENROUTER_ENABLE_MANAGEMENT: '1', TENROUTER_PORT: '4324', TENROUTER_HERMES_URL: '' });
const vite = fork(new URL('./hermes-vite-worker.mjs', import.meta.url), [], { windowsHide: true, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
const profile = await mkdtemp(join(tmpdir(), 'balances-refresh-ui-'));
let browser;
let socket;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Vite startup timed out')), 60000); vite.once('message', () => { clearTimeout(timer); resolve(); }); vite.once('error', reject); });
  browser = spawn(process.env.HERMES_BROWSER_EXE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-proxy-server', '--remote-debugging-port=4334', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 40; i++) { try { targets = await fetch('http://127.0.0.1:4334/json/list').then(result => result.json()); break; } catch { await delay(100); } }
  assert(targets?.length, 'Browser did not start');
  socket = new WebSocket(targets.find(target => target.url === 'about:blank').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  const pending = new Map(); const errors = []; let sequence = 0;
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    if (data.id) { const job = pending.get(data.id); if (job) { clearTimeout(job.timer); pending.delete(data.id); data.error ? job.reject(new Error(JSON.stringify(data.error))) : job.resolve(data.result); } }
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text);
    if (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error') errors.push(data.params.args.map(argument => argument.value || argument.description).join(' '));
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 30000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
  const until = async expression => { for (let i = 0; i < 200; i++) { if (await evaluate(`!!(${expression})`)) return; await delay(100); } throw new Error(`Timed out: ${expression}`); };
  const click = label => evaluate(`(() => {const button=[...document.querySelectorAll('button')].find(item=>item.textContent.trim()===${JSON.stringify(label)});if(!button || button.disabled)throw new Error('Missing/disabled button');button.click();})()`);
  const fill = async (selector, value) => { await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus();document.querySelector(${JSON.stringify(selector)}).select()`); await send('Input.insertText', { text: value }); };
  await send('Runtime.enable'); await send('Page.enable');
  const loaded = new Promise(resolve => { const listener = event => { if (JSON.parse(event.data).method === 'Page.loadEventFired') { socket.removeEventListener('message', listener); resolve(); } }; socket.addEventListener('message', listener); });
  await send('Page.navigate', { url: 'http://127.0.0.1:4324/dashboard/balances?view=balances' }); await loaded;
  await until("document.querySelector('#login-password')"); await fill('#login-password', 'linear-demo'); await click('进入管理端');
  await until("document.querySelectorAll('.finance-channel-grid .finance-channel').length>0");

  // 总览指标行：主指标突出，其余指标各占一列并给出说明
  const summaryText = await evaluate("document.querySelector('.balance-summary-item.is-primary .balance-summary-note')?.textContent || ''");
  assert(summaryText.includes('共 7 个供应商'), `summary should mention total providers, got "${summaryText}"`);
  const summaryItems = await evaluate(`[...document.querySelectorAll('.balance-summary-item')].map(item => ({ label: item.querySelector('.balance-summary-label')?.textContent, value: item.querySelector('.balance-summary-value')?.textContent, note: item.querySelector('.balance-summary-note')?.textContent }))`);
  assert.equal(summaryItems.length, 4, 'summary shows 有余额 + three secondary states');
  assert(summaryItems.every(item => item.label && item.value && item.note), 'every summary item has label/value/note');
  assert.equal(await evaluate("document.querySelector('.balance-summary-item.is-primary .balance-summary-value').textContent"), '4', 'primary metric counts funded providers');

  // 卡片区结构断言
  const cards = await evaluate(`[...document.querySelectorAll('.finance-channel-grid .finance-channel')].map(card => ({
    name: card.querySelector('.finance-channel-title h3 a')?.textContent,
    heroCount: card.querySelectorAll('.finance-hero-amount').length,
    heroZero: card.querySelectorAll('.finance-hero-amount.is-zero').length,
    hasUsage: !!card.querySelector('.finance-usage'),
    usageText: card.querySelector('.finance-usage')?.innerText || '',
    metaText: card.querySelector('.finance-meta')?.innerText || '',
    accountLines: card.querySelectorAll('.finance-account-line').length,
    detailsCount: card.querySelectorAll('details.finance-limits').length,
    legacyAccounts: card.querySelectorAll('.finance-account').length,
    legacyTiles: card.querySelectorAll('.finance-values span').length,
  }))`);
  const by = name => cards.find(item => item.name === name);

  // Nova：单账户钱包余额突出（钱包与密钥额度不同值时并列显示），meta 合并
  assert.equal(by('Nova AI').heroCount, 2, 'Nova: wallet and available both shown');
  assert.equal(by('Nova AI').heroZero, 0, 'Nova: hero not dimmed');
  assert(by('Nova AI').metaText.includes('今日费用') && by('Nova AI').metaText.includes('今日调用'), 'Nova: meta rolls today cost/calls');
  assert.equal(by('Nova AI').detailsCount, 1, 'Nova: limits collapsed into one details');

  // Codex：预算窗口作用量条，无钱包 hero
  assert.equal(by('Codex 优选').heroCount, 0, 'Codex: no wallet hero');
  assert(by('Codex 优选').hasUsage, 'Codex: usage pills rendered');
  assert(by('Codex 优选').usageText.includes('76%') && by('Codex 优选').usageText.includes('36%'), 'Codex: percentages visible');

  // Multi：两个正余额并列 hero，所有有钱账户在列表行里
  assert.equal(by('Multi 账户').heroCount, 2, 'Multi: two positive wallets as heroes');
  assert.equal(by('Multi 账户').accountLines, 3, 'Multi: all three funded accounts listed');

  // Zero：唯一 0 余额账号保留一个 dimmed hero 表示"空钱包"
  assert.equal(by('Zero Wallet').heroCount, 1, 'Zero: single zero hero');
  assert.equal(by('Zero Wallet').heroZero, 1, 'Zero: hero dimmed');

  // 任何卡片不再使用旧版结构
  for (const card of cards) {
    assert.equal(card.legacyAccounts, 0, `${card.name}: no legacy .finance-account blocks`);
    assert.equal(card.legacyTiles, 0, `${card.name}: no legacy .finance-values tiles`);
  }

  // 展开 Nova 额度明细验证表格仍可访问
  await evaluate("document.querySelector('.finance-channel-grid .finance-channel details.finance-limits summary').click()");
  await until("document.querySelector('.finance-channel-grid .finance-channel details.finance-limits[open] table tbody tr')");
  const limitRows = await evaluate("document.querySelectorAll('.finance-channel-grid .finance-channel details.finance-limits[open] table tbody tr').length");
  assert(limitRows >= 1, 'expanded details shows limit rows');

  // 视觉验收截图（桌面 / 移动 × 深浅主题）
  for (const theme of ['light', 'dark']) {
    await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
    await delay(150);
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await delay(150);
    const shot1440 = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await writeFile(join(screenshotDir, `balances-refresh-1440-${theme}.png`), Buffer.from(shot1440.data, 'base64'));
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 800, deviceScaleFactor: 1, mobile: true });
    await delay(150);
    assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'), `${theme}/375: horizontal overflow`);
    const shot375 = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await writeFile(join(screenshotDir, `balances-refresh-375-${theme}.png`), Buffer.from(shot375.data, 'base64'));
  }
  assert.deepEqual(errors, []);
  console.log('PASS balances refresh: hero dedupe, usage pills, compact accounts, details collapse, no legacy grids, 4 screenshots saved');
} finally {
  socket?.close(); browser?.kill();
  vite.kill(); backend.close(); fixture.close();
}

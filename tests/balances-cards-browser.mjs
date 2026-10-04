import assert from 'node:assert/strict';
import http from 'node:http';
import { fork, spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { startFixtureServer } from '../scripts/fixture-server.mjs';

const fixture = await startFixtureServer();
const at = '2026-10-03T08:00:00Z';
const account = (id, name, extra) => ({ id, name, provider: 'codex', providerName: 'Codex', isActive: true, checkedAt: at, ...extra });
const quotas = { connections: [
  account('normal', 'Main account', { plan: 'Plus', cached: true, quotas: [{ name: '5h', total: 100, used: 75, resetAt: at }, { period: 'weekly', total: 100, used: 100, remaining: 0, resetAt: at }] }),
  account('percent', 'Percentage account', { provider: 'antigravity', providerName: 'Antigravity', plan: 'PRO', quotas: ['Gemini Models · 5h Window', 'Gemini Models · Weekly Window', 'Claude and GPT models · 5h Window', 'Claude and GPT models · Weekly Window'].map((name, index) => ({ name, total: 0, used: 0, percentScale: true, remainingPercentage: [7, 88.9, 100, 100][index], resetAt: new Date(Date.now() + (index + 1) * 36 * 60 * 60 * 1000).toISOString() })) }),
  account('unlimited', 'Unlimited account', { quotas: [{ name: 'Requests', unlimited: true, used: 10, remaining: null, total: null }] }),
  account('unknown', 'Unknown account', { quotas: [{ name: 'Unknown window', used: null, total: 0, remaining: null }] }),
  account('error', 'Error account', { error: 'Quota upstream timeout', quotas: [] }),
  account('disabled', 'An-account-with-a-very-long-name-that-must-wrap-without-overlap', { isActive: false, email: 'account-with-a-long-address@example.test', quotas: [{ name: 'Monthly credits', total: 100, used: 20, remaining: 80, recurring: false, resetAt: at }] }),
  account('many', 'Many windows', { plan: 'Test plan', quotas: Array.from({ length: 32 }, (_, index) => ({ name: `Bonus Pack ${index + 1}`, total: 100, used: index, remaining: 100 - index, recurring: false, resetAt: at })) }),
  account('cn', 'CN account', { provider: 'codebuddy-cn', providerName: 'CodeBuddy CN', quotas: [{ name: 'Total Points', total: 400, used: 125 }, { name: 'Monthly', total: 100, used: 25, recurring: true, giftPack: true }, { name: 'Bonus Pack 1', total: 200, used: 0, recurring: false }, { name: 'Bonus Pack 2', total: 100, used: 100, recurring: false }] }),
  account('global', 'Global account', { provider: 'codebuddy', providerName: 'CodeBuddy', quotas: [{ name: 'Monthly', total: 100, used: 2 }] }),
  account('qoder', 'Resource account', { provider: 'qoder', providerName: 'Qoder', quotas: [{ name: 'Resource Package', total: 900, used: 152, aggregate: true, summarizesDetail: true }, { name: 'Bonus Pack 1', total: 500, used: 100, detailOnly: true, recurring: false }, { name: 'Bonus Pack 2', total: 400, used: 52, detailOnly: true, recurring: false }] }),
  account('percent2', 'Another percentage account', { provider: 'antigravity', providerName: 'Antigravity', quotas: [{ name: 'Gemini', remainingPercentage: 80 }] }),
] };
const balances = { channelOptions: [{ id: 'zero', name: 'Zero Wallet', enabled: true }], channels: [{ id: 'zero', connections: [{ id: 'wallet', name: 'Wallet account', wallet: { amount: 0, currency: 'USD' }, checkedAt: at, stale: true }], subscriptions: [] }], errors: [] };
const calls = [];
const backend = http.createServer(async (request, response) => {
  let raw = ''; for await (const chunk of request) raw += chunk;
  calls.push({ url: request.url, method: request.method });
  const url = new URL(request.url, 'http://localhost');
  if (['/api/channel-balances', '/api/usage/quotas'].includes(url.pathname)) {
    const auth = await fetch(fixture.url + '/api/auth/status', { headers: { Cookie: request.headers.cookie || '' } }).then(result => result.json());
    response.setHeader('Content-Type', 'application/json');
    if (!auth.authenticated) { response.writeHead(401); return response.end('{"error":"Unauthorized"}'); }
    if (request.method === 'PATCH') balances.channelOptions[0].enabled = JSON.parse(raw).enabled;
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
Object.assign(process.env, { TENROUTER_INTERNAL_TARGET: `http://127.0.0.1:${backend.address().port}`, TENROUTER_DATA_MODE: 'demo', TENROUTER_ENABLE_MANAGEMENT: '1', TENROUTER_PORT: '4322', TENROUTER_HERMES_URL: '' });
const vite = fork(new URL('./hermes-vite-worker.mjs', import.meta.url), [], { windowsHide: true, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
const profile = await mkdtemp(join(tmpdir(), 'quota-cards-ui-'));
let browser;
let socket;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Vite startup timed out')), 60000); vite.once('message', () => { clearTimeout(timer); resolve(); }); vite.once('error', reject); });
  browser = spawn(process.env.HERMES_BROWSER_EXE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-proxy-server', '--remote-debugging-port=4332', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 40; i++) { try { targets = await fetch('http://127.0.0.1:4332/json/list').then(result => result.json()); break; } catch { await delay(100); } }
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
  await send('Page.navigate', { url: 'http://127.0.0.1:4322/dashboard/balances' }); await loaded;
  await until("document.querySelector('#login-password')"); await fill('#login-password', 'linear-demo'); await click('进入管理端');
  await until("document.querySelectorAll('.quota-card').length===11 && document.body.innerText.includes('0 USD')");
  assert.equal(await evaluate("document.querySelectorAll('.quota-provider-group').length"), 5);
  assert(await evaluate("[...document.querySelectorAll('.quota-provider-group')].every(group=>new Set([...group.querySelectorAll('.quota-provider')].map(item=>item.textContent)).size===1)"));
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Antigravity配额账号\"]').querySelectorAll('.quota-card').length"), 2);
  const main = ".quota-card[aria-label='Codex · Main account']";
  assert.deepEqual(await evaluate(`[...document.querySelectorAll(${JSON.stringify(main + ' [role=progressbar]')})].map(item=>Number(item.getAttribute('aria-valuenow')))`), [25, 0]);
  const percent = ".quota-card[aria-label='Antigravity · Percentage account']";
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(percent + ' [role=progressbar]')}).getAttribute('aria-valuenow')`), '7');
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(percent + ' .quota-amounts')})`), null);
  assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(percent + ' .quota-family-name')}).length`), 2);
  assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(percent + ' [role=progressbar]')}).length`), 4);
  const cn = ".quota-card[aria-label='CodeBuddy CN · CN account']";
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(cn + ' .quota-pool-amount strong')}).textContent`), '275');
  assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(cn + ' .quota-pool-segment')}).length`), 2);
  await evaluate(`document.querySelector(${JSON.stringify(cn + ' .quota-expand')}).click()`);
  await until("document.querySelectorAll('.quota-details-table tbody tr').length===2");
  await evaluate("document.querySelector('.quota-history input').click()");
  await until("document.querySelectorAll('.quota-details-table tbody tr').length===3");
  assert(!(await evaluate("document.querySelector('dialog[open]').innerText")).includes('Total Points'));
  await click('关闭'); await until("!document.querySelector('dialog[open]')");
  const qoder = ".quota-card[aria-label='Qoder · Resource account']";
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(qoder + ' .quota-pool-amount strong')}).textContent`), '748');
  assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(qoder + ' .quota-pool-segment')}).length`), 2);
  assert(await evaluate("document.querySelector('.quota-card[aria-label=\"Codex · Unlimited account\"]').innerText.includes('不限额')"));
  assert.equal(await evaluate("document.querySelector('.quota-card[aria-label=\"Codex · Unknown account\"] [role=progressbar]')"), null);
  assert(await evaluate("document.body.innerText.includes('Quota upstream timeout') && document.body.innerText.includes('已停用')"));
  const many = ".quota-card[aria-label='Codex · Many windows']";
  assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(many + ' .quota-window')}).length`), 3);
  await evaluate(`document.querySelector(${JSON.stringify(many + ' .quota-expand')}).focus();document.querySelector(${JSON.stringify(many + ' .quota-expand')}).click()`);
  await until("document.querySelectorAll('.quota-details-table tbody tr').length===32");
  assert(await evaluate("document.querySelector('dialog[open]').innerText.includes('到期') && document.querySelector('dialog[open]').innerText.includes('赠送包 32')"));
  assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(many + ' .quota-window')}).length`), 3);
  await click('关闭'); await until("!document.querySelector('dialog[open]')");
  await until(`document.activeElement===document.querySelector(${JSON.stringify(many + ' .quota-expand')})`);
  for (const [selector, expected] of [[main, '25%'], [percent, '7%'], [".quota-card[aria-label='Codex · Unlimited account']", '不限额'], [".quota-card[aria-label='Codex · Unknown account']", '比例未知']]) {
    await evaluate(`document.querySelector(${JSON.stringify(selector + ' .quota-expand')}).click()`);
    await until("document.querySelector('dialog[open]')");
    assert((await evaluate("document.querySelector('dialog[open]').innerText")).includes(expected));
    if (selector === percent) assert.deepEqual(await evaluate("[...document.querySelectorAll('.quota-details-table tbody td')].slice(1,3).map(item=>item.textContent.trim())"), ['—', '—']);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await until("!document.querySelector('dialog[open]')");
  }
  assert(await evaluate("document.querySelector('.quota-grid').getBoundingClientRect().top < [...document.querySelectorAll('h2')].find(item=>item.textContent==='供应商余额').getBoundingClientRect().top"));
  await evaluate("document.querySelector('input[aria-label=\"查询余额 Zero Wallet\"]').click()"); await until("document.body.innerText.includes('余额查询已关闭')");
  await evaluate("document.querySelector('input[aria-label=\"查询余额 Zero Wallet\"]').click()"); await until("document.body.innerText.includes('0 USD')");
  await click('刷新余额与配额'); await until("document.querySelector('.quota-groups').getAttribute('aria-busy')==='false'");
  assert(calls.some(call => call.url.includes('/api/usage/quotas?force=1')));
  for (const theme of ['light', 'dark']) {
    await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
    for (const width of [320, 375, 768, 1440]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: width < 600 ? 640 : 1000, deviceScaleFactor: 1, mobile: false }); await delay(150);
      assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'), `${theme}/${width}: overflow`);
      assert(await evaluate("[...document.querySelectorAll('.quota-card')].every(card=>card.scrollWidth<=card.clientWidth)"), `${theme}/${width}: card content overflow`);
      assert(await evaluate(`document.querySelector(${JSON.stringify(percent + ' .quota-windows')}).scrollHeight<=document.querySelector(${JSON.stringify(percent + ' .quota-windows')}).clientHeight`), `${theme}/${width}: four model windows must fit without scrolling`);
      assert(await evaluate("[...document.querySelectorAll('.quota-card')].every(card=>card.getBoundingClientRect().height===340)"), `${theme}/${width}: cards must share fixed height`);
      assert(await evaluate("[...document.querySelectorAll('.quota-provider-group')].every((group,index,groups)=>!index || group.getBoundingClientRect().top>=groups[index-1].getBoundingClientRect().bottom)"), `${theme}/${width}: provider groups must occupy separate rows`);
      const positions = await evaluate(`[...document.querySelectorAll('.quota-provider-group')].map(group=>group.getBoundingClientRect().top)`);
      await evaluate(`document.querySelector(${JSON.stringify(many + ' .quota-expand')}).click()`);
      await until("document.querySelectorAll('.quota-details-table tbody tr').length===32");
      if (width < 600) {
        const mobile = await evaluate("(() => {const rect=document.querySelector('dialog[open]').getBoundingClientRect();return {rect:rect.toJSON(),viewport:[innerWidth,innerHeight],nameFont:getComputedStyle(document.querySelector('.quota-details-table tbody th')).fontSize,valueFont:getComputedStyle(document.querySelector('.quota-detail-value')).fontSize};})()");
        assert(Math.abs(mobile.rect.width - mobile.viewport[0]) <= 16 && mobile.rect.height===mobile.viewport[1] && parseFloat(mobile.nameFont)>=15 && parseFloat(mobile.valueFont)>=20, `${theme}/${width}: full-screen details ${JSON.stringify(mobile)}`);
      }
      assert(await evaluate("[...document.querySelectorAll('.quota-card')].every(card=>card.getBoundingClientRect().height===340)"), `${theme}/${width}: expansion must preserve card heights`);
      assert.deepEqual(await evaluate("[...document.querySelectorAll('.quota-provider-group')].map(group=>group.getBoundingClientRect().top)"), positions, `${theme}/${width}: expansion must not move other groups`);
      const layout = await evaluate("(() => {const dialog=document.querySelector('dialog[open]');const list=dialog.querySelector('.quota-details-scroll');const rect=dialog.getBoundingClientRect();const footer=dialog.querySelector('.quota-details-footer').getBoundingClientRect();list.scrollTop=list.scrollHeight;const row=list.querySelector('tbody tr:last-child').getBoundingClientRect();const area=list.getBoundingClientRect();return {bounds:rect.toJSON(),footer:footer.toJSON(),row:row.toJSON(),area:area.toJSON(),dialogWidth:[dialog.scrollWidth,dialog.clientWidth],listWidth:[list.scrollWidth,list.clientWidth],scroll:[list.scrollHeight,list.clientHeight,list.scrollTop],valid:rect.left>=0 && rect.right<=innerWidth && rect.top>=0 && rect.bottom<=innerHeight && dialog.scrollWidth<=dialog.clientWidth && list.scrollWidth<=list.clientWidth && list.scrollHeight>list.clientHeight && list.scrollTop>0 && row.bottom<=area.bottom+1 && footer.top>=area.bottom && footer.bottom<=rect.bottom};})()");
      if (!layout.valid) { const shot = await send('Page.captureScreenshot', { format: 'png' }); await writeFile('C:/Users/20449/.codex/tmp/quota-dialog-failure.png', Buffer.from(shot.data, 'base64')); }
      assert(layout.valid, `${theme}/${width}: dialog layout ${JSON.stringify(layout)}`);
      await evaluate("document.querySelector('.quota-details-scroll').scrollTop=0");
      await until("document.querySelector('.quota-details-account img')?.complete && document.querySelector('.quota-details-account img').naturalWidth>0");
      const expandedShot = await send('Page.captureScreenshot', { format: 'png' });
      await writeFile(`C:/Users/20449/.codex/tmp/quota-cards-expanded-${width}-${theme}.png`, Buffer.from(expandedShot.data, 'base64'));
      await click('关闭'); await until("!document.querySelector('dialog[open]')");
      await evaluate('window.scrollTo(0,0)');
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      await writeFile(`C:/Users/20449/.codex/tmp/quota-cards-${width}-${theme}.png`, Buffer.from(shot.data, 'base64'));
    }
  }
  await fill('input[aria-label="搜索余额账号"]', 'long-address'); await until("document.querySelectorAll('.quota-card').length===1");
  await fill('input[aria-label="搜索余额账号"]', 'no-such-account'); await until("document.body.innerText.includes('没有匹配的配额账号')");
  assert.deepEqual(errors, []);
  console.log('PASS fixture quota cards (simulated data): family windows, resource segments/totals/history, fixed height, 32-row dialog, unknown/unlimited, Escape/focus, four widths/light-dark, wallet/refresh/search');
  for (const [path, title] of [['endpoint', '端点与接入'], ['models', '模型'], ['logs', '请求日志'], ['monitor', '模型检测'], ['combos', '组合模型'], ['overview', '概览'], ['usage', '用量统计'], ['balances', '余额与配额']]) {
    await evaluate(`document.querySelector('.nav-item[href="/dashboard/${path}"]').click()`);
    await until(`document.querySelector('main h1')?.textContent===${JSON.stringify(title)}`);
    await until("[...document.querySelectorAll('.heading-actions button')].some(item=>!item.disabled)");
    if (path === 'overview' || path === 'usage') await until("document.querySelectorAll('.token-cache-chart .recharts-area-curve').length===4");
    if (path === 'monitor') await until("document.querySelector('.monitor-runtime')");
    if (path === 'balances') await until("document.querySelectorAll('.quota-card').length===11");
  }
  assert.deepEqual(errors, []);
  console.log('PASS lazy routes: core pages, monitor, combos, overview/usage charts, return to quota cards');
} finally {
  socket?.close(); browser?.kill();
  if (vite.exitCode === null) await new Promise(resolve => { const timer = setTimeout(() => vite.kill(), 10000); vite.once('exit', () => { clearTimeout(timer); resolve(); }); vite.send('close'); });
  backend.closeAllConnections(); await new Promise(resolve => backend.close(resolve)); await fixture.close();
}

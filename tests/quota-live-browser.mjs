import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isSpentPack, quotaPool } from '../src/components/quotaPresentation.js';

const base = process.env.PREVIEW_URL || 'http://localhost:4317';
let cookie;
if (process.env.TENROUTER_TEST_COOKIE_FILE) cookie = (await readFile(process.env.TENROUTER_TEST_COOKIE_FILE, 'utf8')).trim();
else {
  let password;
  if (process.argv.includes('--password-stdin')) {
    let input = ''; for await (const chunk of process.stdin) input += chunk;
    password = input.trim();
  } else {
    const loginEnv = parseEnv(await readFile(process.env.TENROUTER_TEST_LOGIN_ENV || 'R:/10router/.env', 'utf8'));
    password = loginEnv.INITIAL_PASSWORD?.trim();
  }
  assert(password, 'Configured login credential is missing');
  const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ password }) });
  assert.equal(login.status, 200, `Login failed (HTTP ${login.status}, Retry-After ${login.headers.get('retry-after') || 'not supplied'}); no retry was attempted`);
  cookie = login.headers.get('set-cookie')?.split(';')[0];
}
assert(cookie?.startsWith('auth_token='), 'Login did not issue a session');
const auth = await fetch(`${base}/api/auth/status`, { headers: { Cookie: cookie } }).then(result => result.json());
assert(auth.authenticated && !auth.demo, 'Real gateway session required');
console.log('Authenticated real gateway session; starting live quota browser checks');
const profile = await mkdtemp(join(tmpdir(), 'quota-live-ui-'));
const browser = spawn(process.env.HERMES_BROWSER_EXE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-proxy-server', '--remote-debugging-port=4344', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
  let targets;
  for (let i = 0; i < 40; i++) { try { targets = await fetch('http://127.0.0.1:4344/json/list').then(result => result.json()); break; } catch { await delay(100); } }
  assert(targets?.length, 'Browser did not start');
  socket = new WebSocket(targets.find(target => target.url === 'about:blank').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  const pending = new Map(); const errors = []; const responses = []; let sequence = 0;
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const task = pending.get(message.id);
      if (task) { pending.delete(message.id); clearTimeout(task.timer); message.error ? task.reject(new Error(JSON.stringify(message.error))) : task.resolve(message.result); }
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(argument => argument.value || argument.description).join(' '));
    if (message.method === 'Network.responseReceived' && new URL(message.params.response.url).pathname === '/api/usage/quotas') responses.push({ requestId: message.params.requestId, status: message.params.response.status, url: message.params.response.url });
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 30000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const until = async expression => { for (let i = 0; i < 900; i++) { if (await evaluate(`!!(${expression})`)) return; await delay(100); } throw new Error(`Timed out: ${expression}`); };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setCookie', { name: 'auth_token', value: cookie.slice('auth_token='.length), url: base, httpOnly: true, sameSite: 'Lax' });
  await send('Page.navigate', { url: `${base}/dashboard/balances` });
  await until("document.querySelectorAll('.quota-card').length>0 && document.querySelector('.quota-groups')?.getAttribute('aria-busy')==='false'");
  assert(responses.length, 'No real quota response was received');
  const response = responses.at(-1); assert.equal(response.status, 200);
  const payload = await send('Network.getResponseBody', { requestId: response.requestId });
  const data = JSON.parse(payload.base64Encoded ? Buffer.from(payload.body, 'base64').toString('utf8') : payload.body);
  assert(data.connections?.length, 'No real accounts returned');
  assert.equal(await evaluate("document.querySelectorAll('.quota-card').length"), data.connections.length);
  assert(await evaluate("[...document.querySelectorAll('.quota-provider-group')].every(group=>new Set([...group.querySelectorAll('.quota-provider')].map(item=>item.textContent)).size===1)"));
  const details = data.connections.filter(connection => connection.quotas?.length && !connection.error);
  const longest = [...details].sort((a, b) => b.quotas.length - a.quotas.length)[0];
  const examples = [longest, details.find(connection => connection.provider === 'antigravity'), details.find(connection => connection.provider?.startsWith('codebuddy')), details.find(connection => connection.provider?.startsWith('qoder'))].filter((connection, index, rows) => connection && rows.findIndex(row => row?.id === connection.id) === index);
  assert(longest, 'No real quota windows available');
  for (const [width, height] of [[1440, 1000], [375, 812], [320, 640]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    for (const theme of ['light', 'dark']) {
      await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
      assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Page overflow');
      for (const connection of examples) {
        const name = `${connection.providerName} · ${connection.name || '未命名账号'}`;
        const selector = `.quota-card[aria-label=${JSON.stringify(name)}]`;
        await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);
        await until(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return r.top>=0 && r.bottom<=innerHeight;})()`);
        await until(`(() => {const img=document.querySelector(${JSON.stringify(selector)}).querySelector('img');return !img || img.complete && img.naturalWidth>0;})()`);
        const cardLayout = await evaluate(`(() => {const card=document.querySelector(${JSON.stringify(selector)});return {horizontal:card.scrollWidth>card.clientWidth,height:card.getBoundingClientRect().height,windows:card.querySelector('.quota-windows').scrollHeight<=card.querySelector('.quota-windows').clientHeight};})()`);
        assert(!cardLayout.horizontal && cardLayout.height===340, JSON.stringify(cardLayout));
        if (connection.provider === 'antigravity' && connection.quotas.length<=4) assert(cardLayout.windows, 'Real model windows must fit without scrolling');
        const cardShot = await send('Page.captureScreenshot', { format: 'png' });
        await writeFile(`C:/Users/20449/.codex/tmp/quota-real-card-${connection.provider}-${width}-${theme}.png`, Buffer.from(cardShot.data, 'base64'));
        const pool = quotaPool(connection);
        const detailRows = pool?.detail || connection.quotas;
        const visibleRows = pool ? detailRows.filter(row=>!isSpentPack(row)) : detailRows;
        await evaluate(`(() => {const card=[...document.querySelectorAll('.quota-card')].find(item=>item.getAttribute('aria-label')===${JSON.stringify(name)});card.querySelector('.quota-expand').focus();card.querySelector('.quota-expand').click();})()`);
        await until(`document.querySelectorAll('.quota-details-table tbody tr').length===${visibleRows.length}`);
        if (visibleRows.length!==detailRows.length) {
          await evaluate("document.querySelector('.quota-history input').click()");
          await until(`document.querySelectorAll('.quota-details-table tbody tr').length===${detailRows.length}`);
        }
        const layout = await evaluate("(() => {const dialog=document.querySelector('dialog[open]');const list=dialog.querySelector('.quota-details-scroll');const r=dialog.getBoundingClientRect();return {width:r.width,height:r.height,left:r.left,right:r.right,top:r.top,bottom:r.bottom,horizontal:list.scrollWidth>list.clientWidth,nameFont:parseFloat(getComputedStyle(list.querySelector('tbody th')).fontSize),valueFont:parseFloat(getComputedStyle(list.querySelector('.quota-detail-value')).fontSize)};})()");
        assert(!layout.horizontal && layout.left>=0 && layout.right<=width && layout.top>=0 && layout.bottom<=height, JSON.stringify(layout));
        if (width<600) assert(layout.height===height && layout.nameFont>=15 && layout.valueFont>=20);
        await until("document.querySelector('.quota-details-account img')?.complete && document.querySelector('.quota-details-account img').naturalWidth>0");
        await delay(100);
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        await writeFile(`C:/Users/20449/.codex/tmp/quota-real-${connection.provider}-${width}-${theme}.png`, Buffer.from(shot.data, 'base64'));
        await evaluate("document.querySelector('.quota-details-scroll').scrollTop=document.querySelector('.quota-details-scroll').scrollHeight");
        assert(await evaluate("(() => {const list=document.querySelector('.quota-details-scroll');const last=list.querySelector('tbody tr:last-child').getBoundingClientRect();return last.bottom<=list.getBoundingClientRect().bottom+1;})()"), 'Last real window is not reachable');
        await evaluate("document.querySelector('.quota-details-footer button').click()");
        await until("!document.querySelector('dialog[open]')");
        await until(`document.activeElement===document.querySelector(${JSON.stringify(selector + ' .quota-expand')})`);
      }
    }
  }
  assert.deepEqual(errors, []);
  const report = { captured_at: new Date().toISOString(), generated_at: data.generatedAt, real_request: response.url, status: response.status, accounts: data.connections.length, providers: [...new Set(data.connections.map(connection=>connection.provider))], detail_rows: examples.map(connection=>({provider:connection.provider,rows:connection.quotas.length})), checked_widths:[1440,375,320], themes:['light','dark'], screenshot_prefix:'C:/Users/20449/.codex/tmp/quota-real-', exceptions:errors.length };
  await writeFile('C:/Users/20449/.codex/tmp/quota-live-acceptance.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { socket?.close(); browser.kill(); }

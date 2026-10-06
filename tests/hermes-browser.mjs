import assert from 'node:assert/strict';
import http from 'node:http';
import { fork, spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startFixtureServer } from '../scripts/fixture-server.mjs';
import { createHermesBridge } from '../scripts/hermes-bridge.mjs';

const fixture = await startFixtureServer();
const calls = [];
let current = '美国 · VLESS · 住宅节点';
const names = [current, '日本 · Hysteria2 · 高速节点', '未知 · 尚未检测节点'];
let globalCurrent = '机场';
let airports = [{ id: 'original', name: '机场', group: '机场', masked_url: 'https://example.test/***', updated_at: new Date().toISOString() }];
const loaded = new Set(['机场']);
const watch = { 'ai-谷歌': { observe_only: true, pending_alert: { kind: 'would-switch', to: names[0], detail: '隔离测试告警' } }, 'AI-优选': { observe_only: false, pending_alert: {} } };
let updateFailure = false;
let deleteFailure = false;
let tickFailure = false;
const groups = () => [
  { name: '机场', type: 'Selector', is_airport: true, now: current, member_count: 3 },
  { name: 'GLOBAL', type: 'Selector', now: globalCurrent, member_count: loaded.size },
  { name: 'ai-谷歌', type: 'Selector', now: current, member_count: 3 },
  { name: 'AI-优选', type: 'URLTest', now: names[1], member_count: 2 },
  ...airports.filter(item => item.group !== '机场' && loaded.has(item.group)).map(item => ({ name: item.group, type: 'Selector', is_airport: true, now: current, member_count: 3 })),
];
const hermes = http.createServer(async (request, response) => {
  calls.push(request.url);
  let raw = '';
  for await (const chunk of request) raw += chunk;
  response.setHeader('Content-Type', 'application/json');
  const send = data => response.end(JSON.stringify(data));
  const url = new URL(request.url, 'http://localhost');
  const data = raw ? JSON.parse(raw) : {};
  if (url.pathname.endsWith('/subscription/status')) return send({ airports, config_mtime: new Date().toISOString() });
  if (url.pathname.endsWith('/airports')) { airports.push({ id: 'new-airport', name: data.name, group: data.group || data.name, subscription_mode: data.subscription_mode, masked_url: 'https://new.example.test/***', updated_at: new Date().toISOString() }); return send({ success: true, airports }); }
  if (url.pathname.endsWith('/subscription/save')) { airports.find(item => item.id === data.airport_id).masked_url = 'https://edited.example.test/***'; return send({ success: true, airports }); }
  if (url.pathname.endsWith('/subscription/update')) {
    if (updateFailure) return send({ success: false, error: '隔离重载失败', stage: 'reload', rolled_back: false, backup: '/test/config.bak-update' });
    loaded.add(airports.find(item => item.id === data.airport_id).group); return send({ success: true, airports, backup: '/test/config.bak-update', warning: '隔离更新提示' });
  }
  if (/\/airports\/[^/]+\/delete$/.test(url.pathname)) {
    if (deleteFailure) return send({ success: false, error: '隔离删除失败', rolled_back: true, backup: '/test/config.bak-delete' });
    const id = url.pathname.split('/').at(-2); const item = airports.find(item => item.id === id);
    loaded.delete(item.group); airports = airports.filter(item => item.id !== id); if (globalCurrent === item.group) globalCurrent = '机场';
    return send({ success: true, airports, backup: '/test/config.bak-delete' });
  }
  if (url.pathname.includes('/proxy/failover/')) {
    const state = watch[data.group];
    if (url.pathname.endsWith('/observe')) { state.observe_only = data.observe_only; return send(state); }
    if (url.pathname.endsWith('/ack')) { state.pending_alert = {}; return send(state); }
    if (url.pathname.endsWith('/tick')) return send({ ok: !tickFailure, action: tickFailure ? 'probe-failed' : 'probe-ok', detail: tickFailure ? '隔离探测失败' : 'ok' });
  }
  if (url.pathname.endsWith('/proxy/groups')) return send({ groups: groups(), entry_ports: { mixed: 7890, listeners: [{ port: 7891, name: 'ai-tw', proxy: 'ai-谷歌' }, { port: 7892, name: 'ai-best', proxy: 'AI-优选' }] } });
  if (url.pathname.endsWith('/proxy/status')) { const group = url.searchParams.get('group') || '机场'; return send({ group, type: groups().find(item => item.name === group)?.type, now: group === 'GLOBAL' ? globalCurrent : current, active_airport: globalCurrent, mode: 'rule', nodes: names.map((name, index) => ({ name, type: index === 1 ? 'Hysteria2' : 'VLESS', alive: index === 2 ? null : true, delay: index === 2 ? null : 120 + index * 30 })) }); }
  if (url.pathname.endsWith('/proxy/select')) { if (data.group === 'GLOBAL') globalCurrent = data.name; else current = data.name; return send({ success: true }); }
  if (url.pathname.endsWith('/proxy/delay')) return send({ success: true, delay: 87 });
  if (url.pathname.endsWith('/proxy/failover')) return send({ current, ...watch[url.searchParams.get('group')], consecutive_failures: 0, last_probe: { time: new Date().toISOString(), ok: true }, last_switch: {} });
  if (url.pathname.endsWith('/egress-ip')) return send({ ip: '203.0.113.10', country: '测试位置', city: '测试城市', checked_at: new Date().toISOString(), probe_url: 'https://ipinfo.io/json' });
  if (url.pathname.endsWith('/mem0-health')) return send({ checked_at: new Date().toISOString(), memory_count: 123, components: [{ name: 'LLM', ok: true, latency_ms: 200, status: 200, detail: 'test-model' }, { name: 'Embedder', ok: true, latency_ms: 80, status: 200, detail: 'test-embedding' }, { name: 'Reranker', ok: false, latency_ms: 30, status: 429, detail: '请求过于频繁' }, { name: 'Qdrant', ok: true, latency_ms: 2, status: 200, detail: '123 条' }] });
  if (url.pathname.endsWith('/icarus-health')) return send({ checked_at: new Date().toISOString(), fabric_count: 6, components: [{ name: '配置', ok: true, latency_ms: 0, status: 200, detail: 'test-model' }, { name: 'API Key', ok: true, latency_ms: 0, status: 200, detail: '已配置' }, { name: 'LLM 端点', ok: true, latency_ms: 250, status: 200, detail: 'localhost' }, { name: 'fabric 目录', ok: true, latency_ms: 0, status: 200, detail: '最近有产出' }, { name: 'Qdrant 同步', ok: true, latency_ms: 0, status: 200, detail: '最近记忆 1 小时前' }] });
  response.writeHead(404); send({ error: 'not found' });
});
await new Promise(resolve => hermes.listen(0, '127.0.0.1', resolve));
process.env.TENROUTER_INTERNAL_TARGET = fixture.url;
process.env.TENROUTER_DATA_MODE = 'demo';
process.env.TENROUTER_ENABLE_MANAGEMENT = '1';
process.env.TENROUTER_PORT = '4320';
process.env.TENROUTER_HERMES_URL = `http://127.0.0.1:${hermes.address().port}`;
process.env.TENROUTER_HERMES_TOKEN = 'isolated-test-token';
// Keep the browser driver responsive while Vite scans the shared filesystem.
const vite = fork(new URL('./hermes-vite-worker.mjs', import.meta.url), [], { windowsHide: true, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Vite worker startup timed out')), 60000);
  vite.once('message', message => { clearTimeout(timer); message.ready ? resolve() : reject(new Error('Vite worker did not start')); });
  vite.once('error', error => { clearTimeout(timer); reject(error); });
  vite.once('exit', code => { clearTimeout(timer); reject(new Error(`Vite worker exited: ${code}`)); });
});
const profile = await mkdtemp(join(tmpdir(), 'hermes-ui-'));
const edge = spawn(process.env.HERMES_BROWSER_EXE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-proxy-server', '--remote-debugging-port=4330', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
let liveServer;
try {
  let targets;
  for (let i = 0; i < 40; i++) { try { targets = await fetch('http://127.0.0.1:4330/json/list').then(response => response.json()); break; } catch { await delay(100); } }
  assert(targets, 'Browser did not start');
  socket = new WebSocket((targets.find(target => target.type === 'page' && target.url === 'about:blank') || targets.find(target => target.type === 'page')).webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  const pending = new Map(); let sequence = 0; const errors = [];
  socket.addEventListener('message', event => { const data = JSON.parse(event.data); if (data.id) { const task = pending.get(data.id); pending.delete(data.id); if (task) { clearTimeout(task.timer); data.error ? task.reject(new Error(JSON.stringify(data.error))) : task.resolve(data.result); } } if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text); });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser command timed out: ${method} ${params.expression || ''}`)); }, 20000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
  const until = async expression => { for (let i = 0; i < 120; i++) { if (await evaluate(`!!(${expression})`)) return; await delay(100); } throw new Error(`Timed out: ${expression}\n${await evaluate('document.body.innerText')}`); };
  const click = label => evaluate(`(() => { const button=Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()===${JSON.stringify(label)} || button.getAttribute('aria-label')===${JSON.stringify(label)}); if(!button || button.disabled) throw new Error('Missing/disabled button'); button.click(); })()`);
  const fill = async (label, value) => {
    await evaluate(`Array.from(document.querySelectorAll('.editor-form label')).find(item=>item.textContent.trim()===${JSON.stringify(label)}).querySelector('input').focus()`);
    await send('Input.insertText', { text: value });
  };
  const screenshots = async section => {
    for (const [width, height, theme] of [[1440, 1000, 'light'], [1440, 1000, 'dark'], [375, 812, 'light']]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`); await delay(150);
      assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'), `${section} overflows viewport`);
      assert(await evaluate("Array.from(document.querySelectorAll('dialog[open]')).every(item=>{const r=item.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight;})"), `${section} dialog exceeds viewport`);
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      await writeFile(`C:/Users/20449/.codex/tmp/${section}-${width}-${theme}.png`, Buffer.from(shot.data, 'base64'));
    }
  };
  const navigate = async path => {
    const started = performance.now();
    const loaded = new Promise((resolve, reject) => {
      const listener = event => {
        if (JSON.parse(event.data).method !== 'Page.loadEventFired') return;
        clearTimeout(timer); socket.removeEventListener('message', listener); resolve();
      };
      const timer = setTimeout(() => { socket.removeEventListener('message', listener); reject(new Error(`Page load timed out: ${path}`)); }, 90000);
      socket.addEventListener('message', listener);
    });
    await send('Page.navigate', { url: 'http://127.0.0.1:4320' + path });
    await loaded;
    await until("document.readyState==='complete' && document.querySelector('h1')");
    console.log(`PAGE ${path}: ${Math.round(performance.now() - started)} ms`);
    console.log('NAV ' + JSON.stringify(await evaluate("performance.getEntriesByType('navigation').map(entry=>({ttfb_ms:Math.round(entry.responseStart),load_ms:Math.round(entry.loadEventEnd)}))")));
  };
  await send('Runtime.enable'); await send('Page.enable');
  await navigate('/dashboard/proxy');
  await until("!!document.querySelector('#login-password')");
  await evaluate("document.querySelector('#login-password').focus()");
  await send('Input.insertText', { text: 'linear-demo' });
  await click('进入管理端');
  await until("document.querySelector('.proxy-table') && document.body.innerText.includes('尚未检测节点')");
  assert.equal(calls.filter(path => path.includes('health') || path.includes('egress-ip')).length, 0, 'Opening proxy page must not start active probes');
  const proxyRequests = await evaluate("performance.getEntriesByType('resource').filter(item=>item.name.includes('/api/hermes/')).map(item=>new URL(item.name).pathname+new URL(item.name).search)");
  console.log('PROXY requests: ' + JSON.stringify(proxyRequests));
  await click(`测速 ${names[2]}`);
  await until("document.body.innerText.includes('87 ms')");
  await click(`选择 ${names[1]}`);
  await until("!!document.querySelector('dialog[open]')");
  await click('确认切换');
  await until("document.body.innerText.includes('已切换') && !document.querySelector('dialog[open]')");
  assert.equal(current, names[1]);
  await click('检测端口 7891 出口');
  await until("document.body.innerText.includes('203.0.113.10')");
  for (const [width, height, theme] of [[1440, 1000, 'light'], [1440, 1000, 'dark'], [375, 812, 'light']]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`); await delay(150);
    assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Proxy page overflows viewport');
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(`C:/Users/20449/.codex/tmp/proxy-${width}-${theme}.png`, Buffer.from(shot.data, 'base64'));
  }
  await click('机场与订阅');
  await until("document.body.innerText.includes('https://example.test/***')");
  await click('添加机场');
  await fill('机场名称', '测试机场'); await fill('代理组名称', '测试组'); await fill('订阅地址', 'https://new.example.test/private-subscription');
  await screenshots('subscription-editor');
  const beforeAdd = calls.filter(path => path.includes('subscription/update') || path.includes('proxy/select')).length;
  await click('保存');
  await until("!document.querySelector('dialog[open]') && document.body.innerText.includes('待更新节点')");
  assert.equal(calls.filter(path => path.includes('subscription/update') || path.includes('proxy/select')).length, beforeAdd, 'Add must not update or select automatically');
  assert(!await evaluate("document.body.innerText.includes('private-subscription')"));
  await click('编辑订阅 测试机场');
  assert.equal(await evaluate("document.querySelector('input[type=password]').value"), '', 'Editor must not prefill masked or raw subscription');
  await fill('订阅地址', 'https://edited.example.test/private-subscription'); await click('保存');
  await until("!document.querySelector('dialog[open]') && document.body.innerText.includes('https://edited.example.test/***')");
  updateFailure = true;
  await click('更新节点 测试机场'); await click('确认操作');
  await until("document.body.innerText.includes('配置回滚未成功') && document.body.innerText.includes('失败阶段：配置重载') && document.body.innerText.includes('重新执行')");
  assert.equal(loaded.has('测试组'), false, 'Failed reload must not mark nodes loaded');
  updateFailure = false; await click('重新执行');
  await until("!document.querySelector('dialog[open]') && document.body.innerText.includes('节点已加载') && document.body.innerText.includes('/test/config.bak-update')");
  await click('应用机场 测试机场'); await click('确认操作');
  await until("!document.querySelector('dialog[open]') && document.body.innerText.includes('测试机场：已应用')");
  assert.equal(globalCurrent, '测试组');
  await screenshots('subscriptions');
  await navigate('/dashboard/proxy?view=subscriptions&group=' + encodeURIComponent('测试组'));
  await until("document.querySelector('[aria-label=\"删除机场 测试机场\"]:not(:disabled)')");
  deleteFailure = true;
  await click('删除机场 测试机场'); await click('确认操作');
  await until("document.body.innerText.includes('配置已回滚') && document.body.innerText.includes('重新执行')");
  assert(airports.some(item => item.id === 'new-airport'));
  deleteFailure = false; await click('重新执行');
  await until("!document.querySelector('dialog[open]') && document.body.innerText.includes('测试机场：已删除')");
  assert.equal(airports.length, 1);
  assert.equal(await evaluate("new URL(location.href).searchParams.has('group')"), false, 'Deleting the viewed group clears the stale selection');
  await click('添加机场');
  await fill('机场名称', '一次性机场'); await fill('订阅地址', 'https://new.example.test/unused');
  await evaluate("(() => { const select = document.querySelector('dialog select'); const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(select, 'one_time'); select.dispatchEvent(new Event('change', { bubbles: true })); })()");
  await click('保存');
  await until("!document.querySelector('dialog[open]') && document.body.innerText.includes('一次性订阅')");
  const beforeImport = calls.filter(path => path.includes('subscription/update')).length;
  await click('重新导入 一次性机场');
  await until("!!document.querySelector('dialog[open]')");
  assert.equal(calls.filter(path => path.includes('subscription/update')).length, beforeImport, 'Opening one-time import must not fetch the used link');
  assert.equal(await evaluate("document.querySelector('input[type=password]').value"), '');
  assert.equal(await evaluate("Array.from(document.querySelectorAll('dialog button')).find(b=>b.textContent.includes('导入节点')).disabled"), true);
  await screenshots('one-time-import');
  await fill('新订阅地址', 'https://new.example.test/fresh'); await click('导入节点');
  await until("!document.querySelector('dialog[open]') && document.body.innerText.includes('节点已导入并保存')");
  assert.equal(calls.filter(path => path.includes('subscription/update')).length, beforeImport + 1);
  await click('删除机场 一次性机场'); await click('确认操作');
  await until("!document.querySelector('dialog[open]') && !document.querySelector('.proxy-table tbody').innerText.includes('一次性机场')");
  await click('故障看护');
  await until("document.querySelectorAll('.proxy-watch input:not(:disabled)').length === 2");
  const switchBefore = calls.filter(path => path.endsWith('/proxy/failover/observe')).length;
  await evaluate("document.querySelector('input[aria-label=\"自动切换 ai-谷歌\"]').click()");
  await until("!!document.querySelector('dialog[open]')");
  assert.equal(calls.filter(path => path.endsWith('/proxy/failover/observe')).length, switchBefore);
  await screenshots('watch-confirm');
  await click('确认操作');
  await until("!document.querySelector('dialog[open]') && document.querySelector('input[aria-label=\"自动切换 ai-谷歌\"]').checked");
  assert.equal(watch['ai-谷歌'].observe_only, false);
  const clickWatch = label => evaluate(`(() => {const section=Array.from(document.querySelectorAll('.proxy-watch')).find(item=>item.querySelector('h3').textContent==='ai-谷歌');const button=Array.from(section.querySelectorAll('button')).find(item=>item.textContent.trim()===${JSON.stringify(label)});if(!button || button.disabled)throw new Error('Missing/disabled watch button');button.click();})()`);
  await clickWatch('采用建议'); await click('确认操作');
  await until("!document.querySelector('dialog[open]') && document.body.innerText.includes('已切换到')");
  assert.equal(current, names[0]);
  await clickWatch('确认告警');
  await until("!document.body.innerText.includes('隔离测试告警')");
  tickFailure = true; await clickWatch('检查当前节点'); await click('确认操作');
  await until("document.body.innerText.includes('隔离探测失败')");
  tickFailure = false; await click('确认操作');
  await until("!document.querySelector('dialog[open]') && document.body.innerText.includes('节点探测正常')");
  await screenshots('watch');
  assert.deepEqual(errors, []);
  console.log('PASS subscriptions/watch: add without auto-apply, blank URL edit, reload failure and retry, backup/warnings, apply readback, delete rollback, confirmed mode, adopt/ack, failed/manual tick, desktop/mobile dialogs');
  await navigate('/dashboard/providers/antigravity');
  await until("!!document.querySelector('.provider-proxy-link')");
  await until("!!document.querySelector('.provider-mark img') && document.querySelector('.provider-mark img').complete && document.querySelector('.provider-mark img').naturalWidth > 0");
  assert((await evaluate("document.querySelector('.provider-proxy-link').getAttribute('href')")).includes('group=ai-'));
  await navigate('/dashboard/chain-health');
  await until("document.body.innerText.includes('尚无检测记录')");
  const iconModules = await evaluate("performance.getEntriesByType('resource').filter(item=>item.name.includes('/assets/providers/') && item.name.includes('?import')).length");
  assert.equal(iconModules, 0, 'Health page must not load unused provider icons');
  assert.equal(calls.filter(path => path.includes('health')).length, 0);
  await click('刷新记录'); await delay(200);
  assert.equal(calls.filter(path => path.includes('health')).length, 0);
  await click('检测链路');
  await until("document.body.innerText.includes('请求过于频繁') && document.body.innerText.includes('记忆较新')");
  await click('刷新记录'); await delay(200);
  assert.equal(calls.filter(path => path.includes('health')).length, 2);
  for (const [width, height, theme] of [[1440, 1000, 'light'], [1440, 1000, 'dark'], [375, 812, 'light']]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`); await delay(150);
    assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Health page overflows viewport');
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(`C:/Users/20449/.codex/tmp/chain-health-${width}-${theme}.png`, Buffer.from(shot.data, 'base64'));
  }
  await evaluate("fetch('/api/auth/logout',{method:'POST'})");
  await click('刷新记录');
  await until("!!document.querySelector('#login-password')");
  assert.deepEqual(errors, []);
  console.log('PASS browser: node probe, verified switch, egress probe, provider mapping, manual-only health, session expiry, desktop/mobile light/dark, no uncaught exceptions');

  // Exercise the existing live Hermes APIs through the adapter, with an isolated gateway session.
  const login = await fetch(`${fixture.url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"password":"linear-demo"}' });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const liveBridge = createHermesBridge({ backendUrl: fixture.url, hermesUrl: 'http://192.168.11.150:8888', tokenFile: 'R:/.hermes/dashboard_token', management: true });
  liveServer = http.createServer((request, response) => liveBridge(request, response));
  await new Promise(resolve => liveServer.listen(0, '127.0.0.1', resolve));
  const liveUrl = `http://127.0.0.1:${liveServer.address().port}`;
  const liveGroups = await fetch(`${liveUrl}/api/hermes/proxy/groups`, { headers: { Cookie: cookie } });
  assert.equal(liveGroups.status, 200);
  const liveData = await liveGroups.json(); assert(liveData.groups.length > 0);
  const liveStatus = await fetch(`${liveUrl}/api/hermes/proxy/status`, { headers: { Cookie: cookie } }); assert.equal(liveStatus.status, 200); assert((await liveStatus.json()).nodes.length > 0);
  const liveSubscriptions = await fetch(`${liveUrl}/api/hermes/subscription/status`, { headers: { Cookie: cookie } }); assert.equal(liveSubscriptions.status, 200);
  const subscriptionData = await liveSubscriptions.json(); assert(Array.isArray(subscriptionData.airports)); assert(subscriptionData.airports.every(item => !('url' in item)));
  for (const group of ['ai-谷歌', 'AI-优选']) {
    const liveWatch = await fetch(`${liveUrl}/api/hermes/proxy/failover?group=${encodeURIComponent(group)}`, { headers: { Cookie: cookie } }); assert.equal(liveWatch.status, 200); assert.equal(typeof (await liveWatch.json()).observe_only, 'boolean');
  }
  if (process.argv.includes('--live-health')) {
    const probe = await fetch(`${liveUrl}/api/hermes/health/check`, { method: 'POST', headers: { Cookie: cookie }, body: '{}' });
    assert.equal(probe.status, 200);
    const data = await probe.json();
    assert(data.mem0.components?.length && data.icarus.components?.length);
    console.log('LIVE health: ' + JSON.stringify({ mem0: data.mem0.components.map(component => ({ name: component.name, ok: component.ok, status: component.status })), icarus: data.icarus.components.map(component => ({ name: component.name, ok: component.ok, status: component.status })) }));
  }
  console.log(`PASS live Hermes adapter: ${liveData.groups.length} groups, nonempty node list; production node selection unchanged`);
} finally {
  socket?.close(); edge.kill();
  if (liveServer) { liveServer.closeAllConnections(); await new Promise(resolve => liveServer.close(resolve)); }
  if (vite.exitCode === null) await new Promise(resolve => {
    const timer = setTimeout(() => vite.kill(), 10000);
    vite.once('exit', () => { clearTimeout(timer); resolve(); }); vite.send('close');
  });
  hermes.closeAllConnections(); await new Promise(resolve => hermes.close(resolve)); await fixture.close();
}

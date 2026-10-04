import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHermesBridge } from '../scripts/hermes-bridge.mjs';
import { startFixtureServer } from '../scripts/fixture-server.mjs';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4317';
const fixture = await startFixtureServer();
const login = await fetch(`${fixture.url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"password":"linear-demo"}' });
const headers = { Cookie: login.headers.get('set-cookie').split(';')[0] };
const bridge = createHermesBridge({ backendUrl: fixture.url, hermesUrl: 'http://192.168.11.150:8888', tokenFile: 'R:/.hermes/dashboard_token', management: false });
const probe = http.createServer((request, response) => bridge(request, response));
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const profile = await mkdtemp(join(tmpdir(), 'proxy-perf-'));
const browser = spawn(process.env.HERMES_BROWSER_EXE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-proxy-server', '--remote-debugging-port=4334', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
  let targets;
  for (let i = 0; i < 40; i++) { try { targets = await fetch('http://127.0.0.1:4334/json/list').then(result => result.json()); break; } catch { await delay(100); } }
  assert(targets?.length, 'Browser did not start');
  socket = new WebSocket(targets.find(target => target.url === 'about:blank').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  const pending = new Map(); const errors = []; const api = []; let sequence = 0; let activeReads = 0;
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 30000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  socket.addEventListener('message', async event => {
    const data = JSON.parse(event.data);
    if (data.id) { const job = pending.get(data.id); if (job) { pending.delete(data.id); clearTimeout(job.timer); data.error ? job.reject(new Error(JSON.stringify(data.error))) : job.resolve(data.result); } }
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text);
    if (data.method !== 'Fetch.requestPaused') return;
    const { request, requestId } = data.params;
    activeReads++;
    try {
      assert.equal(request.method, 'GET', 'Performance measurement is read-only');
      const url = new URL(request.url); const started = performance.now();
      const target = url.pathname === '/api/auth/status' ? `${fixture.url}/api/auth/status` : `http://127.0.0.1:${probe.address().port}${url.pathname}${url.search}`;
      const result = await fetch(target, { headers }); const body = await result.text();
      api.push({ path: url.pathname, ms: Math.round(performance.now() - started), status: result.status });
      await send('Fetch.fulfillRequest', { requestId, responseCode: result.status, responseHeaders: [{ name: 'Content-Type', value: 'application/json; charset=utf-8' }], body: Buffer.from(body).toString('base64') });
    } catch (error) {
      // StrictMode can cancel the first read before the fixture finishes it.
      if (error.message.includes('Invalid InterceptionId')) return;
      errors.push(error.message);
      try { await send('Fetch.failRequest', { requestId, errorReason: 'Failed' }); }
      catch (failure) { if (!failure.message.includes('Invalid InterceptionId')) errors.push(failure.message); }
    } finally { activeReads--; }
  });
  const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
  const until = async expression => { for (let i = 0; i < 400; i++) { if (await evaluate(`!!(${expression})`)) return; await delay(50); } throw new Error(`Timed out: ${expression}`); };
  const settleReads = async () => { for (let i = 0; i < 400; i++) { await delay(50); if (!activeReads) return; } throw new Error('API reads did not settle'); };
  await send('Runtime.enable'); await send('Page.enable');
  // Only the isolated browser session is authenticated against the fixture gateway.
  // Hermes reads still use the real bridge; no production login or mutation is sent.
  await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/auth/status' }, { urlPattern: '*/api/hermes/*' }] });
  const measurements = [];
  for (const label of ['cold', 'warm']) {
    api.length = 0;
    const started = performance.now();
    await send('Page.navigate', { url: `${base}/dashboard/proxy` });
    await until("document.querySelectorAll('.proxy-node-name').length > 0 && document.querySelector('select[aria-label=\"代理组\"]')?.options.length > 1 && [...document.querySelectorAll('.heading-actions button')].some(item=>!item.disabled)");
    const ready = Math.round(performance.now() - started);
    await until("document.readyState==='complete'");
    const timing = await evaluate("({nav:performance.getEntriesByType('navigation').map(item=>({ttfb:Math.round(item.responseStart),load:Math.round(item.loadEventEnd)})),modules:performance.getEntriesByType('resource').filter(item=>item.initiatorType==='script').length,resources:performance.getEntriesByType('resource').map(item=>({path:new URL(item.name).pathname,ms:Math.round(item.duration),bytes:item.transferSize})).sort((a,b)=>b.ms-a.ms).slice(0,12),heavy:performance.getEntriesByType('resource').filter(item=>/recharts|TokenCacheChart|MonitorPage|BalancesPage|CorePages/.test(item.name)).map(item=>new URL(item.name).pathname)})");
    const result = { label, ready_ms: ready, ...timing, api: [...api] }; measurements.push(result); console.log(JSON.stringify(result));
    assert.deepEqual(timing.heavy, [], 'Proxy first screen must not load unrelated pages or charts');
    await settleReads();
  }
  for (const [view, selector] of [['故障看护', '.proxy-watch-fields'], ['机场与订阅', '.proxy-subscription-url'], ['节点与出口', '.proxy-node-name']]) {
    api.length = 0; const started = performance.now();
    await evaluate(`[...document.querySelectorAll('[role=tab]')].find(item=>item.textContent===${JSON.stringify(view)}).click()`);
    await until(`document.querySelector(${JSON.stringify(selector)}) && !document.querySelector('[role=tabpanel] [aria-busy=true]')`);
    if (view === '故障看护') await until("document.querySelectorAll('.proxy-watch').length === 2 && [...document.querySelectorAll('.proxy-watch .badge')].every(item=>item.textContent!=='—') && [...document.querySelectorAll('.proxy-watch [role=switch]')].every(item=>!item.disabled)");
    const result = { view, ready_ms: Math.round(performance.now() - started), api: [...api] };
    measurements.push(result); console.log(JSON.stringify(result));
    await settleReads();
  }
  assert.deepEqual(errors, []);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile('C:/Users/20449/.codex/tmp/proxy-performance.png', Buffer.from(shot.data, 'base64'));
  if (process.env.PERFORMANCE_REPORT) await writeFile(process.env.PERFORMANCE_REPORT, JSON.stringify(measurements, null, 2));
} finally {
  socket?.close(); browser.kill(); probe.closeAllConnections(); await new Promise(resolve => probe.close(resolve)); await fixture.close();
}

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const entrances = process.argv.slice(2);
assert(entrances.length, 'Provide production URLs');
const profile = await mkdtemp(join(tmpdir(), 'tenrouter-production-'));
const browser = spawn(process.env.HERMES_BROWSER_EXE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-proxy-server', '--remote-debugging-port=4336', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
  let targets;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { targets = await fetch('http://127.0.0.1:4336/json/list').then(result => result.json()); break; }
    catch { await delay(100); }
  }
  assert(targets?.length, 'Browser did not start');
  socket = new WebSocket(targets.find(target => target.url === 'about:blank').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let sequence = 0;
  const pending = new Map(); const errors = []; const missing = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const task = pending.get(message.id);
      if (task) { pending.delete(message.id); clearTimeout(task.timer); message.error ? task.reject(new Error(JSON.stringify(message.error))) : task.resolve(message.result); }
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if (message.method === 'Network.responseReceived' && message.params.response.status >= 400 && new URL(message.params.response.url).pathname.startsWith('/assets/')) missing.push(message.params.response.url);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  for (const entrance of entrances) {
    const base = new URL(entrance).origin;
    const health = await fetch(`${base}/api/health`); assert.equal(health.status, 200); assert.equal((await health.json()).ok, true);
    const authResponse = await fetch(`${base}/api/auth/status`); assert.equal(authResponse.status, 200);
    const auth = await authResponse.json(); assert(!auth.demo && !auth.bootstrapLocal && !auth.authenticated && auth.requireLogin);
    for (const path of ['/api/providers', '/api/usage/quotas', '/api/hermes/proxy/groups', '/api/hermes/subscription/status', '/api/hermes/proxy/failover?group=AI-优选', '/api/hermes/health']) assert.equal((await fetch(base + path)).status, 401, path);
    for (const page of ['proxy', 'chain-health', 'balances']) {
      assert.equal((await fetch(`${base}/dashboard/${page}`)).status, 200);
      await send('Page.navigate', { url: `${base}/dashboard/${page}` });
      let loaded = false;
      for (let attempt = 0; attempt < 150; attempt++) {
        if (await evaluate("!!document.querySelector('#login-password') && document.readyState==='complete'")) { loaded = true; break; }
        await delay(100);
      }
      if (!loaded) {
        const screenshot = await send('Page.captureScreenshot', { format: 'png' });
        await writeFile(join(tmpdir(), 'tenrouter-production-failure.png'), Buffer.from(screenshot.data, 'base64'));
        const state = await evaluate("({url:location.href,state:document.readyState,text:document.body.innerText,resources:performance.getEntriesByType('resource').map(item=>({url:item.name,ms:Math.round(item.duration)}))})");
        assert.fail(`${base}/${page}: login did not render\n${JSON.stringify({state,errors,missing})}`);
      }
      assert.equal(await evaluate("document.querySelectorAll('.demo-password').length"), 0);
      for (const [width, height] of [[1440, 1000], [375, 812]]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Login viewport overflow');
        const screenshot = await send('Page.captureScreenshot', { format: 'png' });
        await writeFile(join(tmpdir(), `tenrouter-live-${new URL(base).hostname}-${page}-${width}.png`), Buffer.from(screenshot.data, 'base64'));
      }
    }
    assert.deepEqual(errors, []); assert.deepEqual(missing, []);
    console.log(`PASS ${base}: health, auth protection, three deep links, desktop/mobile login, assets, no uncaught exceptions`);
  }
} finally { socket?.close(); browser.kill(); }

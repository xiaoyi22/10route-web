import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { createRequire } from 'node:module';
import { startFixtureServer } from '../scripts/fixture-server.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'C:/Users/20449/AppData/Local/Temp/hermes-e2e/.venv/Lib/site-packages/playwright/driver/package');
const live = process.argv.includes('--live');
let fixture, worker, browser;
try {
  let base = process.env.PREVIEW_URL || 'http://localhost:4317';
  let cookie;
  if (live) {
    let input = ''; for await (const chunk of process.stdin) input += chunk;
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ password: input.trim() }) });
    assert.equal(login.status, 200, `Live login HTTP ${login.status}`);
    cookie = login.headers.get('set-cookie').split(';')[0];
  } else {
    fixture = await startFixtureServer();
    const login = await fetch(`${fixture.url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'linear-demo' }) });
    cookie = login.headers.get('set-cookie').split(';')[0];
    await fetch(`${fixture.url}/api/providers`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'openai-compatible-chat-demo', name: 'Fixture model account', apiKey: 'fixture-only' }) });
    base = 'http://127.0.0.1:4324';
    Object.assign(process.env, { TENROUTER_INTERNAL_TARGET: fixture.url, TENROUTER_DATA_MODE: 'demo', TENROUTER_ENABLE_MANAGEMENT: '1', TENROUTER_PORT: '4324', TENROUTER_HERMES_URL: '' });
    worker = fork(new URL('./hermes-vite-worker.mjs', import.meta.url), [], { windowsHide: true, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Test preview startup timed out')), 60000); worker.once('message', () => { clearTimeout(timer); resolve(); }); worker.once('error', error => { clearTimeout(timer); reject(error); }); worker.once('exit', code => { clearTimeout(timer); reject(new Error(`Test preview exited: ${code}`)); }); });
  }
  browser = await chromium.launch({ executablePath: process.env.HERMES_BROWSER_EXE, headless: true, args: ['--no-proxy-server'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const split = cookie.indexOf('=');
  await context.addCookies([{ name: cookie.slice(0, split), value: cookie.slice(split + 1), url: base, httpOnly: true, sameSite: 'Lax' }]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const go = async path => {
    await page.goto(`${base}${path}`);
    await page.getByRole('button', { name: '刷新模型', exact: true }).waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim()==='刷新模型' && !button.disabled) && !document.querySelector('.model-name')?.closest('tbody').innerText.includes('正在加载模型'));
  };
  const search = async id => { await page.getByLabel('搜索模型', { exact: true }).fill(id); await page.waitForFunction(id => [...document.querySelectorAll('tbody .model-name code')].some(item=>item.textContent===id), id); };
  if (!live) {
    // Match the real API: disabled built-ins disappear from its catalog response.
    await page.route('**/api/models', async route => {
      const result = await context.request.get(`${fixture.url}/api/models/disabled`, { headers: { Cookie: cookie } });
      const { disabled } = await result.json();
      await route.fulfill({ json: { models: disabled.cx?.includes('gpt') ? [] : [{ model: 'gpt', provider: 'cx', routedModel: 'cx/gpt', name: 'GPT', caps: { contextWindow: 128000 } }] } });
    });
    for (const [id, provider] of [['cx/gpt', 'codex'], ['demo/demo-model', 'openai-compatible-chat-demo']]) {
      await go('/dashboard/models'); await search(id);
      if (id.startsWith('demo/')) await page.getByRole('button', { name: `启用模型 ${id}`, exact: true }).click();
      await page.getByRole('button', { name: `停用模型 ${id}`, exact: true }).click();
      await page.getByRole('button', { name: `启用模型 ${id}`, exact: true }).waitFor();
      assert((await page.getByRole('table', { name: '已登记的模型目录，不代表上游实时可用性' }).locator('tbody').innerText()).includes('已停用'));
      await page.reload(); await search(id);
      await page.getByRole('button', { name: `启用模型 ${id}`, exact: true }).waitFor();
      await go(`/dashboard/providers/${provider}`); await search(id);
      await page.getByRole('button', { name: `启用模型 ${id}`, exact: true }).click();
      await page.getByRole('button', { name: `停用模型 ${id}`, exact: true }).waitFor();
      await go('/dashboard/models'); await search(id);
      await page.getByRole('button', { name: `停用模型 ${id}`, exact: true }).waitFor();
    }
    console.log('PASS simulated mutation regression: built-in/custom disable, retain row, reload, provider page, re-enable');
  } else {
    const disabledResponse = await context.request.get(`${base}/api/models/disabled`);
    const builtInResponse = await context.request.get(`${base}/api/models`);
    assert.equal(disabledResponse.status(), 200); assert.equal(builtInResponse.status(), 200);
    const { disabled } = await disabledResponse.json();
    const builtin = (await builtInResponse.json()).models;
    const keys = ['cbcn', 'codebuddy-cn'].filter(provider => disabled[provider]?.length);
    assert(keys.length, 'No existing disabled CodeBuddy models for read-only verification');
    const id = `${keys[0]}/${disabled[keys[0]][0]}`;
    for (const path of ['/dashboard/models', '/dashboard/providers/codebuddy-cn']) {
      await go(path); await search(id);
      await page.getByRole('button', { name: `启用模型 ${id}`, exact: true }).waitFor();
      assert((await page.getByRole('table', { name: '已登记的模型目录，不代表上游实时可用性' }).locator('tbody').innerText()).includes('已停用'));
      await page.reload(); await search(id);
    }
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: width===375 ? 812 : 1000 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({ path: `C:/Users/20449/.codex/tmp/models-disabled-real-${width}.png`, fullPage: true });
    }
    console.log(JSON.stringify({ real_requests: true, status:200, disabled_codebuddy_models:keys.reduce((count,key)=>count+disabled[key].length,0), active_catalog_models:builtin.length, checked_pages:['models','provider'], widths:[1440,375], production_mutations:0 }));
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  if (worker && worker.exitCode===null) await new Promise(resolve => { const timer=setTimeout(()=>worker.kill(),10000); worker.once('exit',()=>{clearTimeout(timer);resolve();}); worker.send('close'); });
  await fixture?.close();
}

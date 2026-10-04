import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4320';
assert.match(base, /^http:\/\/127\.0\.0\.1:432[01]$/);
const profile = await mkdtemp(join(tmpdir(), 'supplier-model-check-'));
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-proxy-server', '--remote-debugging-port=4330', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
  let targets;
  for (let i = 0; i < 50; i++) { try { targets = await (await fetch('http://127.0.0.1:4330/json/list')).json(); break; } catch { await delay(100); } }
  assert(targets, 'Headless browser failed to start');
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  const pending = new Map(); let sequence = 0; const errors = [];
  socket.addEventListener('message', event => { const data = JSON.parse(event.data); if (data.id) { const task = pending.get(data.id); pending.delete(data.id); data.error ? task.reject(new Error(JSON.stringify(data.error))) : task.resolve(data.result); } if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text); });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
  const until = async expression => { for (let i=0;i<100;i++) { if (await evaluate(expression)) return; await delay(100); } throw new Error(`Timed out: ${expression}\n${await evaluate('document.body.innerText')}`); };
  const button = name => `Array.from(document.querySelectorAll('button')).find(x=>x.textContent.trim()===${JSON.stringify(name)})`;
  const click = async name => { const target = button(name); await until(`${target} && !${target}.disabled`); await evaluate(`${target}.click()`); };
  const fill = async (name, value) => { await evaluate(`(() => { const label=Array.from(document.querySelectorAll('label')).find(x=>x.textContent.trim()===${JSON.stringify(name)}); const input=label?.control; if(!input) throw new Error('Missing input '+${JSON.stringify(name)}); input.focus(); input.select(); })()`); await send('Input.insertText',{text:value}); };
  const api = (path, method='GET', data) => evaluate(`fetch(${JSON.stringify(path)}, {method:${JSON.stringify(method)},headers:{'Content-Type':'application/json'},${data ? `body:JSON.stringify(${JSON.stringify(data)}),` : ''}}).then(async r=>({status:r.status,data:await r.json()}))`);
  const navigate = async path => { await send('Page.navigate', { url: base+path }); await until("document.readyState==='complete' && !!document.querySelector('#root')"); };
  await send('Runtime.enable'); await send('Page.enable');
  await navigate('/dashboard/providers');
  await until(`${button('进入管理端')} != null`);
  await fill('登录密码', 'web-e2e-local-20261003'); await click('进入管理端');
  await until(`${button('添加供应商')} != null`);
  const run = Date.now().toString(36);
  const key=await api('/api/keys','POST',{name:'model test '+run}); assert.equal(key.status,201);
  for (const type of ['openai-compatible','anthropic-compatible']) {
    const prefix = `models-${type.startsWith('openai')?'oa':'an'}-${run}`;
    const created = await api('/api/provider-nodes','POST',{name:prefix,prefix,type,apiType:'chat',baseUrl:'http://127.0.0.1:20130/v1'});
    assert.equal(created.status,201,JSON.stringify(created.data)); const node=created.data.node;
    await navigate(`/dashboard/providers/${node.id}`);
    await until(`${button('添加自定义模型')} && !${button('添加自定义模型')}.disabled`);
    assert.equal(await evaluate(`${button('获取上游模型')}.disabled`),true);
    await click('添加自定义模型'); await fill('上游模型 ID','e2e-model'); await fill('显示名称','手动模型'); await fill('上下文 Token','96000'); await click('保存模型');
    await until("!document.querySelector('dialog[open]')");
    await until(`document.body.innerText.includes(${JSON.stringify(prefix+'/e2e-model')})`);
    const connection = await api('/api/providers','POST',{provider:node.id,apiKey:'e2e-upstream-key',name:'查询账号',priority:1}); assert.equal(connection.status,201);
    await navigate(`/dashboard/providers/${node.id}`);
    await click('获取上游模型'); await click('获取模型列表');
    await until("!!document.querySelector('input[aria-label=\"导入 fallback-model\"]')");
    assert.equal(await evaluate("document.querySelector('input[aria-label=\"导入 e2e-model\"]').disabled"),true);
    await evaluate("document.querySelector('input[aria-label=\"导入 fallback-model\"]').click()"); await click('导入所选模型（1）');
    await until("document.body.innerText.includes('已导入 1 个模型，已向下游发布。')"); await click('完成');
    await until("!document.querySelector('dialog[open]')"); await until(`document.body.innerText.includes(${JSON.stringify(prefix+'/fallback-model')})`);
    await send('Page.reload'); await until(`document.body.innerText.includes(${JSON.stringify(prefix+'/fallback-model')})`);
    const models=(await api('/api/models/custom')).data.models.filter(model=>model.providerAlias===node.id);
    assert.equal(models.find(model=>model.id==='e2e-model').contextWindow,96000);
    assert.equal(models.find(model=>model.id==='fallback-model').enabled,true);
    assert.equal(models.length,2);
    const downstream = await (await fetch('http://192.168.11.150:20129/api/v1/models',{headers:{Authorization:'Bearer '+key.data.key}})).json();
    assert(downstream.data.some(model=>model.id===prefix+'/fallback-model'));
    await send('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:true});
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
    await send('Emulation.clearDeviceMetricsOverride');
    await api('/api/provider-nodes/'+node.id,'DELETE');
  }
  await api('/api/keys/'+key.data.id,'DELETE');
  assert.deepEqual(errors,[]);
  console.log('PASS browser + isolated real backend: OpenAI/Anthropic manual model save without accounts, fetch upstream, duplicate protection, selected import, refresh persistence, downstream publication, mobile layout, no uncaught exceptions.');
} finally { socket?.close(); edge.kill(); }

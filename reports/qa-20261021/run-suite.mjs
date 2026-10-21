// 浏览器回归批跑器（支持并发）：每个 worker 独占一个端口与一个全新隔离演示实例，跑完即销毁。
// 演示后端是有状态内存服务，隔离实例可避免用例之间串数据；并发可缩短总耗时。
// 用法：node reports/qa-20261021/run-suite.mjs <suite.json>
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const logs = resolve(import.meta.dirname, 'logs');
await mkdir(logs, { recursive: true });
const suite = JSON.parse(await readFile(process.argv[2], 'utf8'));
const results = [];
const output = resolve(import.meta.dirname, suite.output || 'demo-suite-results.json');
const stamp = () => new Date().toISOString().slice(11, 19);
const wait = ms => new Promise(done => setTimeout(done, ms));
const save = () => writeFile(output, JSON.stringify(results, null, 2));

async function waitForServer(url, timeout = 90000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const response = await fetch(`${url}/api/auth/status`, { signal: AbortSignal.timeout(3000) });
      if (response.ok) return true;
    } catch { /* 尚未监听 */ }
    await wait(400);
  }
  return false;
}

async function runOne(item, preview) {
  const started = Date.now();
  const out = resolve(logs, `${item.name}.log`);
  await writeFile(out, `# ${item.name} @ ${new Date().toISOString()}\n`);
  const env = { ...process.env, PLAYWRIGHT_MODULE: 'playwright', BROWSER_CHANNEL: 'msedge', ...suite.env, ...(item.env || {}) };
  let server = null;
  try {
    if (!item.selfStart) {
      const serverLog = resolve(logs, `${item.name}.server.log`);
      await writeFile(serverLog, '');
      server = spawn(process.execPath, [resolve(root, 'scripts/dev.mjs'), '--preview', '--demo'], {
        cwd: root, shell: false,
        env: { ...env, TENROUTER_PORT: new URL(preview).port },
      });
      server.stdout.on('data', chunk => appendFile(serverLog, chunk));
      server.stderr.on('data', chunk => appendFile(serverLog, chunk));
      const ready = await waitForServer(preview);
      if (!ready) {
        await appendFile(out, `\n隔离服务 90 秒内未就绪：${preview}\n`);
        return { name: item.name, file: item.file, ok: false, code: 'server-timeout', ms: Date.now() - started };
      }
    }
    env.PREVIEW_URL = preview;
    const code = await new Promise(done => {
      const child = spawn(process.execPath, [resolve(root, item.file)], { cwd: root, env, shell: false });
      const timer = setTimeout(() => child.kill('SIGKILL'), item.timeout || 240000);
      child.stdout.on('data', chunk => appendFile(out, chunk));
      child.stderr.on('data', chunk => appendFile(out, chunk));
      child.on('exit', (value, signal) => { clearTimeout(timer); done(signal ? `signal:${signal}` : value); });
      child.on('error', error => { clearTimeout(timer); appendFile(out, `\nspawn error: ${error.message}\n`); done('spawn-error'); });
    });
    const ms = Date.now() - started;
    const detail = (await readFile(out, 'utf8')).trim().split('\n').slice(-6).join(' | ').slice(0, 400);
    return { name: item.name, file: item.file, ok: code === 0, code, ms, detail };
  } finally {
    if (server) { server.kill('SIGKILL'); await wait(800); }
  }
}

const concurrency = Math.max(1, Math.min(suite.concurrency || 1, suite.tests.length));
const portBase = Number(suite.portBase || 4360);
const pending = [...suite.tests];
let cursor = 0;
async function worker(index) {
  const preview = `http://127.0.0.1:${portBase + index}`;
  while (cursor < pending.length) {
    const item = pending[cursor++];
    const result = await runOne(item, item.previewUrl || suite.env?.PREVIEW_URL || preview);
    results.push(result);
    await save();
    console.log(`[${stamp()}] ${result.ok ? 'PASS' : 'FAIL'} ${result.name} ${result.ms}ms ${result.ok ? '' : `code=${String(result.code).slice(0, 120)}`}`);
  }
}
await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index)));
const passed = results.filter(item => item.ok).length;
console.log(`\n汇总：${passed}/${results.length} 通过，${results.length - passed} 失败`);

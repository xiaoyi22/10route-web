import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const statuses = new Set(['success', 'already', 'expired', 'verification', 'unsupported', 'error']);
const messages = { success: '签到成功', already: '今日已签到', expired: '登录已过期，请更新凭据', verification: '需要到站点完成人工验证', unsupported: '签到未启用或接口不兼容', error: '浏览器签到失败' };

export function parseBrowserCheckinResult(output) {
  const line = String(output || '').split(/\r?\n/).reverse().find(value => value.startsWith('RESULT '));
  if (!line) return { status: 'error', diagnostic: 'browser' };
  const statusMatch = /[{,]\s*"?status"?\s*:\s*"?([a-z_]+)"?/.exec(line);
  const status = statusMatch && statuses.has(statusMatch[1]) ? statusMatch[1] : null;
  if (!status) return { status: 'error', diagnostic: 'browser' };
  const reward = /[{,]\s*"?reward"?\s*:\s*(\d+(?:\.\d+)?)/.exec(line);
  return { status, message: messages[status], ...(status === 'success' && reward ? { reward: Number(reward[1]) } : {}) };
}

export function runAnyRouterBrowserCheckin(account, { python = process.env.TENROUTER_PYTHON || 'python3', scriptPath = join(dirname(fileURLToPath(import.meta.url)), 'anyrouter-browser-checkin.py'), profileDir = process.env.TENROUTER_ANYROUTER_PROFILE_DIR || join(process.env.TENROUTER_CHECKIN_DIR || tmpdir(), 'anyrouter-profile'), proxyUrl = process.env.TENROUTER_CHECKIN_PROXY_URL || 'http://127.0.0.1:7890', timeoutMs = 90000, spawnProcess = spawn } = {}) {
  return new Promise(resolve => {
    const child = spawnProcess(python, [scriptPath], { env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || '/home/meet/.cache/ms-playwright', TENROUTER_ANYROUTER_PROFILE_DIR: profileDir, TENROUTER_CHECKIN_PROXY_URL: proxyUrl }, stdio: ['pipe', 'pipe', 'ignore'] });
    let output = '';
    let settled = false;
    const finish = result => { if (settled) return; settled = true; clearTimeout(timer); resolve(result); };
    const timer = setTimeout(() => { child.kill('SIGTERM'); finish({ status: 'error', diagnostic: 'browser' }); }, timeoutMs);
    child.stdout?.on('data', chunk => { output += chunk.toString('utf8').slice(0, 262144 - output.length); });
    child.on('error', () => finish({ status: 'error', diagnostic: 'browser' }));
    child.on('close', () => finish(parseBrowserCheckinResult(output)));
    child.stdin?.end(JSON.stringify({ baseUrl: account.baseUrl, checkinPath: account.checkinPath, cookie: account.cookie, userId: account.userId }));
  });
}

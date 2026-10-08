import os from 'node:os';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { collectSystemInfo } from './system-info.mjs';

const execute = promisify(execFile);

export function createSystemBridge({ backendUrl, sshTarget, sshIdentity, collector, fetcher = fetch }) {
  const backend = new URL(backendUrl);
  if (sshTarget && !/^(?:[a-zA-Z0-9._-]+@)?[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(sshTarget)) throw new Error('Invalid system SSH target');
  const localAddresses = ['localhost', '127.0.0.1', '[::1]', ...Object.values(os.networkInterfaces()).flat().filter(Boolean).map(address => address.address)];
  const local = os.platform() === 'linux' && localAddresses.includes(backend.hostname);
  const collect = collector || (async () => {
    if (sshTarget) {
      const source = await readFile(new URL('./system-info.mjs', import.meta.url), 'utf8');
      const args = ['-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', '-o', 'StrictHostKeyChecking=yes', ...(sshIdentity ? ['-i', sshIdentity, '-o', 'IdentitiesOnly=yes'] : []), sshTarget, 'node --input-type=module'];
      const job = execute('ssh', args, { timeout: 8000, maxBuffer: 262144, windowsHide: true });
      job.child.stdin.on('error', () => {});
      job.child.stdin.end(source + '\nconsole.log(JSON.stringify(await collectSystemInfo()));\n');
      const result = await job;
      const data = JSON.parse(result.stdout);
      if (data.platform !== 'linux' || !data.sampledAt || !data.cpu || !data.memory) throw new Error('Invalid system sample');
      return { ...data, transport: 'ssh' };
    }
    if (!local) throw new Error('System source is not configured');
    return { ...await collectSystemInfo(), transport: 'local' };
  });
  let sample;
  let sampledAt = 0;
  let pending;
  const send = (response, status, data) => {
    if (response.destroyed || response.writableEnded) return;
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(JSON.stringify(data));
  };
  return async (request, response, next) => {
    if (new URL(request.url, 'http://localhost').pathname !== '/api/system/info') return next?.();
    if (request.method !== 'GET') return send(response, 405, { error: '系统信息接口只允许读取' });
    try {
      const authResponse = await fetcher(backend.origin + '/api/auth/status', { redirect: 'error', signal: AbortSignal.timeout(5000), headers: { Cookie: request.headers.cookie || '', 'x-forwarded-for': request.socket.remoteAddress, 'x-forwarded-host': request.headers.host, 'x-forwarded-proto': 'http' } });
      if (!authResponse.ok) return send(response, 502, { error: '网关登录校验暂时不可用' });
      const auth = await authResponse.json();
      if (auth.authenticated !== true) return send(response, 401, { error: 'Unauthorized' });
      if (!sample || Date.now() - sampledAt >= 10000) {
        pending ||= collect().then(data => { sample = data; sampledAt = Date.now(); return data; }).finally(() => { pending = null; });
        await pending;
      }
      return send(response, 200, sample);
    } catch { return send(response, 503, { error: 'KN10 系统信息暂时无法获取，请检查服务端采集配置或连接' }); }
  };
}

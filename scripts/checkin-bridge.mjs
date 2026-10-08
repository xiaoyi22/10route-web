import { createCheckinService, CheckinError } from './checkin-service.mjs';
import { isAllowedRequest } from '../src/api/policy.js';

export function createCheckinBridge({ backendUrl, management = false, directory, service, fetcher = fetch }) {
  const backend = new URL(backendUrl);
  const store = service || (directory ? createCheckinService({ directory }) : null);
  const send = (response, status, data) => {
    if (response.destroyed || response.writableEnded) return;
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(JSON.stringify(data));
  };
  async function body(request) {
    if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] || '')) throw new CheckinError('请求须为 JSON');
    if (Number(request.headers['content-length']) > 65536) throw new CheckinError('请求内容过大', 413);
    const chunks = [];
    let size = 0;
    const timer = setTimeout(() => request.destroy(), 5000);
    try {
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 65536) throw new CheckinError('请求内容过大', 413);
        chunks.push(chunk);
      }
      const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
      return value;
    } catch (error) {
      if (error instanceof CheckinError) throw error;
      throw new CheckinError('JSON 请求格式无效');
    } finally { clearTimeout(timer); }
  }
  return async (request, response, next) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path !== '/api/checkins' && !path.startsWith('/api/checkins/')) return next?.();
    try {
      if (!isAllowedRequest(path, request.method, management)) return send(response, 405, { error: '签到操作未开放或当前为只读访问' });
      if (request.method !== 'GET') {
        let origin;
        try { origin = new URL(request.headers.origin || ''); } catch {}
        const secure = !!request.socket.encrypted;
        if (!origin || origin.host !== request.headers.host || origin.protocol !== (secure ? 'https:' : 'http:')) return send(response, 403, { error: '签到操作必须来自当前网关页面' });
        if (request.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(request.headers['sec-fetch-site'])) return send(response, 403, { error: '请求来源无效' });
      }
      const authResponse = await fetcher(backend.origin + '/api/auth/status', { redirect: 'error', signal: AbortSignal.timeout(5000), headers: { Cookie: request.headers.cookie || '', 'x-forwarded-for': request.socket.remoteAddress, 'x-forwarded-host': request.headers.host, 'x-forwarded-proto': request.socket.encrypted ? 'https' : 'http' } });
      if (!authResponse.ok) return send(response, 502, { error: '网关登录校验暂时不可用' });
      if ((await authResponse.json()).authenticated !== true) return send(response, 401, { error: 'Unauthorized' });
      if (request.method === 'GET') return send(response, 200, { configured: !!store, ...(store ? await store.snapshot() : { accounts: [], history: [], job: null }) });
      if (!store) return send(response, 503, { error: '签到存储未配置，请设置服务端 TENROUTER_CHECKIN_DIR' });
      if (path === '/api/checkins/accounts' && request.method === 'POST') return send(response, 201, { account: await store.saveAccount(await body(request)) });
      if (path === '/api/checkins/jobs' && request.method === 'POST') return send(response, 202, { job: await store.startJob(await body(request)) });
      const account = /^\/api\/checkins\/accounts\/([a-zA-Z0-9-]+)$/.exec(path);
      if (account && request.method === 'PATCH') return send(response, 200, { account: await store.saveAccount(await body(request), account[1]) });
      if (account && request.method === 'DELETE') { await store.deleteAccount(account[1]); return send(response, 200, { success: true }); }
      return send(response, 404, { error: '签到接口不存在' });
    } catch (error) {
      return send(response, error instanceof CheckinError ? error.status : 503, { error: error instanceof CheckinError ? error.message : '签到服务暂时不可用，请检查存储、权限或网络' });
    }
  };
}

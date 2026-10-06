import { readFile } from 'node:fs/promises';

const proxyReads = new Set(['groups', 'status', 'failover']);
const postRoutes = new Set(['proxy/select', 'proxy/delay', 'egress-ip', 'health/check', 'subscription/save', 'subscription/update', 'airports', 'proxy/failover/observe', 'proxy/failover/tick', 'proxy/failover/ack']);
const watchGroups = new Set(['ai-谷歌', 'AI-优选']);

function safeAirports(airports) {
  return (airports || []).map(({ id, name, group, masked_url, updated_at }) => ({ id, name, group, masked_url, updated_at }));
}

function origin(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Hermes 地址须为不含凭据的 http(s) origin');
  return url.origin;
}

export function createHermesBridge({ backendUrl, hermesUrl, token, tokenFile, management = false, fetcher = fetch }) {
  const backend = origin(backendUrl);
  const hermes = hermesUrl ? origin(hermesUrl) : null;
  let health = { mem0: null, icarus: null, checked_at: null };
  let healthJob;
  let lastHealthAttempt = 0;
  const egress = new Map();
  const egressJobs = new Map();
  let egressGeneration = 0;
  function invalidateEgress() { egressGeneration++; egress.clear(); egressJobs.clear(); }
  const send = (response, status, data) => {
    if (response.destroyed || response.writableEnded) return;
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(JSON.stringify(data));
  };
  async function body(request) {
    let text = '';
    for await (const chunk of request) {
      text += chunk;
      if (text.length > 8192) throw Object.assign(new Error('请求内容过大'), { status: 413 });
    }
    try {
      const data = JSON.parse(text || '{}');
      if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error();
      return data;
    }
    catch { throw Object.assign(new Error('请求内容不是有效 JSON'), { status: 400 }); }
  }
  async function call(path, data, timeout = 45000) {
    const secret = token || (tokenFile ? (await readFile(tokenFile, 'utf8')).trim() : '');
    if (!secret) throw Object.assign(new Error('Hermes 服务端凭据尚未配置'), { status: 503 });
    const response = await fetcher(`${hermes}/api/dashboard/${path}`, {
      method: data === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(timeout),
      headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json', ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    if (response.status === 401 || response.status === 403) throw Object.assign(new Error('Hermes 服务端凭据无效'), { status: 502 });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Hermes 接口未返回 JSON');
    const result = await response.json();
    if (!response.ok || result.error || result.success === false) throw Object.assign(new Error(result.error || `Hermes 调用失败 (${response.status})`), {
      status: response.status >= 400 && response.status < 500 ? response.status : 502,
      details: { ...(typeof result.rolled_back === 'boolean' ? { rolled_back: result.rolled_back } : {}), ...(result.backup ? { backup: result.backup } : {}), ...(result.warning ? { warning: result.warning } : {}), ...(['policy', 'install', 'reload'].includes(result.stage) ? { stage: result.stage } : {}), ...(['committed', 'rejected', 'unknown'].includes(result.state) ? { state: result.state } : {}) },
    });
    if (result.airports) result.airports = safeAirports(result.airports);
    if (result.status?.airports) result.status.airports = safeAirports(result.status.airports);
    return result;
  }
  async function checkHealth() {
    if (healthJob) return healthJob;
    if (Date.now() - lastHealthAttempt < 30000) return health;
    lastHealthAttempt = Date.now();
    healthJob = Promise.allSettled(['mem0', 'icarus'].map(name => call(`${name}-health?refresh=1`))).then(results => {
      health = Object.fromEntries(results.map((result, index) => [index ? 'icarus' : 'mem0', result.status === 'fulfilled' ? result.value : { components: [], all_ok: false, error: result.reason.message, checked_at: new Date().toISOString() }]));
      health.checked_at = new Date().toISOString();
      return health;
    }).finally(() => { healthJob = null; });
    return healthJob;
  }
  return async (request, response, next) => {
    const url = new URL(request.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/hermes/')) return next?.();
    const route = url.pathname.slice('/api/hermes/'.length);
    const deleting = /^airports\/[^/]+\/delete$/.test(route);
    const read = request.method === 'GET' && (route === 'health' || route === 'egress-ip' || route === 'subscription/status' || (route.startsWith('proxy/') && proxyReads.has(route.slice(6))));
    const write = request.method === 'POST' && (postRoutes.has(route) || deleting);
    if (!read && !write || write && !management) return send(response, 405, { error: '接口尚未开放' });
    if (write) {
      let source = null;
      if (request.headers.origin) {
        try { source = new URL(request.headers.origin).host; }
        catch { return send(response, 403, { error: '请求来源无效' }); }
      } else if (request.headers.referer) {
        try { source = new URL(request.headers.referer).host; }
        catch { return send(response, 403, { error: '请求来源无效' }); }
      }
      if (source && source !== request.headers.host) return send(response, 403, { error: '请求来源不匹配' });
    }
    try {
      // Check the gateway session before using the server-held Hermes credential.
      const authResponse = await fetcher(`${backend}/api/auth/status`, {
        redirect: 'error', signal: AbortSignal.timeout(10000), headers: {
          Cookie: request.headers.cookie || '', 'x-forwarded-for': request.socket.remoteAddress,
          'x-forwarded-host': request.headers.host, 'x-forwarded-proto': 'http',
        },
      });
      if (!authResponse.ok) throw new Error('网关登录校验暂时不可用');
      const auth = await authResponse.json();
      if (!auth.authenticated && auth.requireLogin !== false) return send(response, 401, { error: 'Unauthorized' });
      if (!hermes) return send(response, 503, { error: 'Hermes 服务地址尚未配置' });
      if (route === 'health') return send(response, 200, health);
      if (route === 'health/check') return send(response, 200, await checkHealth());
      if (write && (route.startsWith('subscription/') || route === 'airports' || deleting)) {
        const data = await body(request);
        const payload = {};
        if (route === 'airports') {
          if (typeof data.name !== 'string' || !data.name.trim()) return send(response, 400, { error: '请填写机场名称' });
          payload.name = data.name.trim();
          if (typeof data.group === 'string' && data.group.trim()) payload.group = data.group.trim();
        } else if (!deleting) {
          if (typeof data.airport_id !== 'string' || !data.airport_id.trim()) return send(response, 400, { error: '请明确选择机场' });
          payload.airport_id = data.airport_id.trim();
        }
        if (!deleting && (route !== 'subscription/update' || data.url)) {
          let subscriptionUrl;
          if (typeof data.url !== 'string') return send(response, 400, { error: '请填写完整的订阅地址' });
          try { subscriptionUrl = new URL(data.url); } catch { return send(response, 400, { error: '请填写完整的订阅地址' }); }
          if (!['http:', 'https:'].includes(subscriptionUrl.protocol) || String(data.url).includes('***')) return send(response, 400, { error: '订阅地址必须是完整的 HTTP(S) 地址' });
          payload.url = data.url.trim();
        }
        const changesConfig = route === 'subscription/update' || deleting;
        try { return send(response, 200, await call(route, payload, changesConfig ? 120000 : 45000)); }
        finally { if (changesConfig) invalidateEgress(); }
      }
      if (write && route.startsWith('proxy/failover/')) {
        const data = await body(request);
        if (!watchGroups.has(data.group)) return send(response, 400, { error: '请选择已接入的看护组' });
        const payload = { group: data.group };
        if (route.endsWith('/observe')) {
          if (typeof data.observe_only !== 'boolean') return send(response, 400, { error: '看护模式必须是明确的开关值' });
          payload.observe_only = data.observe_only;
        }
        try {
          const result = await call(route, payload, route.endsWith('/tick') ? 120000 : 45000);
          if (route.endsWith('/tick') && result.ok === false) return send(response, 502, { error: result.detail || result.action || '看护检查失败' });
          if (route.endsWith('/observe') && result.observe_only !== payload.observe_only) return send(response, 409, { error: '看护模式已发生变化，请刷新状态' });
          return send(response, 200, result);
        } finally { if (route.endsWith('/tick')) invalidateEgress(); }
      }
      if (route === 'egress-ip') {
        const data = write ? await body(request) : {};
        const port = Number(write ? data.port : url.searchParams.get('port'));
        // The existing Hermes egress implementation supports these three ports only.
        if (![7890, 7891, 7892].includes(port)) return send(response, 400, { error: '出口检测当前支持 7890、7891、7892 端口' });
        if (read) return send(response, 200, egress.get(port) || { port, checked_at: null });
        if (!egressJobs.has(port)) {
          const generation = egressGeneration;
          const job = call(`egress-ip?port=${port}&refresh=1`).then(result => {
            if (generation !== egressGeneration) throw Object.assign(new Error('检测期间节点已切换，请重新检测出口'), { status: 409 });
            egress.set(port, result);
            return result;
          }).finally(() => { if (egressJobs.get(port) === job) egressJobs.delete(port); });
          egressJobs.set(port, job);
        }
        return send(response, 200, await egressJobs.get(port));
      }
      if (route === 'proxy/select') {
        const data = await body(request);
        if (typeof data.group !== 'string' || !data.group || typeof data.name !== 'string' || !data.name) return send(response, 400, { error: '请选择代理组和节点' });
        const result = await call(route, { group: data.group, name: data.name });
        invalidateEgress();
        const actual = await call(`proxy/status?group=${encodeURIComponent(data.group)}`);
        if (actual.now !== data.name) return send(response, 409, { error: '节点选择已发生变化，请刷新当前状态' });
        return send(response, 200, { ...result, now: actual.now });
      }
      if (route === 'proxy/delay') {
        const data = await body(request);
        if (typeof data.name !== 'string' || !data.name) return send(response, 400, { error: '请选择测速节点' });
        return send(response, 200, await call(`proxy/delay?name=${encodeURIComponent(data.name)}&timeout=5000`));
      }
      const group = url.searchParams.get('group');
      const result = await call(`${route}${group ? `?group=${encodeURIComponent(group)}` : ''}`);
      if (route === 'proxy/groups') result.proxy_hosts = [new URL(hermes).hostname];
      return send(response, 200, result);
    } catch (failure) {
      return send(response, failure.status || 502, { error: failure.name === 'TimeoutError' ? 'Hermes 接口请求超时，请刷新确认实际状态' : failure.message, ...failure.details });
    }
  };
}

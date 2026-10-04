import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { isAllowedRequest } from '../src/api/policy.js';

const connections = [
  { id: 'demo-ag', provider: 'antigravity', name: 'Antigravity · 主账户', isActive: true, testStatus: 'success' },
  { id: 'demo-codex', provider: 'codex', name: 'Codex · 开发连接', isActive: true, testStatus: 'success' },
  { id: 'demo-claude', provider: 'claude', name: 'Claude · 工作连接', isActive: true, testStatus: 'success' },
  { id: 'demo-or', provider: 'openrouter', name: 'OpenRouter · 备用', isActive: true, testStatus: 'error', lastError: '演示认证异常' },
  { id: 'demo-gemini', provider: 'gemini', name: 'Gemini · 未测试', isActive: true },
];
const periods = new Set(['today', '24h', '7d', '30d', '60d']);

export function fixtureStats(period = '24h') {
  const scale = { today: 1, '24h': 1.2, '7d': 6.4, '30d': 24, '60d': 43 }[period] || 1;
  return {
    totalRequests: Math.round(12483 * scale),
    totalPromptTokens: Math.round(3268400 * scale),
    totalCompletionTokens: Math.round(1520200 * scale),
    totalCachedTokens: Math.round(1784200 * scale),
    totalCost: Number((8.42 * scale).toFixed(2)),
    byModel: {
      'claude-sonnet': { requests: Math.round(4820 * scale), promptTokens: Math.round(1390800 * scale), completionTokens: Math.round(478000 * scale), cachedTokens: Math.round(900000 * scale) },
      'gpt': { requests: Math.round(3680 * scale), promptTokens: Math.round(974500 * scale), completionTokens: Math.round(432000 * scale), cachedTokens: Math.round(480000 * scale) },
      'gemini': { requests: Math.round(2490 * scale), promptTokens: Math.round(638300 * scale), completionTokens: Math.round(351000 * scale), cachedTokens: Math.round(300000 * scale) },
      'other': { requests: Math.round(1493 * scale), promptTokens: Math.round(264800 * scale), completionTokens: Math.round(259200 * scale), cachedTokens: Math.round(104200 * scale) },
    },
    recentRequests: [
      { id: 'fixture-1', model: 'claude-sonnet', provider: 'claude', status: 'success', timestamp: new Date().toISOString() },
      { id: 'fixture-2', model: 'gpt', provider: 'codex', status: 'success', timestamp: new Date().toISOString() },
      { id: 'fixture-3', model: 'gemini', provider: 'antigravity', status: 'success', timestamp: new Date().toISOString() },
    ],
  };
}

export async function startFixtureServer() {
  const sessions = new Set();
  const timers = new Set();
  const providers = connections.map(connection => ({ ...connection, authType: connection.provider === 'openrouter' ? 'apikey' : 'oauth', priority: 1, lastTested: connection.testStatus ? new Date().toISOString() : null }));
  providers[0].providerSpecificData = { proxyPoolId: 'demo-google' };
  const proxyPools = [{ id: 'demo-google', name: 'ai-谷歌', type: 'http', proxyUrl: 'http://127.0.0.1:7891', isActive: true, noProxy: '.tencent.com', strictProxy: false }, { id: 'demo-best', name: 'mihomo-优选', type: 'http', proxyUrl: 'http://127.0.0.1:7892', isActive: true, noProxy: '', strictProxy: true }];
  const settings = { outboundProxyEnabled: true, outboundProxyUrl: 'http://127.0.0.1:7891', outboundNoProxy: 'localhost,127.0.0.1,.tencent.com', iqProbe: { question: '计算 17 + 6。返回 IQ-ANSWER: <number>', answer: '23' } };
  const keys = [{ id: 'demo-key', key: 'demo_sk_not_a_real_gateway_key', name: '演示开发密钥', isActive: true, createdAt: new Date().toISOString() }];
  const nodes = [{ id: 'openai-compatible-chat-demo', name: '演示兼容节点', prefix: 'demo', type: 'openai-compatible', apiType: 'chat', baseUrl: 'https://example.invalid/v1' }];
  const models = [
    { model: 'gpt', provider: 'cx', routedModel: 'cx/gpt', name: 'GPT', caps: { vision: true, reasoning: true, contextWindow: 128000 } },
    { model: 'claude-sonnet', provider: 'cc', routedModel: 'cc/claude-sonnet', name: 'Claude Sonnet', caps: { vision: true, reasoning: true, contextWindow: 200000 } },
    { model: 'gemini', provider: 'gemini', routedModel: 'gemini/gemini', name: 'Gemini', caps: { vision: true, search: true, contextWindow: 1000000 } },
    { model: 'unconnected', provider: 'openai', routedModel: 'openai/unconnected', name: '未接入模型', caps: {} },
  ];
  const customModels = [{ providerAlias: 'demo', id: 'demo-model', name: '演示自定义模型', type: 'llm', contextWindow: 32000, enabled: false }];
  const modelCaps = {};
  const disabledModels = {};
  let distributionMode = 'all';
  let distributionModels = [];
  const combos = [];
  const monitorCatalog = [{ id: 'codex', name: 'OpenAI Codex', active: true, models: ['gpt'], connections: [{ id: 'demo-codex', name: 'Codex · 开发连接' }] }, { id: 'claude', name: 'Claude Code', active: true, models: ['claude-sonnet'], connections: [{ id: 'demo-claude', name: 'Claude · 工作连接' }] }];
  let monitorConfig = { enabled: false, intervalMinutes: 360, revision: 'demo-monitor', providers: monitorCatalog.map(provider => ({ id: provider.id, mode: 'selected', models: provider.models, modelChecks: { [provider.models[0]]: ['availability', 'iq'] }, excludedConnectionIds: [] })), questions: [{ question: '计算 17 + 6。', answer: '23' }] };
  const monitorHistory = Array.from({ length: 26 }, (_, index) => {
    const provider = monitorCatalog[index % 2];
    const check = index % 4 < 2 ? 'availability' : 'iq';
    const status = index % 7 === 0 ? 'timeout' : index % 5 === 0 ? 'incorrect' : check === 'availability' ? 'available' : 'correct';
    return { provider: provider.id, model: provider.models[0], check, at: Date.now() - index * 3600000, status, score: check === 'availability' || status === 'timeout' ? null : status === 'correct' ? 100 : 0, answers: [{ question: check === 'iq' ? '计算 17 + 6。' : undefined, answer: check === 'iq' ? '23' : undefined, status, ok: status !== 'timeout', latencyMs: 1200 + index * 50, connectionId: provider.connections[0].id, content: check === 'iq' ? 'IQ-ANSWER: 23' : 'PONG', ...(check === 'iq' && { iq: { expected: '23', modelAnswered: '23', correct: status === 'correct' } }), ...(status === 'timeout' && { error: 'Request timed out' }) }] };
  });
  const details = Array.from({ length: 45 }, (_, index) => ({ id: `demo-request-${index}`, timestamp: new Date(Date.now() - index * 60000).toISOString(), provider: index % 2 ? 'codex' : 'claude', connectionId: index % 2 ? 'demo-codex' : 'demo-claude', model: index % 2 ? 'gpt' : 'claude-sonnet', status: index % 5 ? 'success' : 'error', tokens: { prompt_tokens: 1200 + index, completion_tokens: 300 + index, cached_tokens: 200, cache_creation_input_tokens: 100, completion_tokens_details: { reasoning_tokens: 50 } }, latency: { ttft: 200, total: 1100 + index }, responseMode: index % 2 ? 'non-streaming' : 'streaming', request: { redacted: true }, response: { redacted: true } }));
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const send = (status, body, headers = {}) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
      response.end(JSON.stringify(body));
    };
    const token = request.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('tenrouter_demo_session='))?.split('=')[1];
    const authenticated = sessions.has(token);
    if (!isAllowedRequest(`${url.pathname}${url.search}`, request.method, true)) return send(405, { error: '接口尚未开放' });
    if (!['GET', 'HEAD'].includes(request.method)) {
      const origin = request.headers.origin;
      let originHost;
      if (origin) { try { originHost = new URL(origin).host; } catch { originHost = null; } }
      if (origin && originHost !== request.headers.host) return send(403, { error: 'Origin rejected' });
    }
    async function readBody() {
      let raw = '';
      for await (const chunk of request) {
        raw += chunk;
        if (raw.length > 16384) throw new Error('Request too large');
      }
      return JSON.parse(raw || '{}');
    }
    if (url.pathname === '/api/auth/login' && request.method === 'POST') {
      let raw = '';
      for await (const chunk of request) {
        raw += chunk;
        if (raw.length > 4096) return send(413, { error: 'Request too large' });
      }
      let body;
      try { body = JSON.parse(raw); } catch { return send(400, { error: 'Invalid JSON' }); }
      if (body.password !== 'linear-demo') return send(401, { error: 'Invalid password' });
      const session = randomUUID();
      sessions.add(session);
      return send(200, { success: true }, { 'Set-Cookie': `tenrouter_demo_session=${session}; HttpOnly; SameSite=Lax; Path=/` });
    }
    if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
      sessions.delete(token);
      return send(200, { success: true }, { 'Set-Cookie': 'tenrouter_demo_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
    }
    if (url.pathname === '/api/auth/status') return send(200, { authenticated, requireLogin: true, authMode: 'password', displayName: '演示访客', loginMethod: 'Password', demo: true });
    if (url.pathname === '/api/health') return send(200, { ok: true, driver: 'demo-memory' });
    if (!authenticated) return send(401, { error: 'Unauthorized' });
    const method = request.method;
    let body = {};
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      try { body = await readBody(); } catch { return send(400, { error: 'Invalid JSON' }); }
    }
    if (url.pathname === '/api/proxy-pools') return send(200, { proxyPools });
    if (url.pathname === '/api/pricing') return send(200, { codex: { gpt: { input: 2, output: 8, cached: 0.2, cache_creation: 2, reasoning_included: true } }, claude: { 'claude-sonnet': { input: 3, output: 15, cached: 0.3, cache_creation: 3.75, reasoning_included: true } } });
    if (url.pathname === '/api/settings') { if (method === 'PATCH') Object.assign(settings, body); return send(200, settings); }
    if (url.pathname === '/api/models/caps') { if (method === 'PUT') { modelCaps[body.provider] ||= {}; modelCaps[body.provider][body.modelId] = { contextWindow: body.contextWindow, maxOutput: body.maxOutput }; } return send(200, { caps: modelCaps }); }
    if (url.pathname === '/api/models/disabled') {
      const provider = body.providerAlias || url.searchParams.get('providerAlias');
      if (method === 'POST') disabledModels[provider] = [...new Set([...(disabledModels[provider] || []), ...body.ids])];
      if (method === 'DELETE') disabledModels[provider] = (disabledModels[provider] || []).filter(id => id !== url.searchParams.get('id'));
      return send(200, { disabled: disabledModels });
    }
    if (url.pathname === '/api/models/distribution') {
      if (method === 'GET') return send(200, { mode: distributionMode, models: distributionModels, modes: ['all', 'allowlist'] });
      if (method === 'PUT') {
        if (!['all', 'allowlist'].includes(body.mode) || (body.models !== undefined && !Array.isArray(body.models))) return send(400, { error: 'Invalid distribution config' });
        distributionMode = body.mode || 'all';
        distributionModels = Array.isArray(body.models) ? body.models : distributionModels;
        return send(200, { mode: distributionMode, models: distributionModels });
      }
    }
    if (url.pathname === '/api/combos') {
      if (method === 'GET') return send(200, { combos });
      if (!/^[\w.-]+$/.test(body.name) || combos.some(combo => combo.name === body.name)) return send(400, { error: 'Invalid or duplicate combo name' });
      const combo = { id: randomUUID(), ...body }; combos.push(combo); return send(201, combo);
    }
    const comboId = url.pathname.match(/^\/api\/combos\/([^/]+)$/)?.[1];
    if (comboId) { const index = combos.findIndex(combo => combo.id === comboId); if (index < 0) return send(404, { error: 'Combo not found' }); if (method === 'DELETE') { combos.splice(index, 1); return send(200, { success: true }); } Object.assign(combos[index], body); return send(200, combos[index]); }
    if (url.pathname === '/api/channel-balances') return send(200, { generatedAt: new Date().toISOString(), channels: [], channelOptions: [], errors: [] });
    if (url.pathname === '/api/usage/quotas') return send(200, { generatedAt: new Date().toISOString(), connections: [] });
    if (url.pathname === '/api/iq-monitor') {
      if (method === 'PUT') {
        if (typeof body.enabled !== 'boolean' || !Number.isInteger(body.intervalMinutes) || body.intervalMinutes < 15 || body.intervalMinutes > 10080 || !Array.isArray(body.providers) || !body.questions?.length || body.questions.some(item => !item.question?.trim() || !/^-?\d+(?:\.\d+)?$/.test(item.answer))) return send(400, { error: 'Invalid monitor configuration' });
        monitorConfig = { ...structuredClone(body), revision: randomUUID() };
        return send(200, { config: monitorConfig });
      }
      return send(200, { config: monitorConfig, catalog: monitorCatalog, state: { revision: monitorConfig.revision, completedAt: monitorHistory[0].at, nextAt: Date.now() + 3600000, history: monitorHistory, backoff: {} }, running: false });
    }
    if (url.pathname === '/api/models/test') {
      if (!body.model) return send(400, { error: 'Model required' });
      return send(200, { ok: true, status: 200, latencyMs: 1250, ...(body.probe === 'iq' && { iq: { expected: '23', modelAnswered: '23', correct: true }, content: 'IQ-ANSWER: 23' }) });
    }
    if (url.pathname === '/api/provider-nodes') {
      if (method === 'GET') return send(200, { nodes });
      if (!body.name || !body.prefix || nodes.some(node => node.prefix === body.prefix)) return send(400, { error: 'Invalid or duplicate prefix' });
      const node = { id: `${body.type}-${body.apiType || ''}-${randomUUID()}`, ...body }; nodes.push(node); return send(201, { node });
    }
    const nodeId = url.pathname.match(/^\/api\/provider-nodes\/([^/]+)$/)?.[1];
    if (nodeId) { const index = nodes.findIndex(node => node.id === nodeId); if (index < 0) return send(404, { error: 'Node not found' }); if (method === 'DELETE') { nodes.splice(index, 1); for (let i = providers.length - 1; i >= 0; i--) if (providers[i].provider === nodeId) providers.splice(i, 1); return send(200, { success: true }); } Object.assign(nodes[index], body); return send(200, { node: nodes[index] }); }
    if (url.pathname === '/api/models') return send(200, { models });
    if (url.pathname === '/api/models/custom') {
      if (method === 'GET') return send(200, { models: customModels });
      const provider = body.providerAlias || url.searchParams.get('providerAlias'); const id = body.id || url.searchParams.get('id');
      const index = customModels.findIndex(model => model.providerAlias === provider && model.id === id);
      if (method === 'DELETE') { if (index >= 0) customModels.splice(index, 1); }
      else if (index >= 0) Object.assign(customModels[index], body); else customModels.push(body);
      return send(200, { success: true });
    }
    if (url.pathname === '/api/keys') {
      if (method === 'GET') return send(200, { keys });
      if (!body.name?.trim()) return send(400, { error: 'Name is required' });
      const key = { id: randomUUID(), key: `demo_sk_${randomUUID()}`, name: body.name.trim(), isActive: true, createdAt: new Date().toISOString() };
      keys.push(key);
      return send(201, { ...key, machineId: 'demo' });
    }
    const keyId = url.pathname.match(/^\/api\/keys\/([^/]+)$/)?.[1];
    if (keyId) {
      const index = keys.findIndex(key => key.id === decodeURIComponent(keyId));
      if (index < 0) return send(404, { error: 'Key not found' });
      if (method === 'GET') return send(200, { key: keys[index] });
      if (method === 'DELETE') { keys.splice(index, 1); return send(200, { message: 'Key deleted successfully' }); }
      if (typeof body.isActive !== 'boolean') return send(400, { error: 'isActive must be boolean' });
      keys[index].isActive = body.isActive;
      return send(200, { key: keys[index] });
    }
    if (url.pathname === '/api/providers') {
      if (method === 'GET') return send(200, { connections: providers });
      if (!['openai', 'anthropic', 'openrouter', 'deepseek', ...nodes.map(node => node.id)].includes(body.provider)) return send(400, { error: 'Invalid provider' });
      if (!body.apiKey || !body.name?.trim()) return send(400, { error: 'Name and API Key required' });
      if (providers.some(connection => connection.provider === body.provider && connection.name === body.name.trim())) return send(409, { error: 'A connection with this name already exists' });
      const connection = { id: randomUUID(), provider: body.provider, name: body.name.trim(), authType: 'apikey', isActive: true, priority: body.priority || 1, defaultModel: body.defaultModel || '', testStatus: 'unknown' };
      providers.push(connection);
      return send(201, { connection });
    }
    const providerMatch = url.pathname.match(/^\/api\/providers\/([^/]+)(\/(?:test|models))?$/);
    if (providerMatch) {
      const index = providers.findIndex(connection => connection.id === decodeURIComponent(providerMatch[1]));
      if (index < 0) return send(404, { error: 'Connection not found' });
      const connection = providers[index];
      if (providerMatch[2] === '/models') {
        if (connection.id === 'demo-or') return send(401, { error: 'Failed to fetch models: 401' });
        return send(200, { provider: connection.provider, connectionId: connection.id, models: [{ id: 'demo-upstream-model', name: '演示上游模型' }] });
      }
      if (providerMatch[2]) {
        connection.lastTested = new Date().toISOString();
        if (connection.id === 'demo-or') return send(200, { valid: false, error: connection.lastError, refreshed: false });
        connection.testStatus = 'success';
        delete connection.lastError;
        return send(200, { valid: true, refreshed: false });
      }
      if (method === 'GET') return send(200, { connection });
      if (method === 'DELETE') { providers.splice(index, 1); return send(200, { message: 'Connection deleted successfully' }); }
      for (const field of ['name', 'priority', 'defaultModel', 'isActive']) if (body[field] !== undefined) connection[field] = body[field];
      for (const field of ['proxyPoolId', 'connectionProxyEnabled', 'connectionProxyUrl', 'connectionNoProxy']) if (body[field] !== undefined) connection.providerSpecificData = { ...connection.providerSpecificData, [field]: body[field] };
      if (body.apiKey) { connection.testStatus = 'active'; delete connection.lastError; }
      return send(200, { connection });
    }
    if (url.pathname === '/api/usage/request-details') {
      const page = Number(url.searchParams.get('page') || 1);
      const pageSize = Number(url.searchParams.get('pageSize') || 20);
      if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) return send(400, { error: 'Invalid pagination' });
      const filtered = details.filter(entry => ['provider', 'model', 'connectionId', 'status'].every(field => !url.searchParams.get(field) || entry[field] === url.searchParams.get(field)) && (!url.searchParams.get('startDate') || new Date(entry.timestamp) >= new Date(url.searchParams.get('startDate'))) && (!url.searchParams.get('endDate') || new Date(entry.timestamp) <= new Date(url.searchParams.get('endDate'))));
      const offset = (page - 1) * pageSize;
      return send(200, { details: filtered.slice(offset, offset + pageSize), pagination: { page, pageSize, totalItems: filtered.length, totalPages: Math.ceil(filtered.length / pageSize), hasNext: offset + pageSize < filtered.length, hasPrev: page > 1 } });
    }
    if (url.pathname === '/api/usage/stats') {
      const period = url.searchParams.get('period') || '24h';
      if (!periods.has(period)) return send(400, { error: 'Invalid period' });
      return send(200, fixtureStats(period));
    }
    if (url.pathname === '/api/usage/chart') {
      const period = url.searchParams.get('period') || '24h';
      if (!periods.has(period)) return send(400, { error: 'Invalid period' });
      const scale = { today: 1, '24h': 1.2, '7d': 6.4, '30d': 24, '60d': 43 }[period] || 1;
      const count = ['today', '24h'].includes(period) ? 24 : Number.parseInt(period);
      return send(200, Array.from({ length: count }, (_, index) => {
        const promptTokens = Math.round((90000 + Math.sin(index * .7) * 46000 + Math.cos(index * .25) * 23000) * scale);
        const completionTokens = Math.round(promptTokens * .2);
        return { label: count === 24 ? `${String(index).padStart(2, '0')}:00` : `10/${index + 1}`, promptTokens, completionTokens, cachedTokens: Math.round(promptTokens * .75), cacheCreationTokens: Math.round(promptTokens * .04), tokens: promptTokens + completionTokens, cost: .3 };
      }));
    }
    if (url.pathname === '/api/usage/stream') {
      response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      const write = () => response.write(`data: ${JSON.stringify(fixtureStats())}\n\n`);
      write();
      const timer = setInterval(write, 1500);
      timers.add(timer);
      response.on('close', () => { clearInterval(timer); timers.delete(timer); });
      return;
    }
    send(404, { error: 'API not found' });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: async () => {
      timers.forEach(clearInterval);
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    },
  };
}

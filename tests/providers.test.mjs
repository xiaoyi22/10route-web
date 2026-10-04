import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectionProxy, groupProviders, providerFailure, providerInfo, safeProxyUrl } from '../src/api/providers.js';
import { normalizeProviders } from '../src/api/client.js';

test('provider groups resolve aliases and keep separate custom upstream nodes', () => {
  const nodes = [{ id: 'openai-compatible-a', prefix: 'a', name: '供应商甲' }, { id: 'openai-compatible-b', prefix: 'b', name: '供应商乙' }];
  const groups = groupProviders([{ provider: 'codex', isActive: true }, { provider: 'cx', isActive: false }, { provider: nodes[0].id }, { provider: 'b' }], nodes);
  assert.equal(groups.length, 3);
  assert.equal(groups[0].connections.length, 2);
  assert.equal(groups[0].enabled, 1);
  assert.equal(providerInfo('a', nodes).name, '供应商甲');
  assert.equal(providerInfo('openai-compatible-deleted').name, '自定义节点（名称未加载）');
  assert.equal(providerInfo('codebuddy-cn').name, 'WorkBuddy / CodeBuddy CN');
  assert.equal(providerInfo('cc').name, 'Claude Code');
});

test('proxy display follows backend pool, dedicated, global precedence and masks credentials', () => {
  const settings = { outboundProxyEnabled: true, outboundProxyUrl: 'http://127.0.0.1:7891', outboundNoProxy: '.tencent.com' };
  const pools = [{ id: 'pool', name: '优选', isActive: true, proxyUrl: 'http://127.0.0.1:7892', noProxy: '.qoder.com', strictProxy: true }];
  const connection = { proxyPoolId: 'pool', connectionProxyEnabled: true, connectionProxyUrl: 'http://user:secret@localhost:8888/?token=secret' };
  assert.equal(connectionProxy(connection, pools, settings).title, '优选');
  assert.equal(connectionProxy(connection, pools, settings).strict, true);
  assert.equal(connectionProxy(connection, pools, settings).noProxy, '.qoder.com');
  const fallback = connectionProxy(connection, [], settings);
  assert.equal(fallback.source, 'connection');
  assert(fallback.warning);
  assert.equal(fallback.address, 'http://***@localhost:8888');
  assert.equal(connectionProxy({}, [], settings).noProxy, '.tencent.com');
  assert.equal(connectionProxy({}, null, settings).source, 'unknown');
  assert.equal(safeProxyUrl('invalid-secret'), '地址不可识别');
});

test('connection normalization selects proxy metadata without leaking credential fields', () => {
  const [connection] = normalizeProviders({ connections: [{ id: 'a', provider: 'codex', accessToken: 'secret', providerSpecificData: { proxyPoolId: 'pool', connectionProxyUrl: 'http://localhost:8888', refreshToken: 'secret' } }] });
  assert.equal(connection.proxyPoolId, 'pool');
  assert.equal(connection.connectionProxyUrl, 'http://localhost:8888');
  assert(!JSON.stringify(connection).includes('secret'));
  assert.equal(normalizeProviders({ connections: [{ providerSpecificData: { proxyPoolId: '__none__' } }] })[0].proxyPoolId, '');
});

test('provider failures explain HTTP codes without assuming every error is an expired key', () => {
  assert.equal(providerFailure('API error: 400').label, 'HTTP 400 · 请求参数错误');
  assert.match(providerFailure('400 Bad Request').hint, /不能说明 Key 失效/);
  assert.equal(providerFailure('Failed to fetch models: 401').label, 'HTTP 401 · 认证失败');
  assert.match(providerFailure('HTTP 401', 'oauth').hint, /重新授权/);
  for (const [status, reason] of [[402, '余额或额度不足'], [403, '访问被拒绝'], [404, '接口或模型不存在'], [429, '请求限流或额度耗尽'], [503, '上游服务异常']]) {
    assert.equal(providerFailure({ status, message: 'Upstream rejected request' }).label, `HTTP ${status} · ${reason}`);
  }
  assert.equal(providerFailure('Invalid API key', 'apikey').label, 'API Key 认证失败');
  assert.equal(providerFailure('Token expired and refresh failed', 'oauth').label, 'Token 已过期 / 失效');
  assert.equal(providerFailure('Invalid API key or base URL').label, '密钥或接口配置错误');
  assert.equal(providerFailure('fetch failed: ECONNREFUSED').label, '网络或代理异常');
});

test('provider failures retain full raw JSON and avoid guessing HTTP codes from unrelated numbers', () => {
  const raw = JSON.stringify({ status: 401, error: { message: 'invalid_api_key', type: 'authentication_error' } });
  assert.equal(providerFailure(raw).label, 'HTTP 401 · 认证失败');
  assert.equal(providerFailure(raw).raw, raw);
  assert.equal(providerFailure({ status: 400, error: { message: 'Unsupported model' } }).status, 400);
  assert.equal(providerFailure('Request took 400 ms via http://localhost:401/path').status, 0);
  assert.equal(providerFailure('Unrecognized upstream response').label, '连接异常');
});

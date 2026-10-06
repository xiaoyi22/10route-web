import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError, requestJson, normalizeStats, normalizeProviders } from '../src/api/client.js';
import { isAllowedRequest } from '../src/api/policy.js';

test('JSON requests preserve cookies and report auth failures accurately', async () => {
  let options;
  const response = await requestJson('/api/auth/status', {}, async (url, config) => {
    assert.equal(url, '/api/auth/status');
    options = config;
    return new Response(JSON.stringify({ authenticated: true }), { headers: { 'Content-Type': 'application/json' } });
  });
  assert.equal(response.authenticated, true);
  assert.equal(options.credentials, 'same-origin');
  await assert.rejects(requestJson('/api/providers', {}, async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })), error => error instanceof ApiError && error.status === 401);
});

test('SPA HTML must not be mistaken for an API response', async () => {
  await assert.rejects(requestJson('/api/providers', {}, async () => new Response('<html>fallback</html>', { headers: { 'Content-Type': 'text/html' } })), /JSON/);
});

test('total tokens exclude double counting cached tokens; missing values remain unknown', () => {
  const stats = normalizeStats({ totalRequests: 3, totalPromptTokens: 100, totalCompletionTokens: 20, totalCachedTokens: 80, totalCost: 0 });
  assert.equal(stats.totalTokens, 120);
  assert.equal(stats.totalCost, 0);
  assert.equal(normalizeStats({}).totalTokens, null);
});

test('disabled and unknown connections are not marked healthy', () => {
  const providers = normalizeProviders({ connections: [
    { id: 'a', name: '<img src=x>', provider: 'openai', isActive: false, testStatus: 'success' },
    { id: 'b', provider: 'openai', isActive: true },
    { id: 'c', provider: 'anthropic', isActive: true, testStatus: 'success' },
    { id: 'd', provider: 'google', isActive: true, testStatus: 'error', lastError: 'auth failed' }
  ] });
  assert.deepEqual(providers.map(connection => connection.status), ['disabled', 'unknown', 'healthy', 'error']);
  assert.equal(providers[0].name, '<img src=x>');
});

test('real connection mode is read-only except explicit login and logout', async () => {
  await assert.rejects(requestJson('/api/providers', { method: 'POST', body: '{}' }), /只读/);
});

test('core management permits only verified routes and methods', () => {
  assert.equal(isAllowedRequest('/api/keys', 'POST', true), true);
  assert.equal(isAllowedRequest('/api/keys/a', 'PUT', true), true);
  assert.equal(isAllowedRequest('/api/providers/a/test', 'POST', true), true);
  assert.equal(isAllowedRequest('/api/providers/a/models', 'GET', true), true);
  assert.equal(isAllowedRequest('/api/providers/a/models', 'GET', false), true);
  assert.equal(isAllowedRequest('/api/providers/a/models', 'POST', true), false);
  assert.equal(isAllowedRequest('/api/providers/a', 'DELETE', false), false);
  assert.equal(isAllowedRequest('/api/providers/a', 'DELETE', true), true);
  assert.equal(isAllowedRequest('/api/usage/request-details?page=2', 'GET'), true);
  assert.equal(isAllowedRequest('/api/models/distribution', 'GET'), true);
  assert.equal(isAllowedRequest('/api/pricing', 'GET'), true);
  assert.equal(isAllowedRequest('/api/pricing', 'PATCH', true), true);
  assert.equal(isAllowedRequest('/api/pricing', 'PATCH', false), false);
  assert.equal(isAllowedRequest('/api/pricing', 'DELETE', true), true);
  for (const [url, method] of [['/api/settings', 'PATCH'], ['/api/provider-nodes', 'POST'], ['/api/provider-nodes/a', 'PUT'], ['/api/provider-nodes/a', 'DELETE'], ['/api/models/custom', 'POST'], ['/api/models/custom', 'DELETE'], ['/api/models/caps', 'PUT'], ['/api/models/disabled', 'POST'], ['/api/models/distribution', 'PUT'], ['/api/combos', 'POST'], ['/api/combos/a', 'PUT'], ['/api/combos/a', 'DELETE'], ['/api/channel-balances', 'PATCH']]) {
    assert.equal(isAllowedRequest(url, method, true), true);
    assert.equal(isAllowedRequest(url, method, false), false);
  }
  assert.equal(isAllowedRequest('/api/shutdown', 'POST', true), false);
  assert.equal(isAllowedRequest('/api/iq-monitor', 'GET'), true);
  assert.equal(isAllowedRequest('/api/iq-monitor', 'PUT', true), true);
  assert.equal(isAllowedRequest('/api/iq-monitor', 'PUT', false), false);
  assert.equal(isAllowedRequest('/api/iq-monitor/tick', 'POST', true), false);
  assert.equal(isAllowedRequest('/api/models/distribution', 'GET', true), true);
  assert.equal(isAllowedRequest('/api/models/distribution', 'PUT', true), true);
  assert.equal(isAllowedRequest('/api/models/distribution', 'PUT', false), false);
  assert.equal(isAllowedRequest('/api/models/test', 'POST', true), true);
  assert.equal(isAllowedRequest('/api/models/test', 'POST', false), false);
  assert.equal(isAllowedRequest('/api/models/test', 'GET'), false);
  assert.equal(isAllowedRequest('/api/keys', 'DELETE', true), false);
  assert.equal(isAllowedRequest('/api/providers/a/../../settings', 'PUT', true), false);
  assert.equal(isAllowedRequest('https://external.example/api/keys', 'POST', true), false);
});

test('malformed JSON responses produce a useful API error', async () => {
  await assert.rejects(requestJson('/api/models', {}, async () => new Response('{', { headers: { 'Content-Type': 'application/json' } })), /JSON 格式无效/);
});

test('upstream auth errors preserve the dashboard session; dashboard auth errors still expire it', async () => {
  const previousWindow = globalThis.window;
  const events = [];
  globalThis.window = { dispatchEvent: event => events.push(event.type) };
  try {
    const failure = error => async () => new Response(JSON.stringify({ error }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    await assert.rejects(requestJson('/api/providers/a/models', {}, failure('Failed to fetch models: 401')), /Failed to fetch models: 401/);
    assert.deepEqual(events, []);
    await assert.rejects(requestJson('/api/providers/a/models', {}, failure('Unauthorized')), /登录已失效/);
    assert.deepEqual(events, ['tenrouter:unauthorized']);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

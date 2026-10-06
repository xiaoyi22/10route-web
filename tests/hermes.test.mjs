import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';
import { createHermesBridge } from '../scripts/hermes-bridge.mjs';
import { componentLabel, groupChain, healthState, nodeState, proxyBinding, proxyEntries } from '../src/api/hermes.js';
import { isAllowedRequest } from '../src/api/policy.js';

test('proxy mapping uses the configured host and listeners, resolves cycles, and preserves unknown health', () => {
  const data = { proxy_hosts: ['192.168.11.150'], groups: [{ name: 'GLOBAL', now: 'airport' }, { name: 'airport', now: 'node-a' }, { name: 'AI', now: 'node-b' }], entry_ports: { mixed: 7890, listeners: [{ port: 7891, proxy: 'AI' }, { port: 7900 }] } };
  assert.deepEqual(proxyEntries(data)[0].chain, ['GLOBAL', 'airport', 'node-a']);
  assert.equal(proxyBinding('http://127.0.0.1:7891', data).group, 'AI');
  assert.equal(proxyBinding('http://192.168.11.150:7890', data).chain.at(-1), 'node-a');
  assert.equal(proxyBinding('http://unrelated.example:7891', data), null);
  assert.equal(proxyBinding('http://127.0.0.1:7899', data), null);
  assert.equal(proxyEntries(data)[2].probeSupported, false);
  assert.deepEqual(groupChain('a', [{ name: 'a', now: 'b' }, { name: 'b', now: 'a' }]), ['a', 'b']);
  assert.equal(nodeState({ alive: null, delay: null }).type, 'unknown');
  assert.equal(nodeState({ alive: true, delay: 0 }).type, 'error');
  assert.equal(healthState(null).label, '未检测');
  assert.equal(healthState({ checked_at: new Date(0).toISOString(), components: [{ ok: true }] }).label, '结果已过期');
  assert.equal(healthState({ checked_at: new Date().toISOString(), components: [{ ok: false }] }).type, 'error');
  assert.equal(componentLabel({ name: 'Qdrant 同步', ok: true }), '记忆较新');
  assert.equal(componentLabel({ name: 'LLM', ok: true }), '接口可达');
});

async function listen(handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}

test('subscription and watchdog operations preserve access boundaries, redact URLs and expose rollback failures', async () => {
  const backend = await listen((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ authenticated: request.headers.cookie === 'auth_token=session', requireLogin: true }));
  });
  const calls = [];
  const airport = { id: 'test', name: 'Airport', group: 'Airport', url: 'https://example.test/private-secret', masked_url: 'https://example.test/***', updated_at: '2026-10-03', subscription_mode: 'one_time', one_time_consumed: true, subscription_snapshot: 'private-snapshot.txt' };
  let result = { success: true, airports: [airport] };
  const hermes = await listen(async (request, response) => {
    let raw = ''; for await (const chunk of request) raw += chunk;
    calls.push({ path: request.url, data: raw ? JSON.parse(raw) : null });
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(request.url.includes('egress-ip') ? { ip: '203.0.113.2', checked_at: '2026-10-03' } : result));
  });
  const app = await listen(createHermesBridge({ backendUrl: backend.url, hermesUrl: hermes.url, token: 'test-secret', management: true }));
  const readOnly = await listen(createHermesBridge({ backendUrl: backend.url, hermesUrl: hermes.url, token: 'test-secret' }));
  const headers = { Cookie: 'auth_token=session', 'Content-Type': 'application/json' };
  const post = (path, data, base = app.url, customHeaders = headers) => fetch(`${base}/api/hermes/${path}`, { method: 'POST', headers: customHeaders, body: JSON.stringify(data) });
  const cached = () => fetch(`${app.url}/api/hermes/egress-ip?port=7891`, { headers }).then(response => response.json());
  try {
    for (const path of ['airports', 'subscription/save', 'subscription/update', 'airports/test/delete', 'proxy/failover/observe', 'proxy/failover/tick', 'proxy/failover/ack']) {
      assert.equal(isAllowedRequest(`/api/hermes/${path}`, 'POST', true), true);
      assert.equal(isAllowedRequest(`/api/hermes/${path}`, 'POST', false), false);
      assert.equal((await post(path, {}, readOnly.url)).status, 405);
      assert.equal((await post(path, {}, app.url, {})).status, 401);
      assert.equal((await post(path, {}, app.url, { ...headers, Origin: 'http://foreign.invalid' })).status, 403);
      assert.equal((await post(path, {}, app.url, { ...headers, Referer: 'http://foreign.invalid/admin' })).status, 403);
    }
    assert.equal(calls.length, 0);
    assert.equal(isAllowedRequest('/api/hermes/subscription/status'), true);
    assert.equal(isAllowedRequest('/api/hermes/airports/test/delete/extra', 'POST', true), false);
    const status = await fetch(`${app.url}/api/hermes/subscription/status`, { headers }).then(response => response.json());
    assert.equal(status.airports[0].url, undefined);
    assert.equal(status.airports[0].subscription_snapshot, undefined);
    assert.equal(status.airports[0].subscription_mode, 'one_time');
    assert.equal(status.airports[0].one_time_consumed, true);
    assert(!JSON.stringify(status).includes('private-secret'));
    const initialCalls = calls.length;
    for (const [path, data] of [
      ['subscription/save', { url: airport.url }], ['subscription/update', {}],
      ['subscription/save', { airport_id: 'test', url: airport.masked_url }],
      ['airports', { name: 'Airport', url: 'file:///private' }],
      ['airports', { name: 'Airport', url: airport.url, subscription_mode: 'unsupported' }],
      ['proxy/failover/observe', { group: 'AI-优选', observe_only: 'false' }],
      ['proxy/failover/tick', { group: 'unrecognized' }], ['airports', null], ['airports', []],
    ]) assert.equal((await post(path, data)).status, 400);
    assert.equal(calls.length, initialCalls, 'Invalid requests must not reach Hermes');
    assert.equal((await post('airports', { name: ' New ', group: ' NewGroup ', url: airport.url, id: 'overwrite', other: true })).status, 200);
    assert.deepEqual(calls.at(-1).data, { name: 'New', group: 'NewGroup', url: airport.url });
    assert.equal((await post('subscription/save', { airport_id: 'test', url: airport.url, group: 'other' })).status, 200);
    assert.deepEqual(calls.at(-1).data, { airport_id: 'test', url: airport.url });
    assert.equal((await post('subscription/save', { airport_id: 'test', url: airport.url, subscription_mode: 'one_time' })).status, 200);
    assert.deepEqual(calls.at(-1).data, { airport_id: 'test', url: airport.url, subscription_mode: 'one_time' });
    result = { success: true, status: { airports: [airport] }, backup: '/test/config.bak', warning: 'isolated warning' };
    await post('egress-ip', { port: 7891 }); assert((await cached()).checked_at);
    const updated = await post('subscription/update', { airport_id: 'test', arbitrary: true, subscription_mode: 'regular' });
    assert.equal(updated.status, 200);
    assert.deepEqual(calls.at(-1).data, { airport_id: 'test' });
    assert.equal((await updated.json()).status.airports[0].url, undefined);
    assert.equal((await cached()).checked_at, null);
    for (const rolledBack of [true, false]) {
      result = { success: false, error: 'reload failed', rolled_back: rolledBack, backup: '/test/config.bak', stage: 'reload', url: airport.url };
      await post('egress-ip', { port: 7891 });
      const failure = await post('subscription/update', { airport_id: 'test' });
      assert.equal(failure.status, 502);
      assert.deepEqual(await failure.json(), { error: 'reload failed', rolled_back: rolledBack, backup: '/test/config.bak', stage: 'reload' });
      assert.equal((await cached()).checked_at, null);
    }
    result = { success: false, error: 'install not confirmed', stage: 'install', state: 'unknown', backup: '/test/config.bak', url: airport.url };
    assert.deepEqual(await (await post('subscription/update', { airport_id: 'test' })).json(),
      { error: 'install not confirmed', stage: 'install', state: 'unknown', backup: '/test/config.bak' });
    result = { success: true, airports: [airport], backup: '/test/delete.bak' };
    await post('egress-ip', { port: 7891 });
    assert.equal((await post('airports/test/delete', { airport_id: 'different', unsafe: true })).status, 200);
    assert.deepEqual(calls.at(-1), { path: '/api/dashboard/airports/test/delete', data: {} });
    assert.equal((await cached()).checked_at, null);
    result = { observe_only: false };
    assert.equal((await post('proxy/failover/observe', { group: 'AI-优选', observe_only: false, unsafe: true })).status, 200);
    assert.deepEqual(calls.at(-1).data, { group: 'AI-优选', observe_only: false });
    assert.equal((await post('proxy/failover/observe', { group: 'AI-优选', observe_only: true })).status, 409);
    assert.equal((await post('proxy/failover/ack', { group: 'ai-谷歌', to: 'unsafe' })).status, 200);
    assert.deepEqual(calls.at(-1).data, { group: 'ai-谷歌' });
    for (const ok of [true, false]) {
      result = { ok, action: ok ? 'probe-ok' : 'probe-failed', detail: ok ? 'ok' : 'probe timeout' };
      await post('egress-ip', { port: 7891 });
      assert.equal((await post('proxy/failover/tick', { group: 'AI-优选' })).status, ok ? 200 : 502);
      assert.deepEqual(calls.at(-1).data, { group: 'AI-优选' });
      assert.equal((await cached()).checked_at, null);
    }
  } finally { await app.close(); await readOnly.close(); await hermes.close(); await backend.close(); }
});

test('Hermes bridge authenticates the gateway, keeps credentials server-side, caches manual probes and verifies selection', async () => {
  let authHeaders;
  const backend = await listen((request, response) => {
    authHeaders = request.headers;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ requireLogin: true, authenticated: request.headers.cookie === 'auth_token=session' }));
  });
  const calls = [];
  let current = 'node-a';
  let brokenCredential = false;
  let mismatch = false;
  let delayedEgress;
  let delayEgress = false;
  const hermes = await listen(async (request, response) => {
    let data = '';
    for await (const chunk of request) data += chunk;
    calls.push({ url: request.url, headers: request.headers, data });
    response.setHeader('Content-Type', 'application/json');
    if (brokenCredential) { response.writeHead(401); response.end('{"error":"unauthorized"}'); return; }
    if (request.url.includes('health')) { await new Promise(resolve => setTimeout(resolve, 20)); response.end(JSON.stringify({ checked_at: new Date().toISOString(), components: [{ name: 'LLM', ok: true }] })); }
    else if (request.url.endsWith('/proxy/select')) { current = JSON.parse(data).name; response.end('{"success":true}'); }
    else if (request.url.includes('/proxy/status')) response.end(JSON.stringify({ now: mismatch ? 'different' : current }));
    else if (request.url.includes('/proxy/groups')) response.end('{"groups":[],"entry_ports":{}}');
    else if (request.url.includes('/egress-ip')) {
      if (delayEgress) delayedEgress = () => response.end('{"ip":"203.0.113.1","checked_at":"2026-10-03T10:00:00Z"}');
      else response.end('{"ip":"203.0.113.1","checked_at":"2026-10-03T10:00:00Z"}');
    }
    else response.end('{"success":false,"error":"probe timeout"}');
  });
  const bridge = createHermesBridge({ backendUrl: backend.url, hermesUrl: hermes.url, token: 'server-only-secret', management: true });
  const app = await listen((request, response) => bridge(request, response));
  const readOnly = await listen(createHermesBridge({ backendUrl: backend.url, hermesUrl: hermes.url, token: 'server-only-secret' }));
  const headers = { Cookie: 'auth_token=session', 'Content-Type': 'application/json' };
  try {
    assert.equal((await fetch(`${app.url}/api/hermes/proxy/groups`)).status, 401);
    assert.equal(calls.length, 0);
    assert.equal((await fetch(`${app.url}/api/hermes/proxy/select`, { method: 'POST', headers: { ...headers, Origin: 'http://foreign.invalid' }, body: '{}' })).status, 403);
    assert.equal((await fetch(`${readOnly.url}/api/hermes/health/check`, { method: 'POST', headers, body: '{}' })).status, 405);
    assert.equal((await fetch(`${app.url}/api/hermes/subscription/unknown`, { method: 'POST', headers, body: '{}' })).status, 405);
    const groups = await fetch(`${app.url}/api/hermes/proxy/groups`, { headers: { ...headers, 'x-forwarded-for': 'spoof', Authorization: 'client-secret' } });
    assert.equal(groups.status, 200);
    assert(!JSON.stringify(await groups.json()).includes('secret'));
    assert.equal(authHeaders['x-forwarded-for'], '127.0.0.1');
    assert.equal(authHeaders.authorization, undefined);
    assert.equal(calls[0].headers.authorization, 'Bearer server-only-secret');
    assert.equal(calls[0].headers.cookie, undefined);
    const health = await fetch(`${app.url}/api/hermes/health`, { headers });
    assert.equal((await health.json()).mem0, null);
    assert.equal(calls.length, 1);
    const checks = await Promise.all([1, 2].map(() => fetch(`${app.url}/api/hermes/health/check`, { method: 'POST', headers, body: '{}' }).then(response => response.json())));
    assert(checks.every(result => result.mem0.components.length === 1 && result.icarus.components.length === 1));
    assert.equal(calls.filter(call => call.url.includes('health')).length, 2);
    await fetch(`${app.url}/api/hermes/health/check`, { method: 'POST', headers, body: '{}' });
    await fetch(`${app.url}/api/hermes/health`, { headers });
    assert.equal(calls.filter(call => call.url.includes('health')).length, 2);
    assert.equal((await fetch(`${app.url}/api/hermes/proxy/delay`, { method: 'POST', headers, body: '{"name":"node-a"}' })).status, 502);
    assert.equal((await fetch(`${app.url}/api/hermes/egress-ip?port=7891`, { headers }).then(response => response.json())).checked_at, null);
    delayEgress = true;
    const inFlight = fetch(`${app.url}/api/hermes/egress-ip`, { method: 'POST', headers, body: '{"port":7891}' });
    for (let i = 0; i < 100 && !delayedEgress; i++) await new Promise(resolve => setTimeout(resolve, 1));
    assert(delayedEgress);
    assert.equal((await fetch(`${app.url}/api/hermes/proxy/select`, { method: 'POST', headers, body: '{"group":"AI","name":"node-a"}' })).status, 200);
    delayedEgress();
    delayEgress = false;
    assert.equal((await inFlight).status, 409);
    assert.equal((await fetch(`${app.url}/api/hermes/egress-ip?port=7891`, { headers }).then(response => response.json())).checked_at, null);
    assert.equal((await fetch(`${app.url}/api/hermes/egress-ip`, { method: 'POST', headers, body: '{"port":7891}' })).status, 200);
    const selection = await fetch(`${app.url}/api/hermes/proxy/select`, { method: 'POST', headers, body: '{"group":"AI","name":"node-b"}' });
    assert.equal((await selection.json()).now, 'node-b');
    assert.equal((await fetch(`${app.url}/api/hermes/egress-ip?port=7891`, { headers }).then(response => response.json())).checked_at, null);
    mismatch = true;
    assert.equal((await fetch(`${app.url}/api/hermes/proxy/select`, { method: 'POST', headers, body: '{"group":"AI","name":"node-a"}' })).status, 409);
    brokenCredential = true;
    assert.equal((await fetch(`${app.url}/api/hermes/proxy/groups`, { headers })).status, 502);
  } finally { await app.close(); await readOnly.close(); await hermes.close(); await backend.close(); }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startFixtureServer } from '../scripts/fixture-server.mjs';

test('isolated fixture: login cookie, reads, live SSE, write protection, logout', async () => {
  const fixture = await startFixtureServer();
  try {
    const unauth = await fetch(`${fixture.url}/api/providers`);
    assert.equal(unauth.status, 401);
    const invalid = await fetch(`${fixture.url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'wrong' }) });
    assert.equal(invalid.status, 401);
    const login = await fetch(`${fixture.url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'linear-demo' }) });
    assert.equal(login.status, 200);
    const setCookie = login.headers.get('set-cookie');
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);
    const cookie = setCookie.split(';')[0];
    const headers = { Cookie: cookie };
    assert.equal((await (await fetch(`${fixture.url}/api/auth/status`, { headers })).json()).authenticated, true);
    assert.equal((await (await fetch(`${fixture.url}/api/providers`, { headers })).json()).connections.length, 5);
    assert.equal((await fetch(`${fixture.url}/api/usage/stats?period=invalid`, { headers })).status, 400);
    assert.equal((await fetch(`${fixture.url}/api/providers`, { method: 'DELETE', headers })).status, 405);
    const stream = await fetch(`${fixture.url}/api/usage/stream`, { headers });
    assert.match(stream.headers.get('content-type'), /text\/event-stream/);
    const reader = stream.body.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    assert.match(first, /data: /);
    const second = new TextDecoder().decode((await reader.read()).value);
    assert.match(second, /data: /);
    await reader.cancel();
    assert.equal((await fetch(`${fixture.url}/api/missing`, { headers })).status, 405);
    const forged = await fetch(`${fixture.url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example' }, body: JSON.stringify({ password: 'linear-demo' }) });
    assert.equal(forged.status, 403);
    const logout = await fetch(`${fixture.url}/api/auth/logout`, { method: 'POST', headers });
    assert.equal(logout.status, 200);
    assert.equal((await fetch(`${fixture.url}/api/providers`, { headers })).status, 401);
  } finally { await fixture.close(); }
});

test('core API contracts: keys, provider lifecycle, model catalog, filtered log pagination', async () => {
  const fixture = await startFixtureServer();
  try {
    const login = await fetch(`${fixture.url}/api/auth/login`, { method: 'POST', body: JSON.stringify({ password: 'linear-demo' }) });
    const headers = { Cookie: login.headers.get('set-cookie').split(';')[0], 'Content-Type': 'application/json' };
    const call = async (path, method = 'GET', body) => {
      const response = await fetch(`${fixture.url}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, data: await response.json() };
    };
    assert.equal((await call('/api/keys', 'POST', { name: '' })).status, 400);
    const created = await call('/api/keys', 'POST', { name: 'Contract key' });
    assert.equal(created.status, 201);
    const keyPath = `/api/keys/${created.data.id}`;
    assert.equal((await call(keyPath, 'PUT', { isActive: false })).data.key.isActive, false);
    assert.equal((await call(keyPath)).data.key.name, 'Contract key');
    assert.equal((await call(keyPath, 'DELETE')).status, 200);
    assert.equal((await call(keyPath)).status, 404);
    const fields = { name: 'Contract provider', provider: 'openai', apiKey: 'demo-not-real', priority: 2 };
    const provider = await call('/api/providers', 'POST', fields);
    assert.equal(provider.status, 201);
    assert.equal((await call('/api/providers', 'POST', fields)).status, 409);
    const providerPath = `/api/providers/${provider.data.connection.id}`;
    assert.equal((await call(providerPath, 'PUT', { name: 'Updated provider', isActive: false })).data.connection.isActive, false);
    await call(providerPath, 'PUT', { isActive: true });
    assert.equal((await call(`${providerPath}/test`, 'POST', {})).data.valid, true);
    assert.equal((await call('/api/providers/demo-or/test', 'POST', {})).data.valid, false);
    assert.equal((await call(providerPath, 'DELETE')).status, 200);
    assert.equal((await call('/api/models')).data.models.length, 4);
    assert.equal((await call('/api/models/custom')).data.models[0].enabled, false);
    const log = (await call('/api/usage/request-details?page=2&pageSize=20')).data;
    assert.equal(log.pagination.totalItems, 45);
    assert.equal(log.details.length, 20);
    assert.equal(log.pagination.hasPrev, true);
    const errors = (await call('/api/usage/request-details?status=error')).data;
    assert.equal(errors.pagination.totalItems, 9);
    assert(errors.details.every(entry => entry.status === 'error'));
    assert.deepEqual(log.details[0].request, { redacted: true });
    assert.equal((await call('/api/usage/request-details?page=0')).status, 400);
  } finally { await fixture.close(); }
});

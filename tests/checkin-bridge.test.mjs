import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { createCheckinBridge } from '../scripts/checkin-bridge.mjs';
import { isAllowedRequest } from '../src/api/policy.js';

async function listen(handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: 'http://127.0.0.1:' + server.address().port, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}

test('checkin policy is explicit and never opens arbitrary endpoints or read-only writes', () => {
  for (const path of ['/api/checkins', '/api/checkins/accounts', '/api/checkins/jobs']) assert.equal(isAllowedRequest(path, 'GET', false), path === '/api/checkins');
  assert.equal(isAllowedRequest('/api/checkins/accounts', 'POST', true), true);
  assert.equal(isAllowedRequest('/api/checkins/accounts/test', 'PATCH', true), true);
  assert.equal(isAllowedRequest('/api/checkins/accounts/test', 'DELETE', true), true);
  assert.equal(isAllowedRequest('/api/checkins/jobs', 'POST', true), true);
  assert.equal(isAllowedRequest('/api/checkins/jobs', 'POST', false), false);
  assert.equal(isAllowedRequest('/api/checkins/anything', 'POST', true), false);
});

test('bridge requires dashboard login and same-origin management before account or job writes', async () => {
  let writes = 0;
  const service = { snapshot: async () => ({ accounts: [], history: [], job: null }), saveAccount: async () => { writes++; return { id: 'test' }; }, startJob: async () => { writes++; return { id: 'job' }; } };
  const fetcher = async (url, options) => new Response(JSON.stringify({ authenticated: options.headers.Cookie === 'dashboard=valid' }));
  const app = await listen(createCheckinBridge({ backendUrl: 'http://backend.invalid', management: true, service, fetcher }));
  const readOnly = await listen(createCheckinBridge({ backendUrl: 'http://backend.invalid', management: false, service, fetcher }));
  try {
    assert.equal((await fetch(app.url + '/api/checkins')).status, 401);
    assert.equal((await fetch(app.url + '/api/checkins', { headers: { Cookie: 'dashboard=valid' } })).status, 200);
    for (const origin of [undefined, 'https://other.example']) assert.equal((await fetch(app.url + '/api/checkins/jobs', { method: 'POST', headers: { Cookie: 'dashboard=valid', ...(origin ? { Origin: origin } : {}), 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    assert.equal((await fetch(readOnly.url + '/api/checkins/jobs', { method: 'POST', headers: { Cookie: 'dashboard=valid', Origin: readOnly.url, 'Content-Type': 'application/json' }, body: '{}' })).status, 405);
    assert.equal(writes, 0);
    const accepted = await fetch(app.url + '/api/checkins/jobs', { method: 'POST', headers: { Cookie: 'dashboard=valid', Origin: app.url, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(accepted.status, 202);
    assert.equal(writes, 1);
    assert.equal((await fetch(app.url + '/api/checkins/accounts', { method: 'POST', headers: { Cookie: 'dashboard=valid', Origin: app.url, 'Content-Type': 'application/json' }, body: '{' })).status, 400);
    assert.equal(writes, 1);
  } finally { await app.close(); await readOnly.close(); }
});

test('unconfigured bridge is visible but does not create a vault or forward account credentials', async () => {
  const app = await listen(createCheckinBridge({ backendUrl: 'http://backend.invalid', management: true, fetcher: async () => new Response('{"authenticated":true}') }));
  try {
    const response = await fetch(app.url + '/api/checkins');
    assert.equal(response.status, 200);
    assert.equal((await response.json()).configured, false);
    assert.equal((await fetch(app.url + '/api/checkins/jobs', { method: 'POST', headers: { Origin: app.url, 'Content-Type': 'application/json' }, body: '{}' })).status, 503);
  } finally { await app.close(); }
});

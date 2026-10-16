import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { runProviderBatch } from '../src/api/provider-batch.js';

async function setup(t, respond) {
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push({ path: request.url, method: request.method, body: JSON.parse(body) });
    const result = await respond(request.url);
    response.writeHead(result.status || 200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(result.body));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const fetcher = globalThis.fetch;
  const management = globalThis.__MANAGEMENT_ENABLED__;
  globalThis.__MANAGEMENT_ENABLED__ = true;
  t.mock.method(globalThis, 'fetch', (url, options) => fetcher(new URL(url, `http://127.0.0.1:${server.address().port}`), options));
  t.after(async () => {
    if (management === undefined) delete globalThis.__MANAGEMENT_ENABLED__;
    else globalThis.__MANAGEMENT_ENABLED__ = management;
    await new Promise(resolve => server.close(resolve));
  });
  return requests;
}

test('batch tests skip disabled accounts, continue after provider and HTTP failures, and retain progress snapshots', async t => {
  let active = 0;
  let maximum = 0;
  const requests = await setup(t, async url => {
    maximum = Math.max(maximum, ++active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    return url.includes('/invalid/') ? { body: { valid: false, error: 'invalid credential' } }
      : url.includes('/unavailable/') ? { status: 503, body: { error: 'upstream unavailable' } }
        : { body: { valid: true } };
  });
  const connections = ['first', 'disabled', 'invalid', 'unavailable', 'last'].map(id => ({ id, name: id, isActive: id !== 'disabled' }));
  const progress = [];
  const results = await runProviderBatch(connections, 'test', null, items => progress.push(items));
  assert.deepEqual(results.map(item => item.status), ['success', 'skipped', 'error', 'error', 'success']);
  assert.deepEqual(requests.map(item => item.path), ['/api/providers/first/test', '/api/providers/invalid/test', '/api/providers/unavailable/test', '/api/providers/last/test']);
  assert(requests.every(item => item.method === 'POST' && Object.keys(item.body).length === 0));
  assert.deepEqual(progress.map(items => items.length), [1, 2, 3, 4, 5]);
  assert.equal(maximum, 1);
  assert.equal(results[2].error, 'invalid credential');
  assert.equal(results[3].error.status, 503);
});

test('batch proxy updates include disabled accounts and retry only explicit failed targets', async t => {
  let fail = true;
  const requests = await setup(t, url => url.endsWith('/second') && fail ? { status: 503, body: { error: 'save failed' } } : { body: { connection: {} } });
  const targets = [{ id: 'first', isActive: false }, { id: 'second', isActive: true }];
  const body = { proxyPoolId: 'pool-id' };
  const results = await runProviderBatch(targets, 'proxy', body, () => {});
  assert.deepEqual(results.map(item => item.status), ['success', 'error']);
  fail = false;
  const retried = await runProviderBatch(results.filter(item => item.status === 'error').map(item => item.connection), 'proxy', body, () => {});
  assert.deepEqual(retried.map(item => item.status), ['success']);
  assert.deepEqual(requests.map(item => item.path), ['/api/providers/first', '/api/providers/second', '/api/providers/second']);
  assert(requests.every(item => item.method === 'PUT'));
  assert(requests.every(item => JSON.stringify(item.body) === JSON.stringify(body)));
});

test('batch requests encode connection IDs and preserve dedicated and inherited proxy payloads', async t => {
  const requests = await setup(t, () => ({ body: { connection: {} } }));
  const target = [{ id: 'account/with space', isActive: true }];
  const dedicated = { proxyPoolId: null, connectionProxyEnabled: true, connectionProxyUrl: 'http://127.0.0.1:7892', connectionNoProxy: '.example.com' };
  const inherited = { proxyPoolId: null, connectionProxyEnabled: false, connectionProxyUrl: '', connectionNoProxy: '' };
  await runProviderBatch(target, 'proxy', dedicated, () => {});
  await runProviderBatch(target, 'proxy', inherited, () => {});
  assert(requests.every(item => item.path === '/api/providers/account%2Fwith%20space'));
  assert.deepEqual(requests.map(item => item.body), [dedicated, inherited]);
});

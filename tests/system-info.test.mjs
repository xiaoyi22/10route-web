import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';
import { attachRates, cpuUsage, parseDiskIo, parseMemory, parseMemDetail, parseNetwork, parsePressure, rateBetween } from '../scripts/system-info.mjs';
import { createSystemBridge } from '../scripts/system-bridge.mjs';
import { isAllowedRequest } from '../src/api/policy.js';

test('Linux memory uses available memory and never substitutes missing counters with zero', () => {
  const memory = parseMemory('MemTotal: 1000 kB\nMemAvailable: 400 kB\nMemFree: 20 kB\nSwapTotal: 200 kB\nSwapFree: 150 kB\n');
  assert.deepEqual(memory.memory, { totalBytes: 1024000, availableBytes: 409600, usedBytes: 614400, usagePercent: 60 });
  assert.deepEqual(memory.swap, { totalBytes: 204800, availableBytes: 153600, usedBytes: 51200, usagePercent: 25 });
  assert.equal(parseMemory('MemTotal: 1000 kB\n').memory.usedBytes, null);
  assert.equal(parseMemory('SwapTotal: 0 kB\nSwapFree: 0 kB\n').swap.usagePercent, null);
});

test('CPU usage is calculated over a sampling interval, not since boot', () => {
  assert.equal(cpuUsage([{ times: { user: 100, nice: 0, sys: 50, idle: 850, irq: 0 } }], [{ times: { user: 130, nice: 0, sys: 60, idle: 910, irq: 0 } }]), 40);
  assert.equal(cpuUsage([], []), null);
  assert.equal(cpuUsage([{ times: { idle: 1 } }], [{ times: { idle: 1 } }]), null);
});

test('/proc parsers keep missing counters unknown instead of inventing zero', () => {
  const network = parseNetwork('Inter-|   Receive                                                |  Transmit\n face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed\n    lo: 100 1 0 0 0 0 0 0 200 2 0 0 0 0 0 0\n ens18: 5000 10 0 0 0 0 0 0 7000 20 0 0 0 0 0 0\n  veth1: 1 1 0 0 0 0 0 0 2 1 0 0 0 0 0 0\n');
  assert.deepEqual(network, [{ name: 'ens18', receivedBytes: 5000, transmittedBytes: 7000 }]);
  const disk = parseDiskIo('   8       0 sda 100 0 2000 30 50 0 4000 60 0 70 90\n   8       1 sda1 1 0 2 3 4 0 5 6 0 7 8\n', ['sda']);
  assert.deepEqual(disk, [{ name: 'sda', readBytes: 1024000, writtenBytes: 2048000, busyMilliseconds: 70 }]);
  assert.deepEqual(parseDiskIo('', ['sda']), []);
  assert.deepEqual(parsePressure('some avg10=0.24 avg60=0.19 avg300=0.26 total=12\nfull avg10=0.00 avg60=0.00 avg300=0.00 total=0\n'), { some: 0.24, full: 0 });
  assert.deepEqual(parsePressure(''), { some: null, full: null });
  const detail = parseMemDetail('MemTotal: 1000 kB\nBuffers: 10 kB\nCached: 20 kB\nSlab: 30 kB\n');
  assert.deepEqual(detail, { buffersBytes: 10240, cachedBytes: 20480, slabBytes: 30720, dirtyBytes: null, anonymousBytes: null, swapCachedBytes: null });
});

test('rates use the elapsed interval and never turn a counter reset into traffic', () => {
  const before = [{ name: 'ens18', receivedBytes: 1000, transmittedBytes: 500 }];
  const after = [{ name: 'ens18', receivedBytes: 3000, transmittedBytes: 1500 }];
  assert.deepEqual(rateBetween(before, after, 2000), [{ name: 'ens18', receivedBytes: 1000, transmittedBytes: 500 }]);
  assert.deepEqual(rateBetween(after, before, 2000), [{ name: 'ens18', receivedBytes: 0, transmittedBytes: 0 }]);
  assert.equal(rateBetween(before, after, 0), null);
  assert.equal(rateBetween(null, after, 1000), null);
  assert.equal(rateBetween(before, [{ name: 'eth9', receivedBytes: 1, transmittedBytes: 1 }], 1000), null);
});

test('rates are attached only when two samples share an interval', () => {
  const first = { sampledAt: '2026-10-22T00:00:00.000Z', network: [{ name: 'ens18', receivedBytes: 1000, transmittedBytes: 500 }], diskActivity: { devices: [{ name: 'sda', readBytes: 4096, writtenBytes: 8192, busyMilliseconds: 100 }] } };
  const second = { sampledAt: '2026-10-22T00:00:10.000Z', network: [{ name: 'ens18', receivedBytes: 3000, transmittedBytes: 2500 }], diskActivity: { devices: [{ name: 'sda', readBytes: 4096, writtenBytes: 83968, busyMilliseconds: 600 }] } };
  const initial = attachRates(first, undefined);
  assert.equal(initial.network[0].rate, null);
  assert.equal(initial.diskActivity.rates, null);
  const attached = attachRates(second, first);
  assert.deepEqual(attached.network, [{ name: 'ens18', rate: { name: 'ens18', receivedBytes: 200, transmittedBytes: 200 } }]);
  assert.deepEqual(attached.diskActivity.rates, [{ name: 'sda', readBytes: 0, writtenBytes: 7577.6, busyMilliseconds: 50 }]);
  assert.equal(attached.diskActivity.sampledMilliseconds, 10000);
  assert.equal(attached.diskActivity.busyPercent, 5);
  assert.equal(attachRates(second, { ...first, sampledAt: second.sampledAt }).diskActivity.rates, null);
});

async function listen(handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: 'http://127.0.0.1:' + server.address().port, close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}

test('system endpoint authenticates every request, shares successful samples, and forbids writes', async () => {
  let authCalls = 0;
  let samples = 0;
  const backend = await listen((request, response) => {
    authCalls++;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ authenticated: request.headers.cookie === 'auth_token=session', requireLogin: true }));
  });
  const bridge = createSystemBridge({ backendUrl: backend.url, collector: async () => { samples++; return { hostname: 'kn10', sampledAt: '2026-10-07T00:00:00Z' }; } });
  const frontend = await listen(bridge);
  try {
    assert.equal(isAllowedRequest('/api/system/info'), true);
    assert.equal((await fetch(frontend.url + '/api/system/info')).status, 401);
    assert.equal(samples, 0);
    const headers = { Cookie: 'auth_token=session' };
    const responses = await Promise.all([fetch(frontend.url + '/api/system/info', { headers }), fetch(frontend.url + '/api/system/info', { headers })]);
    assert.equal(responses[0].status, 200);
    assert.equal((await responses[0].json()).hostname, 'kn10');
    assert.equal(samples, 1);
    assert.equal(authCalls, 3);
    assert.equal((await fetch(frontend.url + '/api/system/info', { headers, method: 'POST' })).status, 405);
    assert.equal((await fetch(frontend.url + '/api/system/info')).status, 401);
    assert.equal(samples, 1);
  } finally { await frontend.close(); await backend.close(); }
});

test('collector failures are unavailable, not cached healthy or zero-filled samples', async () => {
  let samples = 0;
  const backend = await listen((request, response) => { response.setHeader('Content-Type', 'application/json'); response.end('{"authenticated":true}'); });
  const bridge = createSystemBridge({ backendUrl: backend.url, collector: async () => { samples++; if (samples === 1) throw new Error('private-key-path'); return { hostname: 'kn10' }; } });
  const frontend = await listen(bridge);
  try {
    const failed = await fetch(frontend.url + '/api/system/info');
    assert.equal(failed.status, 503);
    assert(!JSON.stringify(await failed.json()).includes('private-key-path'));
    assert.equal((await fetch(frontend.url + '/api/system/info')).status, 200);
    assert.equal(samples, 2);
  } finally { await frontend.close(); await backend.close(); }
});

test('expired samples are refreshed and a failed refresh cannot masquerade as a healthy cached response', async context => {
  let now = 1000;
  let samples = 0;
  context.mock.method(Date, 'now', () => now);
  const backend = await listen((request, response) => { response.setHeader('Content-Type', 'application/json'); response.end('{"authenticated":true}'); });
  const frontend = await listen(createSystemBridge({ backendUrl: backend.url, collector: async () => { samples++; if (samples === 2) throw new Error('offline'); return { hostname: 'kn10', sequence: samples }; } }));
  try {
    assert.equal((await (await fetch(frontend.url + '/api/system/info')).json()).sequence, 1);
    now = 11000;
    assert.equal((await fetch(frontend.url + '/api/system/info')).status, 503);
    assert.equal((await (await fetch(frontend.url + '/api/system/info')).json()).sequence, 3);
  } finally { await frontend.close(); await backend.close(); }
});

test('unconfigured remote collection never substitutes the preview computer for the gateway host', async () => {
  const bridge = createSystemBridge({ backendUrl: 'http://unconfigured-gateway.invalid', fetcher: async () => new Response('{"authenticated":true}', { headers: { 'Content-Type': 'application/json' } }) });
  const frontend = await listen(bridge);
  try { assert.equal((await fetch(frontend.url + '/api/system/info')).status, 503); }
  finally { await frontend.close(); }
  assert.throws(() => createSystemBridge({ backendUrl: 'http://localhost', sshTarget: '-oProxyCommand=unsafe' }), /Invalid/);
});

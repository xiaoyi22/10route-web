import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEgressCache, egressBinding, EGRESS_TTL } from '../src/api/egress-cache.js';

const entry = { port: 7891, group: 'AI', chain: ['AI', 'node-a'] };
function fixture() {
  let time = Date.now();
  let failure = false;
  const values = new Map();
  const calls = [];
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const request = async (url, options = {}) => {
    calls.push(options.method || 'GET');
    if (options.method !== 'POST') return { checked_at: null };
    if (failure) throw new Error('probe failed');
    return { ip: '203.0.113.1', checked_at: new Date(time).toISOString(), cache_binding: JSON.parse(options.body).binding };
  };
  return { storage, calls, request, now: () => time, advance: amount => { time += amount; }, fail: () => { failure = true; } };
}

test('egress automatically fills an empty cache, deduplicates and survives reload', async () => {
  const context = fixture();
  const cache = createEgressCache(context);
  const results = await Promise.all([cache.load(entry), cache.load(entry)]);
  assert(results.every(result => result.ip === '203.0.113.1'));
  assert.deepEqual(context.calls, ['GET', 'POST']);
  await cache.load(entry);
  const restored = createEgressCache(context);
  assert.equal(restored.read(entry).ip, '203.0.113.1');
  await restored.load(entry);
  assert.equal(context.calls.length, 2);
  context.advance(EGRESS_TTL + 1);
  await restored.load(entry);
  assert.equal(context.calls.filter(method => method === 'POST').length, 2);
});

test('failed forced refresh keeps the valid result and applies backoff', async () => {
  const context = fixture();
  const cache = createEgressCache(context);
  await cache.load(entry);
  context.fail();
  await assert.rejects(cache.load(entry, { force: true }), /probe failed/);
  assert.equal(cache.read(entry).ip, '203.0.113.1');
  assert(cache.retryAt(entry) > context.now());
  context.advance(EGRESS_TTL + 1);
  await assert.rejects(cache.load(entry), /probe failed/);
  const count = context.calls.length;
  await assert.rejects(cache.load(entry), /probe failed/);
  assert.equal(context.calls.length, count);
});

test('node changes reject a late old result and never pollute the new binding', async () => {
  let finishOld;
  const next = { ...entry, chain: ['AI', 'node-b'] };
  const cache = createEgressCache({ request: async (url, options = {}) => {
    if (options.method !== 'POST') return { checked_at: null };
    const binding = JSON.parse(options.body).binding;
    if (binding === egressBinding(entry)) return new Promise(resolve => { finishOld = resolve; });
    return { ip: '203.0.113.2', checked_at: new Date().toISOString(), cache_binding: binding };
  } });
  const pending = cache.load(entry);
  const rejected = assert.rejects(pending, error => error.name === 'AbortError');
  while (!finishOld) await new Promise(resolve => setImmediate(resolve));
  await cache.load(next);
  finishOld({ ip: '203.0.113.1', checked_at: new Date().toISOString(), cache_binding: egressBinding(entry) });
  await rejected;
  assert.equal(cache.read(next).ip, '203.0.113.2');
  assert.equal(cache.read(entry), null);
  cache.clear();
  assert.equal(cache.read(next), null);
});

test('a superseded cache read cannot launch an old-node probe after selection or logout', async () => {
  let finishRead;
  let probes = 0;
  const cache = createEgressCache({ request: async (url, options = {}) => {
    if (options.method === 'POST') { probes++; throw new Error('Old-node probe must not start'); }
    return new Promise(resolve => { finishRead = resolve; });
  } });
  const pending = cache.load(entry);
  const rejected = assert.rejects(pending, error => error.name === 'AbortError');
  cache.clear();
  finishRead({ checked_at: null });
  await rejected;
  assert.equal(probes, 0);
  assert.equal(cache.read(entry), null);
});

test('blocked storage and missing node metadata cannot break automatic detection', async () => {
  let probes = 0;
  const cache = createEgressCache({ storage: () => { throw new Error('storage disabled'); }, request: async (url, options = {}) => {
    if (options.method !== 'POST') return { ip: '203.0.113.99', checked_at: new Date().toISOString() };
    probes++;
    return { ip: '203.0.113.1', checked_at: new Date().toISOString(), cache_binding: JSON.parse(options.body).binding };
  } });
  assert.equal((await cache.load(entry)).ip, '203.0.113.1');
  assert.equal(probes, 1);
  assert.equal((await cache.load(entry)).ip, '203.0.113.1');
  assert.equal(probes, 1);
});

test('a failed manual refresh retries after backoff even while the old result is fresh', async () => {
  const context = fixture();
  const cache = createEgressCache(context);
  await cache.load(entry);
  context.fail();
  await assert.rejects(cache.load(entry, { force: true }), /probe failed/);
  assert.equal(cache.nextAt(entry), context.now() + 5000);
  await assert.rejects(cache.load(entry), /probe failed/);
  assert.equal(context.calls.filter(method => method === 'POST').length, 2);
  context.advance(5001);
  await assert.rejects(cache.load(entry), /probe failed/);
  assert.equal(context.calls.filter(method => method === 'POST').length, 3);
  assert.equal(cache.nextAt(entry), context.now() + 10000);
  assert.equal(cache.read(entry).ip, '203.0.113.1');
});

test('read-only access never triggers an active probe', async () => {
  const context = fixture();
  const cache = createEgressCache(context);
  assert.equal(await cache.load(entry, { allowProbe: false }), null);
  assert.deepEqual(context.calls, ['GET']);
});

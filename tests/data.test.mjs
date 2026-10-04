import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cacheRate, modelCatalog, providerId, requestTokens, requestSpeed, responseModeLabel } from '../src/api/data.js';

test('management catalog restores disabled built-ins after reload and preserves custom models', () => {
  const connections = [{ provider: 'codebuddy-cn', isActive: true }];
  const custom = [{ providerAlias: 'cbcn', id: 'custom', name: 'Custom name', enabled: false }];
  const models = modelCatalog([], custom, connections, [], { cbcn: ['hy3', 'custom'], 'codebuddy-cn': ['hy3'], cx: ['offline'] });
  assert.equal(models.length, 3);
  assert.deepEqual(models.find(model => model.id === 'cbcn/hy3'), { id: 'cbcn/hy3', upstreamId: 'hy3', name: 'hy3', provider: 'cbcn', caps: {}, enabled: false, custom: false, connected: true, disabledProviders: ['cbcn', 'codebuddy-cn'] });
  assert.equal(models.find(model => model.id === 'cbcn/custom').custom, true);
  assert.equal(models.find(model => model.id === 'cbcn/custom').name, 'Custom name');
  assert.equal(models.find(model => model.id === 'cx/offline').connected, false);
  const enabled = modelCatalog([{ provider: 'cbcn', model: 'hy3', routedModel: 'cbcn/hy3', name: 'Hy3', caps: { contextWindow: 256000 } }], [], connections);
  assert.equal(enabled[0].enabled, true);
  assert.equal(enabled[0].caps.contextWindow, 256000);
  assert.equal(modelCatalog([], [], connections).length, 0);
});

test('cache rates distinguish zero hits, no traffic, missing and inconsistent counters', () => {
  assert.equal(cacheRate(250, 1000), 25);
  assert.equal(cacheRate(0, 1000), 0);
  for (const [cached, input] of [[0, 0], [undefined, 100], [200, 100], [-1, 100], [NaN, 100], [1, Infinity]]) assert.equal(cacheRate(cached, input), null);
});

test('request details preserve zero counters and normalize provider token formats', () => {
  assert.deepEqual(requestTokens({ input_tokens: 100, output_tokens: 0, cache_read_input_tokens: 40, cache_creation_input_tokens: 20, output_tokens_details: { reasoning_tokens: 0 } }), { input: 100, output: 0, cached: 40, created: 20, reasoning: 0 });
  assert.equal(requestTokens({ cached_tokens: 0, prompt_tokens_details: { cached_tokens: 50 } }).cached, 0);
  assert.equal(requestTokens({ prompt_tokens_details: { cached_tokens: 50 } }).cached, 50);
  assert.equal(requestTokens(null).cached, null);
  assert.equal(responseModeLabel('streaming'), '流式');
  assert.equal(responseModeLabel('non-streaming'), '非流式');
  assert.equal(responseModeLabel(null), '—');
});

test('connected model scope uses provider IDs, route aliases and custom node prefixes', () => {
  assert.equal(providerId('cx'), 'codex');
  assert.equal(providerId('cc'), 'claude');
  assert.equal(providerId('ag'), 'antigravity');
  const models = modelCatalog([
    { provider: 'cx', model: 'gpt', routedModel: 'cx/gpt' },
    { provider: 'openai', model: 'gpt', routedModel: 'openai/gpt' },
    { provider: 'cc', model: 'sonnet', routedModel: 'cc/sonnet' },
  ], [
    { providerAlias: 'cx', id: 'new-gpt' },
    { providerAlias: 'my-node', id: 'custom' },
    { providerAlias: 'disabled-node', id: 'hidden' },
    { providerAlias: 'cx', id: 'gpt', enabled: false },
  ], [
    { provider: 'codex' },
    { provider: 'claude', isActive: false },
    { provider: 'node-active' },
    { provider: 'node-disabled', isActive: false },
  ], [
    { id: 'node-active', prefix: 'my-node' },
    { id: 'node-disabled', prefix: 'disabled-node' },
  ]);
  assert.deepEqual(models.filter(model => model.connected && model.enabled).map(model => model.id), ['cx/new-gpt', 'my-node/custom']);
  assert.equal(models.filter(model => model.id === 'cx/gpt').length, 1);
  assert.equal(models.find(model => model.id === 'openai/gpt').connected, false);
  assert.deepEqual(modelCatalog(), []);
});

test('request TPS uses output tokens and measured generation time, with explicit gateway fallback', () => {
  const entry = { responseMode: 'streaming', tokens: { prompt_tokens: 10000, completion_tokens: 100, cached_tokens: 9000 }, latency: { ttft: 1000, total: 3000 } };
  assert.equal(requestSpeed(entry).tps, 50);
  assert.equal(requestSpeed(entry).durationMs, 2000);
  assert.equal(requestSpeed({ ...entry, responseMode: 'non-streaming' }).tps, 100 / 3);
  assert.equal(requestSpeed({ ...entry, latency: { total: 2000 } }).tps, 50);
  const burst = requestSpeed({ ...entry, latency: { ttft: 2800, total: 3000 } });
  assert.equal(burst.durationMs, 3000);
  assert.match(burst.basis, /300/);
  assert.equal(requestSpeed({ ...entry, tokens: { output_tokens: 30 }, latency: { total: 1000, ttft: 990 } }).tps, 30);
  assert.equal(requestSpeed({ ...entry, tokens: { output_tokens: 30 }, latency: { total: 1000, ttft: 1500 } }).tps, 30);
  for (const patch of [{ imported: true }, { tokens: {} }, { tokens: { completion_tokens: 0 } }, { tokens: { completion_tokens: -1 } }, { latency: {} }, { latency: { total: 0 } }, { latency: { total: 49 } }, { latency: { total: Infinity } }, { latency: { total: '1000' } }]) assert.equal(requestSpeed({ ...entry, ...patch }), null);
});

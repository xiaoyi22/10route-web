import assert from 'node:assert/strict';
import { test } from 'node:test';
import { logCost, formatLogCost } from '../src/api/log-pricing.js';

test('log estimates use current provider rates and charge cache subsets once', () => {
  const prices = { codex: { gpt: { input: 2, output: 8, cached: 0, cache_creation: 3, reasoning_included: true } } };
  const entry = { provider: 'cx', model: 'gpt', tokens: { prompt_tokens: 1000, completion_tokens: 200, cached_tokens: 400, cache_creation_input_tokens: 100 } };
  assert.equal(logCost(entry, prices).value, 0.0029);
  assert.equal(logCost(entry, prices).source, 'estimated');
  assert.equal(logCost({ ...entry, cost: 0 }, prices).value, 0);
  assert.equal(logCost({ ...entry, model: 'unknown' }, prices), null);
  assert.equal(logCost({ ...entry, tokens: {} }, prices), null);
  assert.equal(formatLogCost(null), '—');
  assert.equal(formatLogCost({ value: 0 }), '$0.000000');
});

test('raw Claude cache-exclusive input and long-context pricing remain distinct', () => {
  const prices = { claude: { sonnet: { input: 3, output: 15, cached: 0.3, cache_creation: 3.75, reasoning_included: true, long_context: { threshold: 1000, input: 6 } } } };
  const entry = { provider: 'claude', model: 'sonnet', tokens: { input_tokens: 200, output_tokens: 100, cache_read_input_tokens: 1000 } };
  assert.equal(logCost(entry, prices).value, 0.003);
  assert.equal(logCost({ ...entry, tokens: { ...entry.tokens, cached_tokens: 1000 } }, prices).value, 0.003);
});

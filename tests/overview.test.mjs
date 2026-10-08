import assert from 'node:assert/strict';
import { test } from 'node:test';
import { overviewSummary, formatBytes, formatUptime } from '../src/api/overview.js';
import * as overview from '../src/api/overview.js';

test('overview counts in-flight requests rather than account groups and preserves missing values', () => {
  const summary = overviewSummary({ totalRequests: 12, totalPromptTokens: 100, totalCompletionTokens: 20, totalCost: 0, activeRequests: [{ model: 'a', count: 2 }, { model: 'b', count: 3 }], byProvider: { one: { requests: 9 }, two: { requests: 3 } } }, { connections: [{ isActive: true, testStatus: 'success' }, { isActive: false, lastError: 'expired' }, { isActive: true, lastError: 'failed' }] });
  assert.equal(summary.activeCount, 5);
  assert.equal(summary.totalTokens, 120);
  assert.equal(summary.enabledAccounts, 2);
  assert.equal(summary.errorAccounts, 1);
  assert.deepEqual(summary.providers.map(item => item.share), [75, 25]);
  assert.equal(overviewSummary({}, null).activeCount, null);
  assert.equal(overviewSummary({}, null).enabledAccounts, null);
  assert.equal(overviewSummary({ totalPromptTokens: 100 }, null).totalTokens, null);
  assert.equal(overviewSummary({ activeRequests: [] }, { connections: [] }).activeCount, 0);
});

test('pending model counters are a fallback, not additional in-flight requests', () => {
  assert.equal(overviewSummary({ pending: { byModel: { a: 2, b: 1 }, byAccount: { first: { a: 2 } } } }, null).activeCount, 3);
  assert.equal(overviewSummary({ activeRequests: [{ count: 2 }], pending: { byModel: { a: 2 } } }, null).activeCount, 2);
  assert.equal(overviewSummary({ activeRequests: [{ count: -1 }] }, null).activeCount, null);
});

test('system formatters distinguish unavailable values from zero and use readable units', () => {
  assert.equal(formatBytes(null), '—');
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1073741824), '1.0 GiB');
  assert.equal(formatUptime(null), '—');
  assert.equal(formatUptime(90061), '1 天 1 小时 1 分钟');
  assert.equal(formatUptime(0), '不足 1 分钟');
});

test('request trends use real minute buckets, never token chart points or made-up zero requests', () => {
  assert.deepEqual(overview.requestTrendPoints?.({ last10Minutes: [{ requests: 3 }, { requests: 0 }, {}] }), [{ label: '2 分钟前', requests: 3 }, { label: '1 分钟前', requests: 0 }, { label: '当前分钟', requests: null }]);
  assert.equal(overview.requestTrendPoints?.({}), null);
});

test('recent throughput averages the last five complete minutes and excludes older buckets, the current minute and cached tokens', () => {
  const stats = { totalRequests: 999999, totalCachedTokens: 999999, last10Minutes: [
    { requests: 999, promptTokens: 99999, completionTokens: 99999 },
    { requests: 999, promptTokens: 99999, completionTokens: 99999 },
    { requests: 999, promptTokens: 99999, completionTokens: 99999 },
    { requests: 999, promptTokens: 99999, completionTokens: 99999 },
    { requests: 1, promptTokens: 100, completionTokens: 10, cachedTokens: 100 },
    { requests: 2, promptTokens: 200, completionTokens: 20, cachedTokens: 200 },
    { requests: 3, promptTokens: 300, completionTokens: 30, cachedTokens: 300 },
    { requests: 4, promptTokens: 400, completionTokens: 40, cachedTokens: 400 },
    { requests: 5, promptTokens: 500, completionTokens: 50, cachedTokens: 500 },
    { requests: 999, promptTokens: 99999, completionTokens: 99999 },
  ] };
  assert.deepEqual(overview.recentThroughput?.(stats), { rpm: 3, tpm: 330, inputTpm: 300, outputTpm: 30 });
});

test('recent throughput distinguishes zero traffic, low traffic and unavailable windows', () => {
  const zero = Array.from({ length: 6 }, () => ({ requests: 0, promptTokens: 0, completionTokens: 0 }));
  assert.deepEqual(overview.recentThroughput?.({ last10Minutes: zero }), { rpm: 0, tpm: 0, inputTpm: 0, outputTpm: 0 });
  assert.deepEqual(overview.recentThroughput?.({ last10Minutes: [{ requests: 1, promptTokens: 1, completionTokens: 1 }, ...zero.slice(1)] }), { rpm: .2, tpm: .4, inputTpm: .2, outputTpm: .2 });
  for (const stats of [null, {}, { last10Minutes: [] }, { last10Minutes: zero.slice(0, 5) }, { last10Minutes: {} }]) {
    assert.deepEqual(overview.recentThroughput?.(stats), { rpm: null, tpm: null, inputTpm: null, outputTpm: null });
  }
});

test('missing or invalid token counters do not fabricate TPM or suppress valid RPM', () => {
  const zero = Array.from({ length: 6 }, () => ({ requests: 0, promptTokens: 0, completionTokens: 0 }));
  for (const value of [undefined, null, -1, NaN, Infinity, '100']) {
    assert.deepEqual(overview.recentThroughput?.({ last10Minutes: [{ requests: 5, promptTokens: value, completionTokens: 5 }, ...zero.slice(1)] }), { rpm: 1, tpm: null, inputTpm: null, outputTpm: 1 });
  }
  assert.deepEqual(overview.recentThroughput?.({ last10Minutes: [{ promptTokens: 10, completionTokens: 5 }, ...zero.slice(1)] }), { rpm: null, tpm: 3, inputTpm: 2, outputTpm: 1 });
  assert.deepEqual(overview.recentThroughput?.({ last10Minutes: [null, ...zero.slice(1)] }), { rpm: null, tpm: null, inputTpm: null, outputTpm: null });
});

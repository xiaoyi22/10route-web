import assert from 'node:assert/strict';
import test from 'node:test';
import { requestLatencyPresentation } from '../src/api/request-latency.js';

test('reference durations and tones match the six screenshot examples', () => {
  const cases = [
    [16740, 137000, '16.74s', '2m 17s', 'warning', 'warning'],
    [36830, 75000, '36.83s', '1m 15s', 'slow', 'warning'],
    [3250, 24900, '3.25s', '24.90s', 'fast', 'fast'],
    [6540, 10810, '6.54s', '10.81s', 'fast', 'fast'],
    [23800, 32850, '23.80s', '32.85s', 'slow', 'fast'],
    [2730, 14590, '2.73s', '14.59s', 'fast', 'fast'],
  ];
  for (const [ttft, total, first, duration, firstTone, totalTone] of cases) {
    const result = requestLatencyPresentation({ latency: { ttft, total } });
    assert.deepEqual([result.first, result.total, result.firstTone, result.totalTone], [first, duration, firstTone, totalTone]);
  }
});

test('zero, minute rounding and unknown records stay distinct', () => {
  assert.equal(requestLatencyPresentation({ latency: { ttft: 9999 } }).firstTone, 'fast');
  assert.equal(requestLatencyPresentation({ latency: { ttft: 10000 } }).firstTone, 'warning');
  assert.equal(requestLatencyPresentation({ latency: { ttft: 19999 } }).firstTone, 'warning');
  assert.equal(requestLatencyPresentation({ latency: { ttft: 20000 } }).firstTone, 'slow');
  assert.equal(requestLatencyPresentation({ latency: { total: 60000 } }).totalTone, 'warning');
  assert.equal(requestLatencyPresentation({ latency: { total: 0, ttft: 0 } }).total, '0.00s');
  assert.equal(requestLatencyPresentation({ latency: { total: 59999 } }).total, '1m 0s');
  assert.equal(requestLatencyPresentation({ latency: { total: 119600 } }).total, '2m 0s');
  for (const entry of [{}, { imported: true, latency: { ttft: 1000, total: 3000 } }, { latency: { ttft: NaN, total: Infinity } }, { latency: { ttft: -1, total: -1 } }]) {
    const result = requestLatencyPresentation(entry);
    assert.deepEqual([result.firstTone, result.totalTone], ['unknown', 'unknown']);
    assert.equal(result.first, result.total);
    assert(!result.first.includes('NaN') && !result.total.includes('Infinity'));
  }
});

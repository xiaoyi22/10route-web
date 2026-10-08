import assert from 'node:assert/strict';
import test from 'node:test';
import { requestUsageSource, requestErrorLabel } from '../src/api/data.js';

test('request usage labels do not infer actual measurements from legacy token counts', () => {
  assert.equal(requestUsageSource({ tokens: { prompt_tokens: 10 } }), '未记录');
  assert.equal(requestUsageSource({ usageSource: 'upstream' }), '上游实测');
  assert.equal(requestUsageSource({ usageSource: 'unavailable' }), '未提供');
});

test('estimated usage is explicitly distinguished from upstream billing counts', () => {
  assert.equal(requestUsageSource({ tokens: { estimated: true } }), '估算（非上游计费值）');
  assert.equal(requestUsageSource({ usageSource: 'estimated' }), '估算（非上游计费值）');
});

test('daily channel quota errors retain their HTTP failure status', () => {
  assert.equal(requestErrorLabel({ status: 'error', error: { code: 'channel_daily_success_limit_exceeded', status: 429 } }), '渠道当日成功次数已达上限（HTTP 429）');
});

test('stream interruption and ordinary upstream errors remain visible', () => {
  assert.equal(requestErrorLabel({ status: 'failed', error: { code: 'stream_disconnected' } }), '流式响应中断');
  assert.equal(requestErrorLabel({ status: 'error', error: { message: 'Unavailable', status: 502 } }), 'Unavailable（HTTP 502）');
});

test('missing historical error metadata is not fabricated', () => {
  assert.equal(requestErrorLabel({ status: 'failed' }), '未记录');
  assert.equal(requestErrorLabel({ status: 'success' }), '—');
});

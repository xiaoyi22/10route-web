import assert from 'node:assert/strict';
import test from 'node:test';
import { isSpentPack, quotaGroups, quotaPool, quotaTiming } from '../src/components/quotaPresentation.js';

const now = Date.parse('2026-10-04T00:00:00Z');
const future = '2026-10-05T02:00:00Z';
const pack = (name, total, used, extra = {}) => ({ name, total, used, recurring: false, resetAt: future, unit: 'credits', ...extra });

test('model windows share their family caption without adding their limits', () => {
  const rows = ['Gemini Models · 5h Window', 'Claude and GPT models · 5h Window', 'Gemini Models · Weekly Window', 'Claude and GPT models · Weekly Window'].map(name => ({ name, percentScale: true, remainingPercentage: 80 }));
  const groups = quotaGroups(rows);
  assert.deepEqual(groups.map(group => [group.family, group.rows.map(item => item.label)]), [['Gemini 模型', ['5 小时', '每周']], ['Claude 与 GPT 模型', ['5 小时', '每周']]]);
  assert.equal(quotaPool({ provider: 'antigravity', quotas: rows }, now), null);
});

test('CodeBuddy totals exclude the total row and exhausted packs have no segment', () => {
  const quotas = [pack('Total Points', 400, 125), pack('Monthly', 100, 25, { recurring: true, giftPack: true }), pack('Bonus Pack 1', 200, 0), pack('Bonus Pack 2', 100, 100)];
  const pool = quotaPool({ provider: 'codebuddy-cn', quotas }, now);
  assert.equal(pool.total, 400);
  assert.equal(pool.remaining, 275);
  assert.equal(pool.percent, 68.75);
  assert.equal(pool.live.length, 2);
  assert.deepEqual(pool.segments.map(segment => segment.remaining), [75, 200]);
  assert.equal(pool.detail.length, 3);
  assert.equal(isSpentPack(quotas[3], now), true);
  assert.equal(isSpentPack(pack('Monthly', 100, 100, { recurring: true }), now), false);
});

test('Qoder aggregate uses its pack breakdown once and preserves an unmatched aggregate', () => {
  const quotas = [pack('Resource Package', 900, 152, { aggregate: true, summarizesDetail: true, resetAt: null }), pack('Bonus Pack 1', 500, 100, { detailOnly: true }), pack('Bonus Pack 2', 400, 52, { detailOnly: true })];
  const pool = quotaPool({ provider: 'qoder', quotas }, now);
  assert.equal(pool.total, 900);
  assert.equal(pool.remaining, 748);
  assert.equal(pool.segments.length, 2);
  assert.equal(pool.detail.length, 2);
  assert.equal(quotaPool({ provider: 'qoder', quotas: quotas.slice(0, 2) }, now).segments.length, 1);
});

test('expired packs and mixed units do not enter an additive pool', () => {
  const expired = pack('Bonus Pack 1', 100, 0, { resetAt: '2026-10-03T00:00:00Z' });
  assert.equal(isSpentPack(expired, now), true);
  const pool = quotaPool({ provider: 'codebuddy-cn', quotas: [expired, pack('Bonus Pack 2', 100, 20)] }, now);
  assert.equal(pool.remaining, 80);
  assert.equal(pool.live.length, 1);
  assert.equal(quotaPool({ provider: 'qoder', quotas: [pack('Credits', 100, 10), pack('USD', 10, 1, { unit: 'USD' })] }, now), null);
  assert.equal(quotaPool({ provider: 'qoder', quotas: [{ name: 'Unknown', total: null, used: null }] }, now), null);
});

test('segment count stays bounded and keeps every live credit', () => {
  const pool = quotaPool({ provider: 'codebuddy-cn', quotas: Array.from({ length: 40 }, (_, index) => pack(`Bonus Pack ${index + 1}`, 100, index)) }, now);
  assert.equal(pool.live.length, 40);
  assert.equal(pool.segments.length, 20);
  assert.equal(pool.segments.reduce((sum, segment) => sum + segment.remaining, 0), pool.remaining);
});

test('countdown distinguishes reset windows from expiring packs', () => {
  assert.equal(quotaTiming({ resetAt: future }, now), '1天2时后重置');
  assert.equal(quotaTiming(pack('Bonus', 100, 0), now), '1天2时后到期');
  assert.equal(quotaTiming({ resetAt: 'invalid' }, now), '');
  assert.equal(quotaTiming({ resetAt: '2026-10-03T00:00:00Z' }, now), '待重置');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { modelCatalog } from '../src/api/data.js';
import { CREDIT_MAX_AGE, creditWindow, modelCreditStatus } from '../src/api/model-credits.js';

const at = time => Date.parse(`2026-10-15T${time}+08:00`);
const cn = { provider: 'cbcn', upstreamId: 'hy4-preview', rateMultiplier: 0.29, nightFree: { from: 23, to: 8 } };
const promotion = { window_start: '22:00', window_end: '08:00', timezone: 'Asia/Singapore', before_promotion_price_factor: 2, discount_factor: 0.2, badge: { zh: '错峰2折' } };
const qoder = { provider: 'qd', upstreamId: 'ultimate' };
const live = (now, row, extra = {}) => ({ account: '参考账号', updatedAt: now, models: [{ id: 'qoder/ultimate', ...row }], ...extra });

test('catalog retains explicit credit fields including zero without inventing missing values', () => {
  const [built, unknown, custom] = modelCatalog([
    { provider: 'cbcn', model: 'hy3', rateMultiplier: 0, promoFreeUntil: '2026-10-16' },
    { provider: 'cbai', model: 'unknown' },
  ], [{ providerAlias: 'qd', id: 'ultimate', rateMultiplier: 0.4, promotion }]);
  assert.equal(built.rateMultiplier, 0);
  assert.equal(built.promoFreeUntil, '2026-10-16');
  assert.equal(unknown.rateMultiplier, undefined);
  assert.equal(custom.rateMultiplier, 0.4);
  assert.equal(custom.promotion, promotion);
  assert.equal(modelCatalog([{ provider: 'cbcn', model: 'hy3', rateMultiplier: 0 }], [{ providerAlias: 'cbcn', id: 'hy3' }])[0].rateMultiplier, 0);
  assert.equal(modelCreditStatus({ provider: 'openai', rateMultiplier: 0 }), null);
  for (const rateMultiplier of [undefined, null, -1, NaN, Infinity, '0']) assert.equal(modelCreditStatus({ provider: 'cbcn', rateMultiplier }).label, '未提供积分信息');
});

test('CN night-free uses Beijing time with inclusive start and exclusive end, independently of browser timezone', () => {
  for (const [time, free] of [['22:59:59', false], ['23:00:00', true], ['00:00:00', true], ['07:59:59', true], ['08:00:00', false]]) assert.equal(modelCreditStatus(cn, { now: at(time) }).free, free, time);
  assert.equal(modelCreditStatus({ ...cn, provider: 'cbai', rateMultiplier: 0, nightFree: undefined }, { now: at('12:00:00') }).label, '免费');
  assert.equal(modelCreditStatus(cn, { now: at('12:00:00') }).label, '积分倍率 0.29×');
  assert.equal(modelCreditStatus({ ...cn, nightFree: { from: 25, to: 8 } }, { now: at('23:00:00') }).free, false);
});

test('dated free promotion expires exactly at its UTC deadline and keeps normal multiplier', () => {
  const model = { provider: 'cbcn', rateMultiplier: 0.79, promoFreeUntil: '2026-10-15' };
  assert.equal(modelCreditStatus(model, { now: at('07:59:59') }).label, '限时免费');
  assert.equal(modelCreditStatus(model, { now: at('08:00:00') }).label, '积分倍率 0.79×');
  assert.equal(modelCreditStatus({ ...model, promoFreeUntil: 'invalid' }, { now: at('00:00:00') }).free, false);
  assert.equal(model.rateMultiplier, 0.79);
});

test('Qoder consumes live account price without multiplying its discount again', () => {
  const now = at('23:00:00');
  const priced = live(now, { rateMultiplier: 0.4, promotion });
  const status = modelCreditStatus(qoder, { now, live: priced });
  assert.equal(status.label, '积分倍率 0.4×');
  assert.equal(status.free, false);
  assert.equal(status.schedule.periods.find(period => period.active).label, '低谷');
  assert.match(status.source, /参考账号/);
  assert.equal(modelCreditStatus(qoder, { now, live: live(now, { rateMultiplier: 0 }) }).label, '免费');
  assert.equal(creditWindow(promotion, at('22:00:00')).active, true);
  assert.equal(creditWindow(promotion, at('08:00:00')).active, false);
  assert.equal(creditWindow(promotion, at('21:59:59')).refreshIn, 2000);
  assert.equal(creditWindow({ ...promotion, timezone: 'invalid' }, now), null);
});

test('Qoder never keeps a free claim after expiry, a window change, read failure or account mismatch', () => {
  const now = at('21:59:59');
  const priced = live(now, { rateMultiplier: 0, promotion });
  for (const extra of [{ error: '查询失败' }, { loading: true }, { updatedAt: now - CREDIT_MAX_AGE }]) assert.equal(modelCreditStatus(qoder, { now, live: { ...priced, ...extra } }).free, false);
  assert.equal(modelCreditStatus(qoder, { now: at('22:00:00'), live: priced }).label, '积分信息未更新');
  assert.equal(modelCreditStatus({ ...qoder, upstreamId: 'missing' }, { now, live: priced }).label, '未提供积分信息');
  assert.equal(modelCreditStatus(qoder, { now }).free, false);
  assert.equal(modelCreditStatus(cn, { now: at('23:00:00'), unavailable: true }).free, false);
});

test('Qoder shows both peak and off-peak rules while the active price comes from the account', () => {
  const peak = at('12:00:00');
  const peakStatus = modelCreditStatus(qoder, { now: peak, live: live(peak, { rateMultiplier: 2, promotion }) });
  assert.equal(peakStatus.schedule.timezone, '北京时间');
  assert.deepEqual(peakStatus.schedule.periods, [
    { label: '高峰', start: '08:00', end: '22:00', rate: 2, active: true },
    { label: '低谷', start: '22:00', end: '08:00', rate: 0.4, active: false },
  ]);
  const valley = at('22:00:00');
  const valleyStatus = modelCreditStatus(qoder, { now: valley, live: live(valley, { rateMultiplier: 0.35, promotion }) });
  assert.equal(valleyStatus.schedule.periods[1].rate, 0.35);
  assert.equal(valleyStatus.schedule.periods[1].active, true);
  assert.equal(valleyStatus.label, '积分倍率 0.35×');
  assert.equal(modelCreditStatus(qoder, { now: at('08:00:00'), live: live(at('07:59:59'), { rateMultiplier: 0.4, promotion }) }).schedule, undefined);
});

test('Qoder does not invent a peak/off-peak rule for missing or invalid discount metadata', () => {
  const now = at('12:00:00');
  for (const metadata of [null, { ...promotion, discount_factor: undefined }, { ...promotion, discount_factor: -1 }, { ...promotion, before_promotion_price_factor: NaN }, { ...promotion, timezone: 'invalid' }]) {
    assert.equal(modelCreditStatus(qoder, { now, live: live(now, { rateMultiplier: 2, promotion: metadata }) }).schedule, null);
  }
  const status = modelCreditStatus(qoder, { now, live: live(now, { rateMultiplier: 0.1, promotion: { ...promotion, before_promotion_price_factor: 0.1, discount_factor: 0.4 } }) });
  assert.equal(status.schedule.periods[1].rate, 0.04);
  assert.equal(modelCreditStatus(qoder, { now, live: live(now, { rateMultiplier: 0, promotion }) }).schedule.periods[0].rate, 0);
});

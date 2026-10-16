import { providerId } from './data.js';

export const CREDIT_MAX_AGE = 5 * 60 * 1000;
export const isQoder = provider => ['qoder', 'qoder-cn'].includes(providerId(provider));
export const hasModelCredits = provider => isQoder(provider) || ['codebuddy-cn', 'codebuddy-intl'].includes(providerId(provider));

export function creditWindow(promotion, now = Date.now()) {
  if (!promotion) return null;
  const minutes = text => {
    const match = /^(\d{2}):(\d{2})$/.exec(text || '');
    return match && +match[1] < 24 && +match[2] < 60 ? +match[1] * 60 + +match[2] : null;
  };
  const start = minutes(promotion.window_start), end = minutes(promotion.window_end);
  if (start === null || end === null || start === end) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: promotion.timezone || 'Asia/Singapore', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(now);
    const part = name => +parts.find(item => item.type === name).value;
    const minute = part('hour') * 60 + part('minute');
    const active = start < end ? minute >= start && minute < end : minute >= start || minute < end;
    return { active, refreshIn: (((active ? end : start) * 60 - minute * 60 - part('second') + 86400) % 86400) * 1000 + 1000 };
  } catch { return null; }
}

export function modelCreditStatus(model, { now = Date.now(), live, unavailable = false } = {}) {
  if (!hasModelCredits(model.provider)) return null;
  const unknown = { label: '未提供积分信息', free: false, detail: '' };
  let pricing = model;
  let source = '';
  if (isQoder(model.provider)) {
    if (!live) return unknown;
    source = `参考账号：${live.account} · 查询时间：${live.updatedAt ? new Date(live.updatedAt).toLocaleTimeString('zh-CN', { hour12: false }) : '尚未成功'}`;
    const row = live.models?.find(item => item.id?.replace(/^[^/]+\//, '') === model.upstreamId);
    const crossed = row?.promotion && creditWindow(row.promotion, live.updatedAt)?.active !== creditWindow(row.promotion, now)?.active;
    if (live.error || live.loading || !live.updatedAt || now - live.updatedAt >= CREDIT_MAX_AGE || crossed) return { label: live.loading ? '正在更新积分信息' : '积分信息未更新', free: false, detail: live.error || '正在查询当前价格', source };
    if (!row) return { ...unknown, source };
    pricing = row;
  } else if (unavailable) return { label: '积分信息未更新', free: false, detail: '模型目录读取失败，请刷新重试' };
  const rate = typeof pricing.rateMultiplier === 'number' && Number.isFinite(pricing.rateMultiplier) && pricing.rateMultiplier >= 0 ? pricing.rateMultiplier : null;
  const night = pricing.nightFree;
  const nightPromotion = night && Number.isInteger(night.from) && Number.isInteger(night.to) && night.from >= 0 && night.from < 24 && night.to >= 0 && night.to < 24 ? { window_start: `${String(night.from).padStart(2, '0')}:00`, window_end: `${String(night.to).padStart(2, '0')}:00`, timezone: 'Asia/Shanghai' } : null;
  const nightNow = creditWindow(nightPromotion, now)?.active === true;
  const promoEnd = typeof pricing.promoFreeUntil === 'string' ? Date.parse(pricing.promoFreeUntil) : NaN;
  const promoNow = rate !== null && rate > 0 && now < promoEnd;
  const free = nightNow || promoNow || rate === 0;
  const detail = [];
  if (nightPromotion) detail.push(`免费时段 ${nightPromotion.window_start}–${nightPromotion.window_end}（北京时间）${rate !== null ? `，常规倍率 ${rate}×` : ''}`);
  if (Number.isFinite(promoEnd)) detail.push(`免费活动${promoNow ? '截止' : '已结束于'} ${new Date(promoEnd).toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' })}（北京时间）`);
  const promotion = pricing.promotion;
  if (promotion) {
    const badge = promotion.badge?.zh || promotion.badge?.en || '错峰优惠';
    detail.push(`${badge} · ${promotion.window_start || '?'}–${promotion.window_end || '?'}（${promotion.timezone || 'Asia/Singapore'}）${creditWindow(promotion, now)?.active ? '，当前时段生效' : '，当前时段未生效'}${typeof promotion.before_promotion_price_factor === 'number' ? `，原倍率 ${promotion.before_promotion_price_factor}×` : ''}`);
  }
  if (free) detail.push('使用免费额度，仍受账号权限、额度和限流约束');
  return { label: nightNow ? '当前时段免费' : promoNow ? '限时免费' : rate === 0 ? '免费' : rate !== null ? `积分倍率 ${rate}×` : unknown.label, free, detail: detail.join('；'), source };
}

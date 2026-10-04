const finite = value => typeof value === 'number' && Number.isFinite(value);
const periodNames = { hourly: '每小时', rolling5h: '5 小时', daily: '每日', weekly: '每周', monthly: '每月', total: '总额度' };
const names = { 'Gemini Models': 'Gemini 模型', 'Claude and GPT models': 'Claude 与 GPT 模型', '5h Window': '5 小时', 'Weekly Window': '每周', Weekly: '每周', Monthly: '每月', 'Resource Package': '资源包', 'Total Points': '总积分' };

export function quotaName(name) {
  return names[name] || String(name || '').replace(/^Bonus Pack (\d+)$/, '赠送包 $1');
}

export function quotaValues(row) {
  const name = periodNames[row.period] || quotaName(row.name) || row.period || '额度';
  const total = row.limit ?? row.total;
  const remaining = finite(row.remaining) ? Math.max(0, row.remaining) : finite(total) && total > 0 && finite(row.used) ? Math.max(0, total - row.used) : null;
  const percentage = finite(row.remainingPercentage) ? row.remainingPercentage : finite(total) && total > 0 && finite(remaining) ? remaining / total * 100 : null;
  const percent = finite(percentage) ? Math.min(100, Math.max(0, percentage)) : null;
  const tone = row.unlimited ? 'healthy' : percent === null ? 'unknown' : percent === 0 ? 'error' : percent <= 20 ? 'warning' : 'healthy';
  const unit = row.currency || row.unit || '';
  const percentageOnly = row.percentScale || finite(row.remainingPercentage) && !(finite(total) && total > 0);
  const resetAt = row.resetsAt || row.resetAt;
  const status = row.unlimited ? '无限额' : percent === null ? '比例未知' : percent === 0 ? '已耗尽' : percent <= 20 ? '剩余较少' : '可用';
  return { name, total, remaining, percent, tone, unit, percentageOnly, resetAt, status };
}

export function quotaGroups(rows) {
  const groups = [];
  for (const row of rows) {
    const split = /^(.+?)\s+·\s+(.+)$/.exec(row.name || '');
    const family = split ? quotaName(split[1]) : null;
    const label = split ? quotaName(split[2]) : quotaValues(row).name;
    let group = family && groups.find(item => item.family === family);
    if (!group) { group = { family, rows: [] }; groups.push(group); }
    group.rows.push({ row, label });
  }
  return groups;
}

export function isQuotaSummary(row) {
  return row.summarizesDetail === true || /total|aggregate|summary|^总/i.test(row.name || '');
}

export function isSpentPack(row, now = Date.now()) {
  if (row.unlimited || row.recurring !== false) return false;
  const { remaining, total, resetAt } = quotaValues(row);
  return finite(total) && total > 0 && remaining === 0 || Boolean(resetAt && new Date(resetAt).getTime() <= now);
}

export function quotaTiming(row, now = Date.now()) {
  const { resetAt } = quotaValues(row);
  const time = new Date(resetAt).getTime();
  if (!resetAt || !Number.isFinite(time)) return '';
  if (time <= now) return row.recurring === false ? '已到期' : '待重置';
  const minutes = Math.ceil((time - now) / 60000);
  const duration = minutes >= 1440 ? `${Math.floor(minutes / 1440)}天${Math.floor(minutes % 1440 / 60)}时` : minutes >= 60 ? `${Math.floor(minutes / 60)}时${minutes % 60}分` : `${minutes}分`;
  return `${duration}后${row.recurring === false ? '到期' : '重置'}`;
}

export function quotaPool(connection, now = Date.now()) {
  if (!/^(codebuddy|qoder)(-|$)/.test(connection.provider || '')) return null;
  const rows = connection.quotas || [];
  const detail = rows.filter(row => !isQuotaSummary(row));
  // Qoder's bucket total and its detailOnly packs describe the same credits.
  const source = rows.filter(row => !row.detailOnly && (!isQuotaSummary(row) || row.summarizesDetail));
  const usable = row => !row.unlimited && !quotaValues(row).percentageOnly && finite(quotaValues(row).total) && quotaValues(row).total > 0 && finite(quotaValues(row).remaining);
  const pool = source.filter(row => usable(row) && !(row.recurring === false && quotaValues(row).resetAt && new Date(quotaValues(row).resetAt).getTime() <= now));
  if (!pool.length) return null;
  const units = new Set(pool.map(row => quotaValues(row).unit));
  if (units.size !== 1) return null;
  const sum = (items, key) => items.reduce((value, row) => value + quotaValues(row)[key], 0);
  const total = sum(pool, 'total');
  const remaining = sum(pool, 'remaining');
  const breakdown = detail.filter(usable);
  const represented = breakdown.length && Math.abs(sum(breakdown, 'total') - total) < .01 && Math.abs(sum(breakdown, 'remaining') - remaining) < .01;
  const packs = represented ? breakdown : pool;
  const live = packs.filter(row => quotaValues(row).remaining > 0 && !isSpentPack(row, now)).sort((a, b) => (new Date(quotaValues(a).resetAt).getTime() || Infinity) - (new Date(quotaValues(b).resetAt).getTime() || Infinity));
  let segments = live.map(row => ({ name: quotaValues(row).name, remaining: quotaValues(row).remaining, row }));
  if (segments.length > 20) segments = [...segments.slice(0, 19), { name: `其他 ${segments.length - 19} 个资源包`, remaining: segments.slice(19).reduce((value, item) => value + item.remaining, 0) }];
  return { total, remaining, percent: Math.min(100, remaining / total * 100), unit: pool[0].unit || pool[0].currency || '', live, segments, detail };
}

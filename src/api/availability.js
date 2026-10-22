export const availabilityNames = { healthy: '最近调用正常', unknown: '未验证 / 记录已过期', suspect: '调用异常', network: '链路异常', cooling: '冷却中', isolated: '已隔离', waiting: '待真实业务恢复', recovering: '正在确认恢复', disabled: '已手动停用' };
export const availabilityTone = { healthy: 'healthy', unknown: 'unknown', suspect: 'error', network: 'unknown', cooling: 'error', isolated: 'error', waiting: 'unknown', recovering: 'unknown', disabled: 'disabled' };
export const actionNames = { config: '更新规则', auto_isolate: '自动隔离', auto_restore: '业务恢复', manual_isolate: '人工隔离', manual_release: '人工解除隔离' };

export function summarizeAvailability(rows = []) {
  return { total: rows.length, healthy: rows.filter(row => row.status === 'healthy').length, blocked: rows.filter(row => row.blocked).length, unknown: rows.filter(row => ['unknown', 'waiting', 'recovering'].includes(row.status)).length };
}

export function connectionAvailability(rows = [], connectionId) {
  const channels = rows.filter(row => row.connectionId === connectionId && !row.disabledByUser);
  if (!channels.length) return null;
  const blocked = channels.filter(row => row.blocked).length;
  return { blocked, total: channels.length, label: blocked ? `${blocked} 个模型渠道暂停` : channels.some(row => row.status === 'suspect' || row.status === 'network') ? '存在调用异常' : '查看可用性' };
}

export function availabilityLink(row) {
  const query = new URLSearchParams();
  if (row.provider) query.set('provider', row.provider);
  if (row.connectionId || row.id) query.set('connectionId', row.connectionId || row.id);
  if (row.model && row.model !== '*') query.set('model', row.model);
  query.set('workspace', 'availability');
  return '/dashboard/monitor?' + query;
}

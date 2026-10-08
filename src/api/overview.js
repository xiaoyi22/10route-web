import { normalizeProviders } from './client.js';

const numeric = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const sumCounters = values => values.every(value => numeric(value) !== null) ? values.reduce((sum, value) => sum + value, 0) : null;

export function overviewSummary(stats = {}, accounts = null) {
  stats ||= {};
  const connections = accounts && Array.isArray(accounts.connections) ? normalizeProviders(accounts) : null;
  const active = Array.isArray(stats.activeRequests) ? stats.activeRequests : null;
  const pending = stats.pending?.byModel;
  const activeCount = active ? sumCounters(active.map(entry => entry.count)) : pending && typeof pending === 'object' ? sumCounters(Object.values(pending)) : null;
  const providers = Object.entries(stats.byProvider || {}).map(([id, data]) => ({ id, requests: numeric(data.requests), tokens: numeric(data.promptTokens) !== null && numeric(data.completionTokens) !== null ? data.promptTokens + data.completionTokens : null })).sort((first, second) => (second.requests || 0) - (first.requests || 0));
  const providerTotal = sumCounters(providers.map(provider => provider.requests));
  return {
    totalRequests: numeric(stats.totalRequests),
    totalTokens: numeric(stats.totalPromptTokens) !== null && numeric(stats.totalCompletionTokens) !== null ? stats.totalPromptTokens + stats.totalCompletionTokens : null,
    totalCost: numeric(stats.totalCost),
    activeCount,
    activeRequests: active,
    enabledAccounts: connections ? connections.filter(connection => connection.isActive).length : null,
    errorAccounts: connections ? connections.filter(connection => connection.isActive && connection.status === 'error').length : null,
    providers: providers.map(provider => ({ ...provider, share: providerTotal > 0 && provider.requests !== null ? provider.requests / providerTotal * 100 : null })),
  };
}

export function formatBytes(value) {
  if (numeric(value) === null) return '—';
  if (value < 1024) return value + ' B';
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), 4);
  return (value / 1024 ** exponent).toFixed(1) + ' ' + ['B', 'KiB', 'MiB', 'GiB', 'TiB'][exponent];
}

export function formatUptime(seconds) {
  if (numeric(seconds) === null) return '—';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds % 86400 / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  return [days && days + ' 天', hours && hours + ' 小时', minutes && minutes + ' 分钟'].filter(Boolean).join(' ') || '不足 1 分钟';
}

export function requestTrendPoints(stats) {
  if (!Array.isArray(stats?.last10Minutes) || !stats.last10Minutes.length) return null;
  return stats.last10Minutes.map((point, index, points) => ({ label: index === points.length - 1 ? '当前分钟' : points.length - 1 - index + ' 分钟前', requests: numeric(point?.requests) }));
}

export function recentThroughput(stats) {
  const buckets = Array.isArray(stats?.last10Minutes) ? stats.last10Minutes.slice(-6, -1) : [];
  const total = field => buckets.length === 5 ? sumCounters(buckets.map(bucket => bucket?.[field])) : null;
  const requests = total('requests');
  const input = total('promptTokens');
  const output = total('completionTokens');
  return {
    rpm: requests === null ? null : requests / 5,
    tpm: input === null || output === null ? null : (input + output) / 5,
    inputTpm: input === null ? null : input / 5,
    outputTpm: output === null ? null : output / 5,
  };
}

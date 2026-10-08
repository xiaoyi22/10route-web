import providerAliases from './provider-aliases.json' with { type: 'json' };

const numeric = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const aliasIds = Object.fromEntries(Object.entries(providerAliases).flatMap(([id, aliases]) => aliases.map(alias => [alias, id])));
export const providerId = value => Object.hasOwn(providerAliases, value) ? value : aliasIds[value] || value;

export function cacheRate(cached, input) {
  if (numeric(cached) === null || numeric(input) === null || input <= 0 || cached < 0 || cached > input) return null;
  return cached / input * 100;
}

export function requestTokens(tokens = {}) {
  tokens = tokens || {};
  return {
    input: numeric(tokens.prompt_tokens ?? tokens.input_tokens),
    output: numeric(tokens.completion_tokens ?? tokens.output_tokens),
    cached: numeric(tokens.cached_tokens ?? tokens.cache_read_input_tokens ?? tokens.prompt_tokens_details?.cached_tokens),
    created: numeric(tokens.cache_creation_input_tokens ?? tokens.prompt_tokens_details?.cache_creation_input_tokens),
    reasoning: numeric(tokens.reasoning_tokens ?? tokens.completion_tokens_details?.reasoning_tokens ?? tokens.output_tokens_details?.reasoning_tokens),
  };
}

export function requestUsageSource(entry) {
  const source = entry.usageSource || (entry.tokens?.estimated === true ? 'estimated' : '');
  return { upstream: '上游实测', estimated: '估算（非上游计费值）', unavailable: '未提供' }[source] || '未记录';
}

export function requestErrorLabel(entry) {
  if (!entry.error) return ['error', 'failed'].includes(entry.status) ? '未记录' : '—';
  const error = entry.error;
  const reason = {
    channel_daily_success_limit_exceeded: '渠道当日成功次数已达上限',
    stream_disconnected: '流式响应中断',
  }[error.code] || error.message || error.code || '请求失败';
  return reason + (Number.isInteger(error.status) ? `（HTTP ${error.status}）` : '');
}

export function responseModeLabel(mode) {
  return mode === 'streaming' ? '流式' : mode === 'non-streaming' ? '非流式' : mode || '—';
}

export function requestSpeed(entry) {
  const output = requestTokens(entry.tokens).output;
  const total = numeric(entry.latency?.total);
  const ttft = numeric(entry.latency?.ttft);
  if (entry.imported || output === null || output <= 0 || total === null || total < 50) return null;
  let duration = total;
  let basis = '输出 Token ÷ 总耗时';
  if (entry.responseMode === 'streaming' && ttft !== null && ttft > 0 && total - ttft >= 50) {
    duration = total - ttft;
    basis = '输出 Token ÷（总耗时 − 首 Token 延迟）';
    // Match the gateway performance statistics' short-burst fallback.
    if (output * 1000 / duration > 300) {
      duration = total;
      basis = '首 Token 后速率超过 300，按网关统计口径使用输出 Token ÷ 总耗时';
    }
  }
  return { tps: output * 1000 / duration, durationMs: duration, basis };
}

export function modelCatalog(builtIn = [], custom = [], connections = [], nodes = [], disabled = {}) {
  const activeIds = new Set(connections.filter(connection => connection.isActive !== false).map(connection => providerId(connection.provider)));
  const activeAliases = new Set(activeIds);
  for (const id of activeIds) for (const alias of providerAliases[id] || []) activeAliases.add(alias);
  for (const node of nodes) if (activeIds.has(node.id) && node.prefix) activeAliases.add(node.prefix);
  const all = new Map();
  for (const model of builtIn) {
    const id = model.routedModel || model.fullModel || `${model.provider}/${model.model}`;
    if (activeAliases.has(model.provider)) activeAliases.add(id.split('/')[0]);
    all.set(id, { id, name: model.name || model.alias || model.model, provider: model.provider, caps: model.caps || {}, enabled: true, custom: false, connected: activeAliases.has(model.provider) });
  }
  for (const model of custom) {
    const prefix = nodes.find(node => node.id === model.providerAlias)?.prefix || model.providerAlias;
    const id = `${prefix}/${model.id}`;
    all.set(id, { id, upstreamId: model.id, type: model.type || 'llm', name: model.name || model.id, provider: model.providerAlias, caps: model, enabled: model.enabled !== false, custom: true, connected: activeAliases.has(model.providerAlias) });
  }
  // The gateway omits disabled built-ins from /api/models; recover their IDs for management.
  for (const [provider, ids] of Object.entries(disabled)) {
    for (const upstreamId of ids) {
      const existing = [...all.values()].find(model => providerId(model.provider) === providerId(provider) && (model.upstreamId || model.id.slice(model.id.indexOf('/') + 1)) === upstreamId);
      if (existing) { existing.enabled = false; existing.disabledProviders = [...(existing.disabledProviders || []), provider]; continue; }
      const id = `${provider}/${upstreamId}`;
      all.set(id, { id, upstreamId, name: upstreamId, provider, caps: {}, enabled: false, custom: false, connected: activeAliases.has(provider), disabledProviders: [provider] });
    }
  }
  return [...all.values()];
}

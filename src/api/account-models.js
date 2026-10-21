import { requestJson } from './client.js';

export function supportsAccountModels(provider = '') {
  return provider.startsWith('openai-compatible-') || provider.startsWith('anthropic-compatible-');
}

export function accountModelIds(result) {
  if (result.warning) throw new Error(`上游模型列表未确认完整：${result.warning}`);
  if (!Array.isArray(result.models)) throw new Error('上游返回的模型列表格式无效，已保留原模型范围');
  const ids = result.models.map(item => typeof item === 'string' ? item : item?.id || item?.model || item?.name);
  if (ids.some(id => typeof id !== 'string' || !id.trim())) throw new Error('上游包含无效模型，已保留原模型范围');
  const unique = [...new Set(ids.map(id => id.trim()))];
  if (!unique.length) throw new Error('上游返回空模型列表，已保留原模型范围');
  return unique;
}

export async function fetchAccountModels(connection, send = requestJson) {
  if (!supportsAccountModels(connection.provider)) throw new Error('此供应商暂不支持账号模型范围');
  const result = await send(`/api/providers/${encodeURIComponent(connection.id)}/models`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  return accountModelIds(result);
}

export async function saveAccountModels(connection, models, send = requestJson) {
  if (!supportsAccountModels(connection.provider)) throw new Error('此供应商暂不支持账号模型范围');
  const enabledModels = models === null ? null : accountModelIds({ models });
  await send(`/api/providers/${encodeURIComponent(connection.id)}`, {
    method: 'PUT', body: JSON.stringify({ providerSpecificData: { enabledModels } }), signal: AbortSignal.timeout(20000),
  });
}

export async function syncAccountModels(connections, onProgress, send = requestJson) {
  const results = [];
  for (const connection of connections) {
    let result = { connection, status: 'skipped', reason: connection.isActive === false ? '已停用 · 已跳过' : '暂不支持账号范围 · 已跳过' };
    if (connection.isActive !== false && supportsAccountModels(connection.provider)) {
      try {
        const models = await fetchAccountModels(connection, send);
        await saveAccountModels(connection, models, send);
        result = { connection, status: 'success', count: models.length };
      } catch (error) { result = { connection, status: 'error', error }; }
    }
    results.push(result);
    onProgress([...results]);
  }
  return results;
}

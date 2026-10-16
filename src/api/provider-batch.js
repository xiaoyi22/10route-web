import { requestJson } from './client.js';

export async function runProviderBatch(connections, action, body, onProgress) {
  const results = [];
  for (const connection of connections) {
    let result;
    if (action === 'test' && !connection.isActive) {
      result = { connection, status: 'skipped' };
    } else {
      try {
        const url = `/api/providers/${encodeURIComponent(connection.id)}`;
        const response = await requestJson(action === 'test' ? `${url}/test` : url, { method: action === 'test' ? 'POST' : 'PUT', body: JSON.stringify(action === 'test' ? {} : body) });
        result = action === 'test' && !response.valid
          ? { connection, status: 'error', error: response.error || '连接测试失败' }
          : { connection, status: 'success' };
      } catch (error) {
        result = { connection, status: 'error', error };
      }
    }
    results.push(result);
    onProgress([...results]);
  }
  return results;
}

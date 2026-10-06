import { ApiError } from './client.js';
import { isAllowedRequest } from './policy.js';

export async function openApiResponse(url, options) {
  if (!isAllowedRequest(url, options.method || 'POST', typeof __MANAGEMENT_ENABLED__ !== 'undefined' && __MANAGEMENT_ENABLED__)) throw new ApiError('当前访问模式不允许此操作', 405);
  const response = await fetch(url, { ...options, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...options.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = typeof body.error === 'object' ? body.error.message : body.error;
    throw new ApiError(error || body.message || `请求失败（HTTP ${response.status}）`, response.status);
  }
  return response;
}

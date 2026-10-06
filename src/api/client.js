export class ApiError extends Error {
  constructor(message, status = 0, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export async function requestJson(url, options = {}, fetcher = globalThis.fetch) {
  const method = (options.method || 'GET').toUpperCase();
  const management = typeof __MANAGEMENT_ENABLED__ !== 'undefined' && __MANAGEMENT_ENABLED__;
  if (!isAllowedRequest(url, method, management)) {
    throw new ApiError('当前访问模式只读，或接口尚未开放', 405);
  }
  const response = await fetcher(url, {
    ...options,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new ApiError('接口未返回 JSON，请检查同源代理或服务状态', response.status);
  }
  let data;
  try { data = await response.json(); }
  catch { throw new ApiError('接口返回的 JSON 格式无效', response.status); }
  const upstreamModels = /^\/api\/providers\/[^/]+\/models$/.test(new URL(url, 'http://localhost').pathname) && data.error !== 'Unauthorized';
  const oauthFailure = new URL(url, 'http://localhost').pathname.startsWith('/api/oauth/') && data.error !== 'Unauthorized';
  const passwordRejected = ['/api/settings', '/api/settings/database', '/api/auth/verify-password', '/api/oauth/transfer/export', '/api/oauth/codebuddy-cn/bulk-import', '/api/host-management'].includes(new URL(url, 'http://localhost').pathname) && /password/i.test(data.error || '');
  if (response.status === 401 && url !== '/api/auth/login' && !upstreamModels && !passwordRejected && !oauthFailure && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('tenrouter:unauthorized'));
  }
  if (!response.ok) {
    const messages = { 401: '登录已失效，请重新登录', 403: '访问被权限或本机安全策略拒绝', 429: '请求过于频繁，请稍后重试' };
    throw new ApiError((passwordRejected && '管理员密码验证失败，请检查后重试') || ((upstreamModels || oauthFailure) && data.error) || messages[response.status] || data.error || `请求失败 (${response.status})`, response.status, data);
  }
  return data;
}

const numberOrUnknown = value => typeof value === 'number' && Number.isFinite(value) ? value : null;

export function normalizeStats(data) {
  const prompt = numberOrUnknown(data.totalPromptTokens);
  const completion = numberOrUnknown(data.totalCompletionTokens);
  return {
    totalRequests: numberOrUnknown(data.totalRequests),
    totalPromptTokens: prompt,
    totalCompletionTokens: completion,
    totalCachedTokens: numberOrUnknown(data.totalCachedTokens),
    totalTokens: prompt !== null && completion !== null ? prompt + completion : null,
    totalCost: numberOrUnknown(data.totalCost),
    byModel: data.byModel || {},
    recentRequests: Array.isArray(data.recentRequests) ? data.recentRequests : [],
  };
}

export function normalizeProviders(data) {
  return (Array.isArray(data.connections) ? data.connections : []).map(connection => {
    const testStatus = connection.testStatus;
    const status = connection.isActive === false ? 'disabled'
      : connection.lastError || ['error', 'expired', 'unavailable', 'failed'].includes(testStatus) ? 'error'
      : ['success', 'active', 'ok'].includes(testStatus) ? 'healthy' : 'unknown';
    return {
      id: connection.id,
      name: connection.name || connection.displayName || connection.provider || '未命名连接',
      provider: connection.provider || '未知类型',
      status,
      lastTested: connection.lastTested || null,
      isActive: connection.isActive !== false,
      priority: connection.priority ?? 1,
      defaultModel: connection.defaultModel || '',
      authType: connection.authType || '',
      lastError: connection.lastError || '',
      nodeName: connection.providerSpecificData?.nodeName || '',
      prefix: connection.providerSpecificData?.prefix || '',
      baseUrl: connection.providerSpecificData?.baseUrl || '',
      proxyPoolId: connection.providerSpecificData?.proxyPoolId === '__none__' ? '' : connection.providerSpecificData?.proxyPoolId || '',
      connectionProxyEnabled: connection.providerSpecificData?.connectionProxyEnabled === true,
      connectionProxyUrl: connection.providerSpecificData?.connectionProxyUrl || '',
      connectionNoProxy: connection.providerSpecificData?.connectionNoProxy || '',
      strictProxy: connection.providerSpecificData?.strictProxy === true,
    };
  });
}
import { isAllowedRequest } from './policy.js';

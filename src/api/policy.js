const reads = new Set([
  '/api/auth/status', '/api/health', '/api/providers', '/api/provider-nodes',
  '/api/keys', '/api/models', '/api/models/custom', '/api/usage/stats',
  '/api/usage/chart', '/api/usage/stream', '/api/usage/request-details',
  '/api/proxy-pools', '/api/settings', '/api/pricing', '/api/iq-monitor',
  '/api/models/caps', '/api/models/alias', '/api/models/disabled', '/api/models/distribution', '/api/combos',
  '/api/channel-balances', '/api/usage/quotas',
  '/api/hermes/proxy/groups', '/api/hermes/proxy/status', '/api/hermes/proxy/failover', '/api/hermes/egress-ip', '/api/hermes/health',
  '/api/hermes/subscription/status',
]);

export function isAllowedRequest(url, method = 'GET', management = false) {
  if (!url.startsWith('/api/')) return false;
  const pathname = new URL(url, 'http://localhost').pathname;
  method = method.toUpperCase();
  if (method === 'GET') return reads.has(pathname) || /^\/api\/(providers|keys)\/[^/]+$/.test(pathname) || /^\/api\/providers\/[^/]+\/models$/.test(pathname);
  if (method === 'POST' && ['/api/auth/login', '/api/auth/logout'].includes(pathname)) return true;
  if (!management) return false;
  if (method === 'POST' && (['/api/hermes/proxy/select', '/api/hermes/proxy/delay', '/api/hermes/egress-ip', '/api/hermes/health/check', '/api/hermes/subscription/save', '/api/hermes/subscription/update', '/api/hermes/airports', '/api/hermes/proxy/failover/observe', '/api/hermes/proxy/failover/tick', '/api/hermes/proxy/failover/ack'].includes(pathname) || /^\/api\/hermes\/airports\/[^/]+\/delete$/.test(pathname))) return true;
  if (method === 'POST') return ['/api/keys', '/api/providers', '/api/models/test', '/api/provider-nodes', '/api/models/custom', '/api/models/disabled', '/api/combos'].includes(pathname) || /^\/api\/providers\/[^/]+\/test$/.test(pathname);
  if (method === 'PUT' && ['/api/models/custom', '/api/models/caps', '/api/models/alias', '/api/models/distribution'].includes(pathname)) return true;
  if (method === 'DELETE' && ['/api/models/custom', '/api/models/alias', '/api/models/disabled'].includes(pathname)) return true;
  if (method === 'PATCH' && pathname === '/api/channel-balances') return true;
  if (method === 'PATCH' && pathname === '/api/settings') return true;
  if (method === 'PUT' && pathname === '/api/iq-monitor') return true;
  return ['PUT', 'DELETE'].includes(method) && /^\/api\/(providers|provider-nodes|keys|combos)\/[^/]+$/.test(pathname);
}

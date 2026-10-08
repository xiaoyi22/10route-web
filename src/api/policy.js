import { oauthProviders, tokenImports } from './oauth-catalog.js';
import { cliTools } from './cli-tools.js';

const reads = new Set([
  '/api/auth/status', '/api/health', '/api/system/info', '/api/providers', '/api/provider-nodes',
  '/api/keys', '/api/models', '/api/models/custom', '/api/usage/stats',
  '/api/usage/chart', '/api/usage/stream', '/api/usage/request-details',
  '/api/proxy-pools', '/api/settings', '/api/pricing', '/api/iq-monitor',
  '/api/models/caps', '/api/models/alias', '/api/models/disabled', '/api/models/distribution', '/api/combos',
  '/api/channel-balances', '/api/usage/quotas',
  '/api/settings/database',
  '/api/cli-tools/all-statuses',
  '/api/translator/load', '/api/headroom/status', '/api/headroom/extras',
  '/api/pxpipe/status', '/api/pxpipe/stats', '/api/pxpipe/logs', '/api/pxpipe/health',
  '/api/auth/oidc/start', '/api/auth/oidc/callback', '/api/auth/saml/start', '/api/auth/saml/metadata',
  '/api/hermes/proxy/groups', '/api/hermes/proxy/status', '/api/hermes/proxy/failover', '/api/hermes/egress-ip', '/api/hermes/health',
  '/api/hermes/subscription/status',
]);

export function isAllowedRequest(url, method = 'GET', management = false) {
  if (!url.startsWith('/api/')) return false;
  const pathname = new URL(url, 'http://localhost').pathname;
  method = method.toUpperCase();
  if (pathname === '/api/checkins' || pathname.startsWith('/api/checkins/')) {
    if (method === 'GET') return pathname === '/api/checkins';
    if (!management) return false;
    if (method === 'POST') return ['/api/checkins/accounts', '/api/checkins/jobs'].includes(pathname);
    return /^\/api\/checkins\/accounts\/[a-zA-Z0-9-]+$/.test(pathname) && ['PATCH', 'DELETE'].includes(method);
  }
  const cli = /^\/api\/cli-tools\/([a-z-]+)-(settings|profiles)$/.exec(pathname);
  if (cli) {
    const [, tool, type] = cli;
    if (type === 'profiles') return ['claude', 'codex'].includes(tool) && (method === 'GET' || (management && ['POST', 'DELETE'].includes(method)));
    if (!cliTools.some(([id]) => id === tool)) return false;
    return method === 'GET' || (management && tool !== 'devin' && (['POST', 'DELETE'].includes(method) || (tool === 'opencode' && method === 'PATCH')));
  }
  const oauth = /^\/api\/oauth\/([^/]+)\/([^/]+)$/.exec(pathname);
  if (oauth) {
    if (!management) return false;
    const [, provider, action] = oauth;
    if (provider === 'transfer') return method === 'POST' && ['import', 'export'].includes(action);
    if (!oauthProviders.includes(provider)) return false;
    if (method === 'GET') return ['authorize', 'device-code', 'start-proxy', 'poll-status', 'stop-proxy'].includes(action) || (action === 'auto-import' && ['cursor', 'zed', 'kiro', 'xiaomi-mimo'].includes(provider));
    if (method !== 'POST') return false;
    return ['exchange', 'poll', 'register-session', 'submit-code', 'manual-code'].includes(action) || tokenImports[provider]?.action === action || (action === 'bulk-import' && ['codex', 'codebuddy-cn'].includes(provider));
  }
  if (method === 'GET') return reads.has(pathname) || /^\/api\/(providers|keys)\/[^/]+$/.test(pathname) || /^\/api\/providers\/[^/]+\/models$/.test(pathname);
  if (method === 'POST' && ['/api/auth/login', '/api/auth/logout'].includes(pathname)) return true;
  if (method === 'POST' && pathname === '/api/auth/saml/acs') return true;
  if (!management) return false;
  if (method === 'POST' && pathname === '/api/host-management') return true;
  if (method === 'POST' && ['/api/translator/translate', '/api/translator/send', '/api/translator/save', '/api/headroom/start', '/api/headroom/stop', '/api/headroom/restart', '/api/pxpipe/start', '/api/pxpipe/stop', '/api/pxpipe/restart', '/api/pxpipe/install', '/api/pxpipe/health'].includes(pathname)) return true;
  if (pathname === '/api/headroom/extras' && ['POST', 'DELETE'].includes(method)) return true;
  if (method === 'POST' && pathname === '/api/v1/chat/completions') return true;
  if (method === 'POST' && ['/api/settings/database', '/api/settings/proxy-test', '/api/auth/oidc/test', '/api/auth/saml/test'].includes(pathname)) return true;
  if (pathname === '/api/pricing' && ['PATCH', 'DELETE'].includes(method)) return true;
  if (pathname === '/api/proxy-pools' && method === 'POST') return true;
  if (/^\/api\/proxy-pools\/[^/]+$/.test(pathname) && ['PUT', 'DELETE'].includes(method)) return true;
  if (/^\/api\/proxy-pools\/[^/]+\/test$/.test(pathname) && method === 'POST') return true;
  if (method === 'POST' && (['/api/hermes/proxy/select', '/api/hermes/proxy/delay', '/api/hermes/egress-ip', '/api/hermes/health/check', '/api/hermes/subscription/save', '/api/hermes/subscription/update', '/api/hermes/airports', '/api/hermes/proxy/failover/observe', '/api/hermes/proxy/failover/tick', '/api/hermes/proxy/failover/ack'].includes(pathname) || /^\/api\/hermes\/airports\/[^/]+\/delete$/.test(pathname))) return true;
  if (method === 'POST') return ['/api/keys', '/api/providers', '/api/models/test', '/api/provider-nodes', '/api/models/custom', '/api/models/disabled', '/api/combos'].includes(pathname) || /^\/api\/providers\/[^/]+\/test$/.test(pathname);
  if (method === 'PUT' && ['/api/models/custom', '/api/models/caps', '/api/models/alias', '/api/models/distribution'].includes(pathname)) return true;
  if (method === 'DELETE' && ['/api/models/custom', '/api/models/alias', '/api/models/disabled'].includes(pathname)) return true;
  if (method === 'PATCH' && pathname === '/api/channel-balances') return true;
  if (method === 'PATCH' && pathname === '/api/settings') return true;
  if (method === 'PUT' && pathname === '/api/iq-monitor') return true;
  return ['PUT', 'DELETE'].includes(method) && /^\/api\/(providers|provider-nodes|keys|combos)\/[^/]+$/.test(pathname);
}

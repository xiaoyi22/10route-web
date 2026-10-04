import providerNames from './provider-names.json' with { type: 'json' };
import { providerId } from './data.js';

export function providerInfo(value, nodes = [], connection = null) {
  const key = connection?.provider || value || '';
  const node = nodes.find(node => node.id === key || node.prefix === key);
  const id = node?.id || providerId(key);
  const registered = providerNames[id];
  return {
    id,
    name: node?.name || connection?.nodeName || (id === 'codebuddy-cn' ? 'WorkBuddy / CodeBuddy CN' : registered?.name) || (key.startsWith('openai-compatible-') || key.startsWith('anthropic-compatible-') ? '自定义节点（名称未加载）' : key || '未知供应商'),
    prefix: node?.prefix || connection?.prefix || '',
    baseUrl: node?.baseUrl || connection?.baseUrl || '',
    custom: !!node || key.startsWith('openai-compatible-') || key.startsWith('anthropic-compatible-'),
  };
}

export function groupProviders(connections, nodes = []) {
  const groups = new Map();
  for (const connection of connections) {
    const info = providerInfo(connection.provider, nodes, connection);
    if (!groups.has(info.id)) groups.set(info.id, { ...info, connections: [] });
    groups.get(info.id).connections.push(connection);
  }
  for (const node of nodes) if (!groups.has(node.id)) groups.set(node.id, { ...providerInfo(node.id, nodes), connections: [] });
  return [...groups.values()].map(group => ({ ...group, enabled: group.connections.filter(connection => connection.isActive).length, errors: group.connections.filter(connection => connection.status === 'error').length, healthy: group.connections.filter(connection => connection.status === 'healthy').length }));
}

export function providerFailure(error, authType = '') {
  let raw = typeof error === 'string' ? error : error?.message || error?.error?.message || error?.error || '';
  let status = Number(error?.status || error?.statusCode || error?.details?.status || 0);
  if (typeof raw !== 'string') raw = JSON.stringify(raw);
  try {
    const data = JSON.parse(raw);
    status ||= Number(data.status || data.statusCode || data.error?.status || 0);
    raw = data.error?.message || data.message || raw;
  } catch {}
  // Only status-shaped text is a code; numbers in URLs or timing messages are not.
  status ||= Number(raw.match(/(?:\bHTTP(?:\s+error)?|\bstatus(?:\s+code)?|\berror|\bfailed|\bmodels)\s*[:=(]?\s*([45]\d{2})\b|\(([45]\d{2})\)|^([45]\d{2})\b/i)?.slice(1).find(Boolean) || 0);
  const credential = authType === 'oauth' ? 'Token' : 'API Key';
  let reason = '连接异常';
  let hint = '查看原始错误，核对接口地址、账号配置和代理连接后重新测试。';
  if (status === 400) {
    reason = '请求参数错误'; hint = '检查接口地址、协议、模型名称和请求参数；400 本身不能说明 Key 失效。';
  } else if (status === 401) {
    reason = '认证失败'; hint = `上游拒绝了认证，${credential} 可能无效、过期或已撤销；${authType === 'oauth' ? '请重新授权账号' : '请核对或更换 API Key'}。`;
  } else if (status === 403) {
    reason = '访问被拒绝'; hint = '检查账号或模型权限、IP / 地区限制和上游安全策略。';
  } else if (status === 402) {
    reason = '余额或额度不足'; hint = '检查上游账号余额、套餐和消费上限。';
  } else if (status === 404) {
    reason = '接口或模型不存在'; hint = '核对接口地址、协议路径和模型名称。';
  } else if (status === 429) {
    reason = '请求限流或额度耗尽'; hint = '检查上游配额与频率限制，等待恢复后再试。';
  } else if (status >= 500) {
    reason = '上游服务异常'; hint = '上游或代理服务返回错误，请检查服务状态后重试。';
  } else if (/invalid api key or (?:base url|azure configuration)|invalid api token or account id/i.test(raw)) {
    reason = '密钥或接口配置错误'; hint = '核对 API Key、接口地址及供应商配置；原始错误未区分具体原因。';
  } else if (/(?:token|key|session|cookie).*expir|expir.*(?:token|key|session|cookie)|(?:密钥|令牌|登录|授权).*(?:过期|失效)/i.test(raw)) {
    reason = `${credential} 已过期 / 失效`; hint = authType === 'oauth' ? '请重新授权账号，然后重新测试连接。' : '请更换有效的 API Key，然后重新测试连接。';
  } else if (/invalid.*(?:key|token|cookie)|(?:key|token).*invalid|revoked|unauthorized|authentication|认证|鉴权/i.test(raw)) {
    reason = `${credential} 认证失败`; hint = authType === 'oauth' ? '请核对授权状态并重新授权账号。' : '请核对或更换 API Key，然后重新测试连接。';
  } else if (/timeout|timed out|ECONN|ENOTFOUND|fetch failed|超时|代理|proxy/i.test(raw)) {
    reason = '网络或代理异常'; hint = '检查接口连通性、代理配置及 DNS 后重试。';
  }
  return { label: status ? `HTTP ${status} · ${reason}` : reason, hint, raw, status };
}

export function safeProxyUrl(value) {
  if (!value) return '—';
  try {
    const url = new URL(value);
    if (!['http:', 'https:', 'socks:', 'socks5:', 'socks5h:'].includes(url.protocol)) return '地址不可识别';
    const credentials = url.username || url.password ? '***@' : '';
    return `${url.protocol}//${credentials}${url.host}${url.pathname === '/' ? '' : url.pathname}`;
  } catch { return '地址不可识别'; }
}

export function connectionProxy(connection, pools, settings) {
  if (!pools || !settings) return { title: '代理配置未加载', address: '—', source: 'unknown', noProxy: '', warning: '' };
  const pool = pools.find(pool => pool.id === connection.proxyPoolId);
  const warning = connection.proxyPoolId && (!pool || !pool.isActive || !pool.proxyUrl) ? '绑定代理池未启用或不存在，后端将回退连接或全局规则' : '';
  if (pool?.isActive && pool.proxyUrl) return { title: pool.name || '代理池', address: safeProxyUrl(pool.proxyUrl), source: 'pool', noProxy: pool.noProxy || '', strict: pool.strictProxy === true, warning, type: pool.type || 'http' };
  if (connection.connectionProxyEnabled && connection.connectionProxyUrl) return { title: '连接专用代理', address: safeProxyUrl(connection.connectionProxyUrl), source: 'connection', noProxy: connection.connectionNoProxy || '', strict: connection.strictProxy, warning, type: 'http' };
  return { title: settings.outboundProxyEnabled ? '全局代理规则' : '全局代理关闭', address: settings.outboundProxyEnabled ? safeProxyUrl(settings.outboundProxyUrl) : '—', source: 'global', noProxy: settings.outboundNoProxy || '', strict: false, warning, type: 'http' };
}

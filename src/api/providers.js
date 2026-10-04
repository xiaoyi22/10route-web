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

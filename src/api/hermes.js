export function proxyEntries(data) {
  const ports = data?.entry_ports;
  if (!ports) return [];
  const entries = [];
  if (ports.mixed) entries.push({ port: Number(ports.mixed), group: 'GLOBAL', name: '混合入口' });
  for (const listener of ports.listeners || []) {
    if (!listener.port) continue;
    entries.push({ port: Number(listener.port), group: listener.proxy || '', name: listener.name || '独立入口' });
  }
  return entries.map(entry => ({ ...entry, chain: groupChain(entry.group, data.groups), probeSupported: [7890, 7891, 7892].includes(entry.port) }));
}

export function groupChain(name, groups = []) {
  if (!name) return [];
  const chain = [name];
  const seen = new Set(chain);
  for (let depth = 0; depth < 8; depth++) {
    const next = groups.find(group => group.name === chain.at(-1))?.now;
    if (!next || seen.has(next)) break;
    chain.push(next);
    seen.add(next);
  }
  return chain;
}

export function proxyBinding(address, data) {
  try {
    const url = new URL(address);
    if (!['http:', 'https:', 'socks:', 'socks5:', 'socks5h:'].includes(url.protocol)) return null;
    const hosts = ['127.0.0.1', 'localhost', '[::1]', ...(data?.proxy_hosts || [])];
    if (!hosts.includes(url.hostname)) return null;
    return proxyEntries(data).find(entry => entry.port === Number(url.port)) || null;
  } catch { return null; }
}

export function nodeState(node) {
  if (node.is_info) return { type: 'disabled', label: '订阅信息' };
  if (node.alive === false || node.delay === 0) return { type: 'error', label: '探测失败' };
  if (node.alive === true || Number(node.delay) > 0) return { type: 'healthy', label: '探测正常' };
  return { type: 'unknown', label: '未检测 / 未知' };
}

export function healthState(result, now = Date.now()) {
  if (!result?.checked_at) return { type: 'unknown', label: '未检测' };
  const checked = new Date(result.checked_at).getTime();
  if (!Number.isFinite(checked) || now - checked > 300000) return { type: 'unknown', label: '结果已过期' };
  if (result.error || result.components?.some(component => component.ok === false)) return { type: 'error', label: '检测异常' };
  if (!result.components?.length || result.components.some(component => component.ok !== true)) return { type: 'unknown', label: '检测不完整' };
  return { type: 'healthy', label: '检查通过' };
}

export function componentLabel(component) {
  if (component.ok !== true) return component.ok === false ? '检查失败' : '未知';
  if (component.name === '配置' || component.name === 'API Key') return '已配置';
  if (component.name === 'Qdrant 同步') return '记忆较新';
  if (component.name === 'fabric 目录') return '目录有产出';
  if (component.name === 'Qdrant') return '集合可访问';
  return '接口可达';
}

// 上游模型核对：把「已登记的自定义模型」与「兼容节点上游实时列表」对账。
// 判定口径必须与网关一致，否则页面结论和真实路由权限对不上：
// - 上游列表只取兼容节点（openai-compatible-* / anthropic-compatible-*）
// - 密钥白名单匹配规则照抄 src/sse/services/auth.js 的 checkApiKeyModelAccess
import { requestJson } from './client.js';

export const DRIFT = { ok: 'ok', missing: 'missing', suspect: 'suspect', unavailable: 'unavailable', unsupported: 'unsupported' };

export const driftLabels = {
  ok: '上游仍有',
  missing: '上游已下架',
  suspect: '存疑 · 上游列表可能不全',
  unavailable: '无法核对',
  unsupported: '不参与核对',
};

// 与 open-sse/providers/pricing.js 的 matchPattern 等价：整串锚定、* 展开为 .*、大小写不敏感。
export function wildcardMatch(pattern, model) {
  const expression = '^' + String(pattern).split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$';
  return new RegExp(expression, 'i').test(model);
}

export function isCompatibleNode(node) {
  return !!node && (node.type === 'openai-compatible' || node.type === 'anthropic-compatible' || /^(openai|anthropic)-compatible-/.test(node.id || ''));
}

// 自定义模型的 providerAlias 可能是节点 id，也可能是节点前缀；两者都认，前缀重名时放弃解析。
export function resolveNode(alias, nodes = []) {
  if (!alias) return null;
  const byId = nodes.find(node => node.id === alias);
  if (byId) return byId;
  const byPrefix = nodes.filter(node => node.prefix === alias);
  return byPrefix.length === 1 ? byPrefix[0] : null;
}

// 路由 ID 与 modelCatalog 的拼法保持一致，否则和下游发布、组合成员对不上。
export function routeIdOf(model, nodes = []) {
  const prefix = nodes.find(node => node.id === model.providerAlias)?.prefix || model.providerAlias;
  return `${prefix}/${model.id}`;
}

export function upstreamModelIds(result) {
  if (!Array.isArray(result?.models)) return null;
  return [...new Set(result.models.map(item => typeof item === 'string' ? item : item?.id || item?.model || item?.name).filter(id => typeof id === 'string' && id.trim()).map(id => id.trim()))];
}

// 逐个兼容节点查询上游模型。同一节点多账号取并集；任一账号查询失败即整节点标为不完整。
export async function fetchUpstreamSnapshot(connections = [], nodes = [], send = requestJson, onProgress = () => {}) {
  const active = connections.filter(connection => connection.isActive !== false);
  const snapshot = {};
  const done = [];
  const total = nodes.filter(node => isCompatibleNode(node)).length;
  for (const node of nodes.filter(item => isCompatibleNode(item))) {
    const accounts = active.filter(connection => connection.provider === node.id);
    const ids = new Set();
    let listed = 0;
    const rows = [];
    for (const connection of accounts) {
      let row;
      try {
        const result = await send(`/api/providers/${encodeURIComponent(connection.id)}/models`, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
        const models = upstreamModelIds(result);
        if (models === null) row = { id: connection.id, name: connection.name, status: 'error', reason: '上游返回的模型列表格式无效', count: 0, ids: [] };
        else if (!models.length) row = { id: connection.id, name: connection.name, status: 'empty', reason: '上游返回空列表，可能是账号或站点问题', count: 0, ids: [] };
        else {
          row = { id: connection.id, name: connection.name, status: result.warning ? 'warning' : 'ok', reason: result.warning || '', count: models.length, ids: models };
          if (!result.warning) listed++;
          for (const id of models) ids.add(id);
        }
      } catch (failure) {
        row = { id: connection.id, name: connection.name, status: 'error', reason: failure.name === 'TimeoutError' ? '查询超时（30 秒）' : failure.message, count: 0, ids: [] };
      }
      rows.push(row);
    }
    // 只要有一个账号完整列出，整节点的并集就足以判定「上游仍有」；否则只能标存疑。
    snapshot[node.id] = { nodeId: node.id, name: node.name, partial: !accounts.length || listed !== accounts.length, ids, accounts: rows };
    done.push({ nodeId: node.id, name: node.name });
    onProgress({ done: done.length, total, node: node.name, nodes: done });
  }
  return snapshot;
}

// 单个模型的判定：只有「所有账号都成功且返回非空，仍找不到」才敢判下架。
function modelState(model, snapshot) {
  if (!snapshot) return { state: DRIFT.unsupported, reason: '该供应商没有可查询的兼容账号' };
  if (!snapshot.accounts.length) return { state: DRIFT.unsupported, reason: '该供应商没有可用账号' };
  // 有账号查成功但返回空列表（常见于 Key 失效或站点故障）时，只能存疑，不能据此判下架。
  if (!snapshot.ids.size) return { state: DRIFT.suspect, reason: '所有账号的模型列表都为空或查询失败，不能确认下架' };
  if (snapshot.ids.has(model.id)) return { state: DRIFT.ok, reason: '' };
  if (snapshot.partial) return { state: DRIFT.suspect, reason: '部分账号未完整返回模型列表，不能确认已下架' };
  return { state: DRIFT.missing, reason: `${snapshot.accounts.length} 个账号的上游列表均无此模型` };
}

export function buildDriftReport({ customModels = [], nodes = [], upstream = {}, combos = [], keys = [] } = {}) {
  const routes = new Map();
  for (const model of customModels) {
    const node = resolveNode(model.providerAlias, nodes);
    const routeId = routeIdOf(model, nodes);
    const snapshot = node && isCompatibleNode(node) ? upstream[node.id] : null;
    const { state, reason } = modelState(model, snapshot || null);
    routes.set(routeId, {
      routeId, alias: model.providerAlias, upstreamId: model.id, name: model.name || model.id, type: model.type || 'llm',
      enabled: model.enabled !== false, nodeId: node?.id || '', nodeName: node?.name || model.providerAlias, state, reason,
      sample: snapshot?.accounts?.map(account => `${account.name}：${account.status === 'ok' ? '已列出' : account.reason || '未列出'}`) || [],
    });
  }
  const models = [...routes.values()];

  // Combo 成员与密钥白名单都是「下游路由名」，直接按路由查；查不到说明指向内置供应商，不在本次核对范围。
  const comboRows = combos.map(combo => {
    const members = (combo.models || []).map(route => ({ route, entry: routes.get(route) || null }));
    return {
      id: combo.id, name: combo.name,
      members: members.map(item => ({ route: item.route, state: item.entry?.state || 'unknown' })),
      missing: members.filter(item => item.entry?.state === DRIFT.missing).map(item => item.route),
      suspect: members.filter(item => item.entry?.state === DRIFT.suspect).map(item => item.route),
    };
  }).filter(row => row.members.length);

  const keyRows = keys.map(key => {
    const entries = [...(key.allowedModels || []).map(text => ({ text, kind: 'model' })), ...(key.allowedCombos || []).map(text => ({ text, kind: 'combo' }))];
    const rows = entries.map(({ text, kind }) => {
      if (kind === 'combo') {
        const combo = comboRows.find(row => row.name.toLowerCase() === text.toLowerCase());
        // Combo 名单在后端只做精确匹配；这里同样不展开成员，只提示组合内的死链。
        return { text, kind, matches: combo ? [combo.name] : [], missing: [], suspect: combo?.suspect || [], deadMembers: combo?.missing || [], wildcard: false };
      }
      const exact = routes.get(text);
      if (exact) return { text, kind, matches: [text], missing: exact.state === DRIFT.missing ? [text] : [], suspect: exact.state === DRIFT.suspect ? [text] : [], deadMembers: [], wildcard: false };
      if (text.includes('*')) {
        const hits = models.filter(model => wildcardMatch(text, model.routeId));
        return { text, kind, matches: hits.map(model => model.routeId), missing: hits.filter(model => model.state === DRIFT.missing).map(model => model.routeId), suspect: hits.filter(model => model.state === DRIFT.suspect).map(model => model.routeId), deadMembers: [], wildcard: true };
      }
      // 网关对不带前缀的白名单条目按「去厂商前缀后相同」放行。
      const stripped = models.filter(model => model.upstreamId.toLowerCase() === text.toLowerCase());
      return { text, kind, matches: stripped.map(model => model.routeId), missing: stripped.filter(model => model.state === DRIFT.missing).map(model => model.routeId), suspect: stripped.filter(model => model.state === DRIFT.suspect).map(model => model.routeId), deadMembers: [], wildcard: false };
    });
    // 只有「只命中一个模型、且该模型已确认下架」的条目才进建议值；通配和多义条目影响面大，不擅自删。
    const drop = rows.filter(row => row.kind === 'model' && !row.wildcard && row.matches.length === 1 && row.missing.length === 1).map(row => row.text);
    return {
      id: key.id, name: key.name, active: key.isActive !== false, entries: rows, drop,
      suggestedModels: (key.allowedModels || []).filter(text => !drop.includes(text)),
      suggestedCombos: key.allowedCombos || [],
    };
  });

  const summary = {
    registered: models.length,
    missing: models.filter(model => model.state === DRIFT.missing).length,
    suspect: models.filter(model => model.state === DRIFT.suspect).length,
    ok: models.filter(model => model.state === DRIFT.ok).length,
    unchecked: models.filter(model => model.state === DRIFT.unavailable || model.state === DRIFT.unsupported).length,
    nodes: Object.keys(upstream).length,
    combos: comboRows.filter(row => row.missing.length).length,
    keys: keyRows.filter(row => row.drop.length || row.entries.some(entry => entry.deadMembers.length)).length,
  };
  return { models, combos: comboRows, keys: keyRows, summary };
}

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { usePreferences } from '../store/preferences.js';
import { logCost, formatLogCost } from '../api/log-pricing.js';
import { Link } from 'react-router-dom';
import { providerInfo } from '../api/providers.js';
import Icon from '../components/Icon.jsx';
import ProviderIcon from '../components/ProviderIcon.jsx';
import { modelCatalog, requestTokens, requestSpeed, responseModeLabel } from '../api/data.js';
import ModelEditor from '../components/ModelEditor.jsx';
import UpstreamModels from '../components/UpstreamModels.jsx';
import { ConfirmDelete, CopyButton, ErrorBlock, IconButton, Modal, PageHeading, formatDate, formatNumber, managementEnabled, useResource } from '../components/Controls.jsx';
import { normalizeProviders, requestJson } from '../api/client.js';

const labels = { healthy: '测试正常', error: '连接异常', disabled: '已停用', unknown: '未测试 / 未知' };

function Status({ value, label }) {
  return <span className={`status ${value}`}><span className="dot"/>{label || labels[value]}</span>;
}

function Toggle({ checked, label, disabled, onChange }) {
  return <label className="toggle-control" title={label}><input type="checkbox" role="switch" aria-label={label} checked={checked} disabled={disabled} onChange={onChange}/><span aria-hidden="true" className="toggle-track"/></label>;
}

function CreateKey({ onClose, onSaved }) {
  const [name, setName] = useState('');
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function create(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await requestJson('/api/keys', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
      setCreated(result);
      onSaved();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <Modal title={created ? '密钥已创建' : '创建 API 密钥'} busy={busy} onClose={onClose}>{created ? <><p className="subtitle">{created.name}</p><div className="created-key"><code>{created.key}</code><CopyButton value={created.key} label="复制新密钥"/></div><div className="dialog-actions"><button className="button primary" onClick={onClose}>完成</button></div></> : <form className="editor-form" onSubmit={create}><label>密钥名称<input required autoFocus maxLength={100} value={name} onChange={event => setName(event.target.value)} placeholder="例如：个人开发"/></label>{error && <ErrorBlock message={error}/>}<div className="dialog-actions"><button type="button" className="button" disabled={busy} onClick={onClose}>取消</button><button type="submit" className="button primary" disabled={busy}><Icon name="key"/>{busy ? '正在创建…' : '创建密钥'}</button></div></form>}</Modal>;
}

export function EndpointPage() {
  const resource = useResource('/api/keys');
  const keys = Array.isArray(resource.data?.keys) ? resource.data.keys : [];
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [visible, setVisible] = useState(new Set());
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const baseUrl = __MODEL_BASE_URL__;
  const [protocol, setProtocol] = useState('openai');
  const anthropicUrl = baseUrl ? new URL(baseUrl) : null;
  if (anthropicUrl) anthropicUrl.pathname = anthropicUrl.pathname.replace(/\/v1\/?$/, '') || '/';
  const config = protocol === 'openai' ? { base_url: baseUrl || 'YOUR_GATEWAY_BASE_URL', api_key: 'YOUR_API_KEY' } : { ANTHROPIC_BASE_URL: anthropicUrl ? anthropicUrl.href.replace(/\/$/, '') : 'YOUR_GATEWAY_ORIGIN', ANTHROPIC_AUTH_TOKEN: 'YOUR_API_KEY' };
  const configText = JSON.stringify(config, null, 2);
  async function toggle(key) {
    setBusy(key.id);
    setError('');
    try { await requestJson(`/api/keys/${encodeURIComponent(key.id)}`, { method: 'PUT', body: JSON.stringify({ isActive: key.isActive === false }) }); resource.refresh(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(null); }
  }
  function toggleVisible(id) {
    setVisible(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  return <>
    <PageHeading title="端点与接入" subtitle="我的网关 / 模型访问入口"><button className="button" disabled={resource.loading} onClick={resource.refresh}><Icon name="refresh"/>刷新</button>{managementEnabled && <button className="button primary" onClick={() => setCreating(true)}><Icon name="plus"/>创建密钥</button>}</PageHeading>
    <section className="endpoint-section"><div className="panel-heading"><h2>模型端点</h2><span className="badge subdued">OpenAI compatible</span></div><div className="endpoint-address"><Icon name="link"/><code>{baseUrl || '未配置模型服务地址'}</code><CopyButton value={baseUrl} label="复制模型端点"/></div>
      <div className="config-toolbar"><div className="period-tabs" aria-label="客户端协议"><button aria-pressed={protocol === 'openai'} className={protocol === 'openai' ? 'selected' : ''} onClick={() => setProtocol('openai')}>OpenAI</button><button aria-pressed={protocol === 'anthropic'} className={protocol === 'anthropic' ? 'selected' : ''} onClick={() => setProtocol('anthropic')}>Anthropic</button></div><CopyButton value={configText} label="复制客户端配置"/></div><pre className="config-code"><code>{configText}</code></pre>
    </section>
    <section className="keys-section"><div className="panel-heading"><div><h2>API 密钥 <span className="heading-count">{keys.length}</span></h2><p>{keys.filter(key => key.isActive !== false).length} 个启用</p></div><Icon name="key"/></div>
      {resource.error && <ErrorBlock message={`${resource.error}${resource.data ? ' · 显示上次数据' : ''}`} onRetry={resource.refresh}/>}{error && <ErrorBlock message={error}/>}
      <div className="table-shell"><table><caption className="sr-only">网关 API 密钥</caption><thead><tr><th>名称</th><th>密钥</th><th>创建时间</th><th>启用</th>{managementEnabled && <th className="actions-column">操作</th>}</tr></thead><tbody>{resource.loading && !resource.data ? <tr><td colSpan="5" className="table-empty">正在加载密钥…</td></tr> : keys.length ? keys.map(key => <tr key={key.id}><td>{key.name}</td><td><div className="key-value"><code>{visible.has(key.id) ? key.key : `••••••••${key.key?.slice(-4) || ''}`}</code><IconButton icon={visible.has(key.id) ? 'hide' : 'eye'} label={`${visible.has(key.id) ? '隐藏' : '显示'}密钥 ${key.name}`} onClick={() => toggleVisible(key.id)}/><CopyButton value={key.key} label={`复制密钥 ${key.name}`}/></div></td><td className="mono muted">{formatDate(key.createdAt)}</td><td><Toggle label={`启用密钥 ${key.name}`} checked={key.isActive !== false} disabled={!managementEnabled || !!busy || resource.loading} onChange={() => toggle(key)}/></td>{managementEnabled && <td><IconButton icon="trash" label={`删除密钥 ${key.name}`} disabled={!!busy} onClick={() => setRemoving(key)}/></td>}</tr>) : <tr><td colSpan="5" className="table-empty">{resource.error ? '密钥读取失败' : '暂无 API 密钥'}</td></tr>}</tbody></table></div>
    </section>
    {creating && <CreateKey onClose={() => setCreating(false)} onSaved={resource.refresh}/>}
    {removing && <ConfirmDelete title="删除 API 密钥" name={removing.name} url={`/api/keys/${encodeURIComponent(removing.id)}`} onClose={() => setRemoving(null)} onDeleted={() => { setVisible(new Set()); resource.refresh(); }}/>} 
  </>;
}

export function ModelsPage({ providerId = '' }) {
  const builtIn = useResource('/api/models');
  const custom = useResource('/api/models/custom');
  const providers = useResource('/api/providers');
  const nodes = useResource('/api/provider-nodes');
  const caps = useResource('/api/models/caps');
  const disabled = useResource('/api/models/disabled');
  const [editor, setEditor] = useState(null);
  const [removingModel, setRemovingModel] = useState(null);
  const [actionError, setActionError] = useState('');
  const [busyModel, setBusyModel] = useState(null);
  const [upstream, setUpstream] = useState(false);
  const refreshModels = () => { builtIn.refresh(); custom.refresh(); providers.refresh(); nodes.refresh(); caps.refresh(); disabled.refresh(); };
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [scope, setScope] = useState(providerId ? 'all' : 'connected');
  const [provider, setProvider] = useState('');
  const [page, setPage] = useState(1);
  const models = useMemo(() => {
    const directory = nodes.data?.nodes || [];
    const connections = normalizeProviders(providers.data || {});
    return modelCatalog(builtIn.data?.models, custom.data?.models, providers.data?.connections, directory, disabled.data?.disabled).map(model => {
      const info = providerInfo(model.provider, directory);
      const connection = connections.find(connection => connection.prefix === model.provider || providerInfo(connection.provider, directory, connection).id === info.id);
      const upstreamId = model.upstreamId || model.id.slice(model.id.indexOf('/') + 1);
      const pinned = caps.data?.caps?.[model.provider]?.[upstreamId] || caps.data?.caps?.[info.id]?.[upstreamId];
      const isDisabled = [model.provider, info.id, info.prefix].some(key => disabled.data?.disabled?.[key]?.includes(upstreamId));
      return { ...model, upstreamId, caps: { ...model.caps, ...pinned }, enabled: model.enabled && !isDisabled, supplier: providerInfo(model.provider, directory, connection), hasConnections: !!connection };
    });
  }, [builtIn.data, custom.data, providers.data, nodes.data, caps.data, disabled.data]);
  const scoped = providerId ? models.filter(model => model.supplier.id === providerId) : scope === 'all' ? models : models.filter(model => model.connected);
  const filtered = scoped.filter(model => (!provider || model.supplier.id === provider) && `${model.id} ${model.name} ${model.supplier.name}`.toLowerCase().includes(deferredQuery.toLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(page, pages);
  const loading = builtIn.loading || custom.loading || providers.loading || nodes.loading || caps.loading || disabled.loading;
  const failed = builtIn.error || custom.error || providers.error || nodes.error;
  const suppliers = [...new Map([...(nodes.data?.nodes || []), ...(providers.data?.connections || []).map(connection => providerInfo(connection.provider, nodes.data?.nodes))].map(info => [info.id, { id: info.id, name: info.name }])).values()].filter(info => !providerId || info.id === providerId);
  const upstreamConnections = normalizeProviders(providers.data || {}).filter(connection => connection.isActive && providerInfo(connection.provider, nodes.data?.nodes).id === providerId);
  async function toggleModel(model) {
    setBusyModel(model.id); setActionError('');
    try {
      if (model.custom) await requestJson('/api/models/custom', { method: 'PUT', body: JSON.stringify({ providerAlias: model.provider, id: model.upstreamId, type: model.type || 'llm', enabled: !model.enabled }) });
      if (!model.custom && model.enabled) await requestJson('/api/models/disabled', { method: 'POST', body: JSON.stringify({ providerAlias: model.provider, ids: [model.upstreamId] }) });
      if (!model.enabled) for (const providerAlias of model.disabledProviders || [model.provider]) await requestJson(`/api/models/disabled?${new URLSearchParams({ providerAlias, id: model.upstreamId })}`, { method: 'DELETE' });
      refreshModels();
    } catch (failure) { setActionError(failure.message); }
    finally { setBusyModel(null); }
  }
  const actions = <><button className="button" disabled={loading} onClick={refreshModels}><Icon name="refresh"/>刷新模型</button>{managementEnabled && <><button className="button primary" disabled={loading || !suppliers.length} onClick={() => setEditor({})}><Icon name="plus"/>添加自定义模型</button>{providerId && <button className="button" disabled={loading || !upstreamConnections.length} onClick={() => setUpstream(true)}><Icon name="download"/>获取上游模型</button>}</>}</>;
  return <>
    {providerId ? <><div className="panel-heading"><h2>供应商模型</h2></div><div className="section-toolbar">{actions}</div></> : <PageHeading title="模型" subtitle="我的网关 / 模型目录">{actions}</PageHeading>}
    {actionError && <ErrorBlock message={actionError}/>} {[caps, disabled].map((item, index) => item.error && <ErrorBlock key={index} message={item.error} onRetry={item.refresh}/>)}
    {editor && <ModelEditor model={editor.id ? editor : null} suppliers={suppliers} onClose={() => setEditor(null)} onSaved={refreshModels}/>}
    {upstream && <UpstreamModels supplier={providerInfo(providerId, nodes.data?.nodes)} connections={upstreamConnections} existing={scoped} onClose={() => setUpstream(false)} onSaved={refreshModels}/>}
    {removingModel && <ConfirmDelete title="删除自定义模型" name={removingModel.id} url={`/api/models/custom?${new URLSearchParams({ providerAlias: removingModel.provider, id: removingModel.upstreamId, type: removingModel.type || 'llm' })}`} onClose={() => setRemovingModel(null)} onDeleted={refreshModels}/>}
    <div className="section-toolbar">
      {!providerId && <div className="period-tabs" aria-label="模型范围">{[['connected', '已接入供应商'], ['all', '全部目录']].map(([value, name]) => <button key={value} type="button" aria-pressed={scope === value} className={scope === value ? 'selected' : ''} onClick={() => { setScope(value); setProvider(''); setPage(1); }}>{name}</button>)}</div>}
      <span className="muted">{loading ? '正在读取…' : `${scoped.length} 个模型 · ${new Set(scoped.map(model => model.supplier.id)).size} 个供应商`}</span>
    </div>
    <section className="panel"><div className="table-toolbar"><div className="filter-search"><Icon name="search"/><input aria-label="搜索模型" value={query} placeholder="搜索模型、供应商或路由 ID…" onChange={event => { setQuery(event.target.value); setPage(1); }}/></div><select className="filter-select" aria-label="模型供应商" value={provider} onChange={event => { setProvider(event.target.value); setPage(1); }}><option value="">所有供应商</option>{[...new Map(scoped.map(model => [model.supplier.id, model.supplier.name])).entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></div>
      {builtIn.error && <ErrorBlock message={`内置模型：${builtIn.error}`} onRetry={builtIn.refresh}/>}
      {custom.error && <ErrorBlock message={`自定义模型：${custom.error}`} onRetry={custom.refresh}/>}
      {providers.error && <ErrorBlock message={`连接列表：${providers.error}`} onRetry={providers.refresh}/>}
      {nodes.error && <ErrorBlock message={`自定义节点：${nodes.error}`} onRetry={nodes.refresh}/>}
      <div className="table-shell"><table><caption className="sr-only">已登记的模型目录，不代表上游实时可用性</caption><thead><tr><th>模型 / 路由 ID</th><th>供应商</th><th>能力</th><th>上下文</th><th>状态</th><th>复制</th></tr></thead><tbody>{loading ? <tr><td colSpan="6" className="table-empty">正在加载模型…</td></tr> : filtered.length ? filtered.slice((currentPage - 1) * 20, currentPage * 20).map(model => <tr key={model.id}><td><div className="model-name"><strong>{model.name}</strong><code>{model.id}</code></div></td><td><div className="provider-link"><ProviderIcon provider={model.supplier.id}/><div>{model.hasConnections ? <Link to={`/dashboard/providers/${encodeURIComponent(model.supplier.id)}`}><strong>{model.supplier.name}</strong></Link> : <strong>{model.supplier.name}</strong>}<small>{model.supplier.custom ? '自定义节点' : '内置供应商'} · {model.supplier.prefix || model.provider}</small></div></div></td><td><div className="capabilities">{model.caps.vision && <span className="badge">视觉</span>}{model.caps.reasoning && <span className="badge">推理</span>}{model.caps.search && <span className="badge">搜索</span>}{!model.caps.vision && !model.caps.reasoning && !model.caps.search && <span className="muted">—</span>}</div></td><td className="mono muted">{formatNumber(model.caps.contextWindow)}</td><td><Status value={!model.enabled ? 'disabled' : model.connected ? 'healthy' : 'unknown'} label={!model.enabled ? '已停用' : model.connected ? '已接入' : '未接入'}/></td><td><div className="row-actions"><CopyButton value={model.id} label={`复制模型 ${model.id}`}/>{managementEnabled && <><IconButton icon="edit" label={`编辑模型 ${model.id}`} onClick={() => setEditor(model)}/><IconButton icon={model.enabled ? "hide" : "eye"} label={`${model.enabled ? "停用" : "启用"}模型 ${model.id}`} disabled={!!busyModel} onClick={() => toggleModel(model)}/>{model.custom && <IconButton icon="trash" label={`删除模型 ${model.id}`} onClick={() => setRemovingModel(model)}/>}</>}</div></td></tr>) : <tr><td colSpan="6" className="table-empty">{failed ? '模型数据未完整加载' : scope === 'connected' && !scoped.length ? '暂无已接入的模型' : '没有匹配的模型'}</td></tr>}</tbody></table></div>
      <div className="table-footer"><span>{filtered.length} 个模型</span><div className="pagination"><IconButton icon="back" label="上一页模型" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}/><span>{currentPage} / {pages}</span><IconButton icon="arrow" label="下一页模型" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}/></div></div>
    </section>
  </>;
}

function RequestDetail({ entry, connectionName, info, cost, showPrices, onClose }) {
  const [tab, setTab] = useState('summary');
  const tokens = requestTokens(entry.tokens);
  const speed = requestSpeed(entry);
  const fields = [
    ['请求 ID', entry.id], ['模型', entry.model], ['供应商', info.name], ['供应商标识', entry.provider],
    ['连接', connectionName || entry.connectionId], ['连接 ID', entry.connectionId],
    ['时间', formatDate(entry.timestamp)], ['状态', entry.status],
    ['响应模式', responseModeLabel(entry.responseMode)],
    ...(showPrices ? [['费用 · USD', formatLogCost(cost)], ['费用来源', cost?.source === 'recorded' ? '后端记录' : cost ? '当前价目表估算' : '未提供匹配价格或完整 Token']] : []),
    ['记录来源', entry.imported ? '导入' : '网关请求'],
    ['输入 Token', formatNumber(tokens.input)], ['输出 Token', formatNumber(tokens.output)],
    ['缓存读取 Token', formatNumber(tokens.cached)], ['缓存写入 Token', formatNumber(tokens.created)],
    ['推理 Token', formatNumber(tokens.reasoning)],
    ['首 Token 延迟', !entry.imported && typeof entry.latency?.ttft === 'number' ? `${entry.latency.ttft} ms` : null],
    ['总耗时', !entry.imported && typeof entry.latency?.total === 'number' ? `${entry.latency.total} ms` : null],
    ['输出 TPS', speed ? `${speed.tps.toFixed(2)} Token/s` : null],
    ['TPS 计算口径', speed?.basis || '无有效输出 Token 或实测耗时，无法计算'],
    ['请求内容', entry.request?.redacted ? '后端已脱敏' : '未提供'],
    ['响应内容', entry.response?.redacted ? '后端已脱敏' : '未提供'],
  ];
  const metadata = { id: entry.id, model: entry.model, provider: entry.provider, connectionId: entry.connectionId, timestamp: entry.timestamp, status: entry.status, responseMode: entry.responseMode, imported: entry.imported === true, tokens: entry.tokens, latency: entry.latency };
  return <Modal title="请求详情" onClose={onClose}>
    <div className="period-tabs detail-tabs" aria-label="详情视图">{[['summary', '概况'], ['metadata', '元数据']].map(([value, name]) => <button key={value} type="button" className={tab === value ? 'selected' : ''} aria-pressed={tab === value} onClick={() => setTab(value)}>{name}</button>)}</div>
    {tab === 'summary' ? <dl className="request-details">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? '—'}</dd></div>)}</dl> : <><div className="metadata-toolbar"><span>请求元数据</span><CopyButton value={JSON.stringify(metadata, null, 2)} label="复制请求元数据"/></div><pre className="request-metadata">{JSON.stringify(metadata, null, 2)}</pre></>}
  </Modal>;
}

export function LogsPage() {
  const showPrices = usePreferences(state => state.showLogPrices);
  const setShowPrices = usePreferences(state => state.setShowLogPrices);
  const autoRefresh = usePreferences(state => state.autoRefreshLogs);
  const setAutoRefresh = usePreferences(state => state.setAutoRefreshLogs);
  const providers = useResource('/api/providers');
  const nodes = useResource('/api/provider-nodes');
  const connections = normalizeProviders(providers.data || {});
  const infoFor = entry => providerInfo(entry.provider, nodes.data?.nodes, connections.find(connection => connection.id === entry.connectionId));
  const providerOptions = [...new Set(connections.map(connection => connection.provider))];
  const connectionNames = new Map(connections.map(connection => [connection.id, connection.name]));
  const [filters, setFilters] = useState({ provider: '', model: '', connectionId: '', status: '', startDate: '', endDate: '' });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selected, setSelected] = useState(null);
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  for (const [key, value] of Object.entries(applied)) if (value) params.set(key, ['startDate', 'endDate'].includes(key) ? new Date(value).toISOString() : value.trim());
  const logUrl = `/api/usage/request-details?${params}`;
  const resource = useResource(logUrl);
  const pricing = useResource(showPrices ? '/api/pricing' : null);
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => { if (!document.hidden && !resource.loading) resource.refresh(); }, 30000);
    return () => clearInterval(timer);
  }, [autoRefresh, logUrl, resource.loading, resource.refresh]);
  const details = Array.isArray(resource.data?.details) ? resource.data.details : [];
  const pagination = resource.data?.pagination;
  const set = (key, value) => setFilters(previous => ({ ...previous, [key]: value }));
  function exportRows() {
    const rows = [['请求 ID', '时间', '模型', '供应商', '连接', '连接 ID', '状态', '响应模式', '输入 Token', '输出 Token', '缓存读取 Token', '缓存写入 Token', '首 Token ms', '耗时 ms', '输出 TPS（Token/s）', 'TPS 计算口径', ...(showPrices ? ['费用 · USD（当前价目表估算）'] : [])], ...details.map(entry => {
      const tokens = requestTokens(entry.tokens);
      const speed = requestSpeed(entry);
      return [entry.id, entry.timestamp, entry.model, infoFor(entry).name, connectionNames.get(entry.connectionId), entry.connectionId, entry.status, entry.responseMode, tokens.input, tokens.output, tokens.cached, tokens.created, entry.imported ? null : entry.latency?.ttft, entry.imported ? null : entry.latency?.total, speed?.tps.toFixed(2), speed?.basis, ...(showPrices ? [formatLogCost(logCost(entry, pricing.data))] : [])];
    })];
    const csv = rows.map(row => row.map(value => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `10router-requests-page-${page}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <>
    <PageHeading title="请求日志" subtitle="我的网关 / 请求记录"><label className="checkbox-filter"><input type="checkbox" aria-label="显示日志价格" checked={showPrices} onChange={event => setShowPrices(event.target.checked)}/>显示价格</label><label className="checkbox-filter"><input type="checkbox" aria-label="自动刷新日志" checked={autoRefresh} onChange={event => setAutoRefresh(event.target.checked)}/>自动刷新 · 30 秒</label><button className="button" onClick={resource.refresh} disabled={resource.loading}><Icon name="refresh"/>刷新</button><button className="button" onClick={exportRows} disabled={resource.loading || !details.length} title="导出当前页"><Icon name="download"/>导出当前页</button></PageHeading>
    <div className="log-refresh-status"><span>更新于 {resource.updated?.toLocaleTimeString('zh-CN', { hour12: false }) || '—'}</span>{showPrices && <span>估算费用 · USD</span>}</div>
    {showPrices && pricing.error && <ErrorBlock message={`价目表读取失败：${pricing.error}`} onRetry={pricing.refresh}/>}
    <form className="log-filters" onSubmit={event => { event.preventDefault(); setPage(1); setApplied({ ...filters }); resource.refresh(); }}>
      <label>供应商<select value={filters.provider} onChange={event => set('provider', event.target.value)}><option value="">全部供应商</option>{providerOptions.map(id => <option key={id} value={id}>{providerInfo(id, nodes.data?.nodes).name}</option>)}</select></label>
      <label>模型<input value={filters.model} onChange={event => set('model', event.target.value)} placeholder="全部"/></label>
      <label>连接<select aria-label="日志连接" value={filters.connectionId} onChange={event => set('connectionId', event.target.value)}><option value="">全部连接</option>{connections.map(connection => <option key={connection.id} value={connection.id}>{providerInfo(connection.provider, nodes.data?.nodes, connection).name} · {connection.name}</option>)}</select></label>
      <label>状态<select aria-label="状态" value={filters.status} onChange={event => set('status', event.target.value)}><option value="">全部</option><option value="success">成功</option><option value="error">失败</option></select></label>
      <label>开始时间<input type="datetime-local" value={filters.startDate} onChange={event => set('startDate', event.target.value)} max={filters.endDate || undefined}/></label>
      <label>结束时间<input type="datetime-local" value={filters.endDate} onChange={event => set('endDate', event.target.value)} min={filters.startDate || undefined}/></label>
      <div className="filter-actions"><button className="button primary" type="submit"><Icon name="search"/>筛选</button><IconButton icon="close" label="清除日志筛选" onClick={() => { const empty = { provider: '', model: '', connectionId: '', status: '', startDate: '', endDate: '' }; setFilters(empty); setApplied(empty); setPage(1); resource.refresh(); }}/></div>
    </form>
    {nodes.error && <ErrorBlock message={`供应商名称读取失败：${nodes.error}`} onRetry={nodes.refresh}/>}
    {providers.error && <ErrorBlock message={`连接名称读取失败：${providers.error}`} onRetry={providers.refresh}/>}
    {resource.error && <ErrorBlock message={`${resource.error}${resource.data ? ' · 保留上次记录' : ''}`} onRetry={resource.refresh}/>}
    <div className="table-shell"><table><caption className="sr-only">请求元数据，筛选与分页由网关处理</caption><thead><tr><th>时间</th><th>模型 / 连接</th><th>供应商</th><th>状态 / 模式</th><th>输入 / 输出 Token</th><th>缓存读取 / 写入</th><th>首 Token / 总耗时</th><th title="每秒输出 Token；计算口径见请求详情">输出 TPS</th>{showPrices && <th>估算费用 · USD</th>}<th>详情</th></tr></thead>
      <tbody>{resource.loading && !resource.data ? <tr><td colSpan={showPrices ? 10 : 9} className="table-empty">正在加载日志…</td></tr> : details.length ? details.map((entry, index) => {
        const tokens = requestTokens(entry.tokens);
        const speed = requestSpeed(entry);
        const info = infoFor(entry);
        return <tr key={entry.id || `${entry.timestamp}-${index}`}>
          <td className="mono muted">{formatDate(entry.timestamp)}</td>
          <td><div className="log-model"><strong>{entry.model || '—'}</strong><small title={entry.connectionId}>{connectionNames.get(entry.connectionId) || entry.connectionId || '未知连接'}</small></div></td>
          <td><Link className="provider-link" to={`/dashboard/providers/${encodeURIComponent(info.id)}`} title={`查看供应商 ${info.name}`}><ProviderIcon provider={info.id}/><div><strong>{info.name}</strong><small>{connectionNames.get(entry.connectionId) || '历史连接已移除 / 名称未加载'}</small></div></Link></td>
          <td><Status value={['success', 'ok'].includes(entry.status) ? 'healthy' : ['error', 'failed'].includes(entry.status) ? 'error' : 'unknown'} label={['success', 'ok'].includes(entry.status) ? '成功' : ['error', 'failed'].includes(entry.status) ? '失败' : entry.status || '未知'}/><small className="log-mode">{responseModeLabel(entry.responseMode)}{entry.imported ? ' · 导入' : ''}</small></td>
          <td className="mono"><span className="value-input">{formatNumber(tokens.input)}</span> / <span className="value-output">{formatNumber(tokens.output)}</span></td>
          <td className="mono"><span className="value-cache">{formatNumber(tokens.cached)}</span> / <span className="value-created">{formatNumber(tokens.created)}</span></td>
          <td className="mono muted">{!entry.imported && typeof entry.latency?.ttft === 'number' ? entry.latency.ttft : '—'} / {!entry.imported && typeof entry.latency?.total === 'number' ? `${entry.latency.total} ms` : '—'}</td>
          <td className="mono value-tps" data-testid="request-tps" title={speed?.basis || '无有效输出 Token 或实测耗时'}>{speed ? speed.tps.toFixed(2) : '—'}</td>
          {showPrices && <td className="mono" title={logCost(entry, pricing.data) ? '当前后端价目表估算' : '后端未提供匹配价格或完整 Token'}>{formatLogCost(logCost(entry, pricing.data))}</td>}
          <td><IconButton icon="eye" label={`查看请求 ${entry.model}`} onClick={() => setSelected(entry)}/></td>
        </tr>;
      }) : <tr><td colSpan={showPrices ? 10 : 9} className="table-empty">{resource.error ? '日志读取失败' : '没有匹配的请求记录'}</td></tr>}</tbody></table></div>
    <div className="table-footer"><span>{formatNumber(pagination?.totalItems)} 条记录</span><div className="pagination"><select className="filter-select" aria-label="每页日志条数" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>{[20, 50, 100].map(size => <option key={size} value={size}>{size} 条 / 页</option>)}</select><IconButton icon="back" label="上一页日志" disabled={resource.loading || !pagination?.hasPrev} onClick={() => setPage(value => value - 1)}/><span>{pagination?.page || page} / {Math.max(1, pagination?.totalPages || 1)}</span><IconButton icon="arrow" label="下一页日志" disabled={resource.loading || !pagination?.hasNext} onClick={() => setPage(value => value + 1)}/></div></div>
    {selected && <RequestDetail entry={selected} connectionName={connectionNames.get(selected.connectionId)} info={infoFor(selected)} cost={logCost(selected, pricing.data)} showPrices={showPrices} onClose={() => setSelected(null)}/>}
  </>;
}

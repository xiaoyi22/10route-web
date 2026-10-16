import { useDeferredValue, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import ProviderIcon from '../components/ProviderIcon.jsx';
import ProviderNodeEditor from '../components/ProviderNodeEditor.jsx';
import ProviderRouting from '../components/ProviderRouting.jsx';
import ProviderError from '../components/ProviderError.jsx';
import { ConfirmDelete, ErrorBlock, IconButton, Modal, PageHeading, formatDate, managementEnabled, useResource } from '../components/Controls.jsx';
import { normalizeProviders, requestJson } from '../api/client.js';
import { connectionProxy, groupProviders, providerFailure, providerInfo, safeProxyUrl } from '../api/providers.js';
import { ModelsPage } from './CorePages.jsx';
import { proxyBinding } from '../api/hermes.js';
import { usePreferences } from '../store/preferences.js';
import { runProviderBatch } from '../api/provider-batch.js';

const labels = { healthy: '历史测试正常', error: '连接异常', disabled: '已停用', unknown: '未测试 / 未知' };

const builtInProviders = [['openai', 'OpenAI'], ['anthropic', 'Anthropic'], ['openrouter', 'OpenRouter'], ['deepseek', 'DeepSeek']];

export function ProviderEditor({ connection, initialProvider, onClose, onSaved, providerOptions = builtInProviders, includeCustomProviders = true }) {
  const nodes = useResource('/api/provider-nodes');
  const [form, setForm] = useState({ provider: connection?.provider || (providerOptions.some(([id]) => id === initialProvider) || initialProvider?.includes('-compatible-') ? initialProvider : providerOptions[0]?.[0] || 'openai'), name: connection?.name || '', priority: connection?.priority ?? 1, defaultModel: connection?.defaultModel || '', apiKey: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canReplaceKey = ['apikey', 'api_key'].includes(connection?.authType);
  const set = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const body = { name: form.name.trim(), priority: Number(form.priority), defaultModel: form.defaultModel.trim() };
    if (!connection) Object.assign(body, { provider: form.provider, apiKey: form.apiKey.trim() });
    else if (canReplaceKey && form.apiKey.trim()) body.apiKey = form.apiKey.trim();
    try {
      await requestJson(connection ? `/api/providers/${encodeURIComponent(connection.id)}` : '/api/providers', { method: connection ? 'PUT' : 'POST', body: JSON.stringify(body) });
      onSaved(form.provider);
      onClose();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <Modal title={connection ? '编辑连接' : '新增 API Key 连接'} onClose={onClose} busy={busy}><form className="editor-form" onSubmit={save}>
    {!connection && <label>供应商<select value={form.provider} onChange={event => set('provider', event.target.value)}>{providerOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}{includeCustomProviders && (nodes.data?.nodes || []).map(node => <option key={node.id} value={node.id}>{node.name} · {node.prefix}</option>)}</select></label>}
    {!connection && nodes.error && <ErrorBlock message={`自定义节点读取失败：${nodes.error}`} onRetry={nodes.refresh}/>}
    <label>连接名称<input value={form.name} onChange={event => set('name', event.target.value)} maxLength={100} required autoFocus/></label>
    <div className="form-columns"><label>优先级<input type="number" min="1" max="999" step="1" value={form.priority} onChange={event => set('priority', event.target.value)} required/></label><label>默认模型<input value={form.defaultModel} onChange={event => set('defaultModel', event.target.value)} placeholder="默认"/></label></div>
    {(!connection || canReplaceKey) && <label>{connection ? '替换 API Key' : '上游 API Key'}<input type="password" autoComplete="new-password" value={form.apiKey} onChange={event => set('apiKey', event.target.value)} required={!connection} placeholder={connection ? '留空保留现有密钥' : '输入上游密钥'}/></label>}
    {error && <ErrorBlock message={error}/>}<div className="dialog-actions"><button type="button" className="button" disabled={busy} onClick={onClose}>取消</button><button className="button primary" disabled={busy} type="submit"><Icon name="check"/>{busy ? '正在保存…' : '保存连接'}</button></div>
  </form></Modal>;
}

function BatchResults({ results, title, total, busy }) {
  const failed = results.filter(result => result.status === 'error');
  return <div className="provider-batch-results" aria-label={title}>
    <p role="status">{title}：{busy ? `已处理 ${results.length} / ${total}，` : ''}成功 {results.filter(result => result.status === 'success').length}，失败 {failed.length}，跳过 {results.filter(result => result.status === 'skipped').length}</p>
    {results.length > 0 && <details open={failed.length > 0}><summary>查看逐项结果</summary><ul>{results.map(result => <li key={result.connection.id}><strong>{result.connection.name}</strong><span className={`status ${result.status === 'success' ? 'healthy' : result.status === 'error' ? 'error' : 'disabled'}`}>{result.status === 'success' ? '成功' : result.status === 'error' ? '失败' : '已停用 · 跳过测试'}</span>{result.status === 'error' && <ProviderError error={result.error} authType={result.connection.authType}/>}</li>)}</ul></details>}
  </div>;
}

function ProxyEditor({ connections, pools, onClose, onSaved }) {
  const connection = connections.length === 1 ? connections[0] : null;
  const initialMode = connection?.proxyPoolId ? 'pool' : connection?.connectionProxyEnabled ? 'connection' : 'global';
  const [mode, setMode] = useState(initialMode);
  const [poolId, setPoolId] = useState(connection?.proxyPoolId || pools.find(pool => pool.isActive)?.id || '');
  const [url, setUrl] = useState(connection?.connectionProxyUrl || '');
  const [noProxy, setNoProxy] = useState(connection?.connectionNoProxy || '');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(connections.length);
  function edit(update) { update(); setResults([]); }
  async function save(event) {
    event.preventDefault();
    const failed = results.filter(result => result.status === 'error');
    const targets = failed.length ? failed.map(result => result.connection) : connections;
    setBusy(true);
    setResults([]);
    setTotal(targets.length);
    const body = { proxyPoolId: mode === 'pool' ? poolId : null };
    if (mode === 'connection' || mode === 'global') Object.assign(body, { connectionProxyEnabled: mode === 'connection', connectionProxyUrl: mode === 'connection' ? url.trim() : '', connectionNoProxy: mode === 'connection' ? noProxy.trim() : '' });
    try {
      const completed = await runProviderBatch(targets, 'proxy', body, setResults);
      onSaved(completed);
      if (completed.every(result => result.status === 'success')) onClose();
    }
    finally { setBusy(false); }
  }
  return <Modal title={connection ? `代理配置 · ${connection.name}` : `批量代理配置 · ${connections.length} 个账号`} onClose={onClose} busy={busy}><form className="editor-form" onSubmit={save}>
    {!connection && <p className="muted">将为所选 {connections.length} 个账号统一设置代理方式。</p>}
    <label>代理方式<select aria-label="代理方式" value={mode} disabled={busy} onChange={event => edit(() => setMode(event.target.value))}><option value="global">继承全局规则</option><option value="pool">绑定代理池</option><option value="connection">连接专用代理</option></select></label>
    {mode === 'pool' && <label>代理池<select aria-label="代理池" value={poolId} required disabled={busy} onChange={event => edit(() => setPoolId(event.target.value))}><option value="">选择代理池</option>{connection?.proxyPoolId && !pools.some(pool => pool.id === connection.proxyPoolId) && <option value={connection.proxyPoolId}>原代理池不存在</option>}{pools.map(pool => <option key={pool.id} value={pool.id}>{pool.name} · {safeProxyUrl(pool.proxyUrl)}{pool.isActive ? '' : ' · 已停用'}</option>)}</select></label>}
    {mode === 'connection' && <><label>代理地址<input type="password" autoComplete="new-password" value={url} disabled={busy} onChange={event => edit(() => setUrl(event.target.value))} required/></label><label>绕过代理<input value={noProxy} disabled={busy} onChange={event => edit(() => setNoProxy(event.target.value))}/></label></>}
    {(busy || results.length > 0) && <BatchResults results={results} title="代理配置结果" total={total} busy={busy}/>}
    <div className="dialog-actions"><button type="button" className="button" disabled={busy} onClick={onClose}>取消</button><button className="button primary" disabled={busy || (mode === 'pool' && !poolId)} type="submit"><Icon name="check"/>{busy ? '正在保存…' : results.some(result => result.status === 'error') ? '重试失败项' : '保存代理配置'}</button></div>
  </form></Modal>;
}

function ProxyBindingLink({ proxy, data }) {
  const binding = proxyBinding(proxy.address, data);
  if (!binding) return null;
  return <Link className="text-button provider-proxy-link" to={`/dashboard/proxy?group=${encodeURIComponent(binding.group)}`} title={binding.chain.join(' → ')}><Icon name="globe"/><span>:{binding.port} · {binding.chain.join(' → ') || '代理入口'}</span><Icon name="arrow"/></Link>;
}

function ConnectionDetail({ connection, info, proxy, hermes, onClose }) {
  const fields = [['供应商', info.name], ['连接名称', connection.name], ['连接 ID', connection.id], ['认证方式', connection.authType === 'oauth' ? 'OAuth' : connection.authType || '—'], ['优先级', connection.priority], ['默认模型', connection.defaultModel || '默认'], ['最后测试', formatDate(connection.lastTested)], ['接口地址', info.baseUrl ? safeProxyUrl(info.baseUrl) : '内置供应商接口'], ['当前代理来源', proxy.title], ['当前代理地址', proxy.address], ['代理类型', proxy.type || '—'], ['绕过代理规则', proxy.noProxy || '未配置'], ['代理失败处理', proxy.strict ? '强制代理，失败不回退直连' : '由后端代理规则处理']];
  return <Modal title={`连接详情 · ${connection.name}`} onClose={onClose}>{connection.lastError && <ProviderError error={connection.lastError} authType={connection.authType}/>}<dl className="request-details">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><ProxyBindingLink proxy={proxy} data={hermes}/><p className="proxy-note">当前代理配置；具体请求可能按绕过规则直连。实际出口节点由代理服务决定。</p>{proxy.warning && <ErrorBlock message={proxy.warning}/>}</Modal>;
}

export function ProvidersPage() {
  const resource = useResource('/api/providers');
  const nodes = useResource('/api/provider-nodes');
  const pools = useResource('/api/proxy-pools');
  const settings = useResource('/api/settings');
  const hermes = useResource('/api/hermes/proxy/groups');
  const connections = normalizeProviders(resource.data || {});
  const groups = groupProviders(connections, nodes.data?.nodes);
  const { provider: selectedId } = useParams();
  const navigate = useNavigate();
  const selected = groups.find(group => group.id === selectedId);
  const canCreate = !selectedId || selected?.custom || builtInProviders.some(([id]) => id === selected?.id);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const healthyOnly = usePreferences(state => state.healthyConnectionsOnly);
  const setHealthyOnly = usePreferences(state => state.setHealthyConnectionsOnly);
  const [editor, setEditor] = useState(null);
  const [nodeEditor, setNodeEditor] = useState(null);
  const [removingNode, setRemovingNode] = useState(null);
  const [proxyEditor, setProxyEditor] = useState(null);
  const [detail, setDetail] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [batchResults, setBatchResults] = useState([]);
  const [batchTotal, setBatchTotal] = useState(0);
  useEffect(() => { setSelectedIds(new Set()); setBatchResults([]); }, [selectedId, query, healthyOnly]);
  const proxy = connection => connectionProxy(connection, pools.error ? null : pools.data?.proxyPools, settings.error ? null : settings.data);
  const matching = connection => `${connection.name} ${providerInfo(connection.provider, nodes.data?.nodes, connection).name} ${connection.provider}`.toLowerCase().includes(deferredQuery.toLowerCase()) && (!healthyOnly || connection.status === 'healthy');
  const shownGroups = groups.filter(group => group.connections.some(matching) || (!group.connections.length && !healthyOnly && `${group.name} ${group.prefix}`.toLowerCase().includes(deferredQuery.toLowerCase())));
  const shownConnections = selected?.connections.filter(matching) || [];
  const selectable = selectedId ? shownConnections : shownGroups.filter(group => group.connections.length);
  const selectedItems = selectable.filter(item => selectedIds.has(item.id));
  const selectedConnections = selectedId ? selectedItems : selectedItems.flatMap(group => group.connections);
  const selectionDisabled = !!busy || resource.loading;
  const selectionHeader = managementEnabled && <th className="provider-selection"><input type="checkbox" aria-label={selectedId ? '全选当前账号' : '全选当前供应商'} checked={selectable.length > 0 && selectedItems.length === selectable.length} ref={input => { if (input) input.indeterminate = selectedItems.length > 0 && selectedItems.length < selectable.length; }} disabled={selectionDisabled || !selectable.length} onChange={event => setSelectedIds(new Set(event.target.checked ? selectable.map(item => item.id) : []))}/></th>;
  function select(id, checked) { setSelectedIds(previous => { const next = new Set(previous); if (checked) next.add(id); else next.delete(id); return next; }); }
  function refresh() { resource.refresh(); nodes.refresh(); pools.refresh(); settings.refresh(); hermes.refresh(); }
  async function testSelected(targets) {
    setBusy('batch-test'); setError(''); setMessage(''); setBatchResults([]); setBatchTotal(targets.length);
    try { await runProviderBatch(targets, 'test', null, setBatchResults); }
    finally { setBusy(null); resource.refresh(); }
  }
  async function act(connection, action) {
    setBusy(connection.id);
    setError('');
    setMessage('');
    try {
      const url = `/api/providers/${encodeURIComponent(connection.id)}`;
      const result = await requestJson(action === 'test' ? `${url}/test` : url, { method: action === 'test' ? 'POST' : 'PUT', body: JSON.stringify(action === 'test' ? {} : { isActive: !connection.isActive }) });
      if (action === 'test' && !result.valid) setError({ name: connection.name, authType: connection.authType, failure: result.error || '连接测试失败' });
      else setMessage(action === 'test' ? `${connection.name}：测试通过` : `${connection.name}：已${connection.isActive ? '停用' : '启用'}`);
      resource.refresh();
    } catch (failure) { setError(action === 'test' ? { name: connection.name, authType: connection.authType, failure } : failure.message); }
    finally { setBusy(null); }
  }
  const activeDetail = detail ? connections.find(connection => connection.id === detail.id) : null;
  return <>
    {managementEnabled && <div className="section-toolbar"><button className="button primary" onClick={() => setNodeEditor({})}><Icon name="plus"/>添加供应商</button>{selected?.custom && nodes.data?.nodes && <div className="row-actions"><button className="button" onClick={() => setNodeEditor(nodes.data.nodes.find(node => node.id === selected.id))}>编辑供应商</button><button className="button danger" onClick={() => setRemovingNode(selected)}>删除供应商</button></div>}</div>}
    {nodeEditor && <ProviderNodeEditor node={nodeEditor.id ? nodeEditor : null} onClose={() => { setNodeEditor(null); refresh(); }} onSaved={id => { refresh(); navigate(`/dashboard/providers/${encodeURIComponent(id)}`); }}/>} 
    {removingNode && <ConfirmDelete title="删除供应商及全部账号、模型" name={removingNode.name} url={`/api/provider-nodes/${encodeURIComponent(removingNode.id)}`} onClose={() => setRemovingNode(null)} onDeleted={() => { refresh(); navigate('/dashboard/providers'); }}/>} 
    {selectedId && <Link className="text-button provider-back" to="/dashboard/providers" onClick={() => setQuery('')}><Icon name="back"/>全部供应商</Link>}
    <PageHeading title={selected?.name || (selectedId ? '供应商详情' : '供应商')} subtitle={selected ? `我的网关 / ${selected.connections.length} 个账号连接` : '我的网关 / 供应商与账号连接'}><button className="button" onClick={refresh} disabled={resource.loading || !!busy}><Icon name="refresh"/>刷新连接</button>{managementEnabled && canCreate && <button className="button primary" onClick={() => setEditor({ provider: selected?.id })}><Icon name="plus"/>新增连接</button>}</PageHeading>
    <div className="provider-summary"><span><strong>{groups.length}</strong> 个供应商 / 节点</span><span><strong>{connections.length}</strong> 个连接</span><span><strong>{connections.filter(connection => connection.isActive).length}</strong> 个启用</span><span className="badge subdued">{managementEnabled ? '管理访问' : '只读'}</span></div>
    {message && <p className="success-message" role="status">{message}</p>}{error && (typeof error === 'string' ? <ErrorBlock message={error}/> : <ProviderError name={error.name} error={error.failure} authType={error.authType}/>)}
    {[resource, nodes, pools, settings].map((item, index) => item.error && <ErrorBlock key={index} message={`${['连接列表', '节点名称', '代理池', '全局规则'][index]}：${item.error}`} onRetry={item.refresh}/>)}
    {selected && settings.data && !settings.error && <ProviderRouting key={`routing-${selected.id}`} provider={selected.id} settings={settings.data} onSaved={settings.refresh}/>}
    <section className="panel"><div className="table-toolbar"><div className="filter-search"><Icon name="search"/><input aria-label="搜索供应商" placeholder="搜索供应商或账号连接…" value={query} disabled={!!busy} onChange={event => setQuery(event.target.value)}/></div><label className="checkbox-filter"><input type="checkbox" aria-label="仅显示正常连接" checked={healthyOnly} disabled={!!busy} onChange={event => setHealthyOnly(event.target.checked)}/>仅正常连接</label></div>
      {managementEnabled && <div className="provider-batch-toolbar"><span>{selectedId ? `已选 ${selectedConnections.length} 个账号` : `已选 ${selectedItems.length} 个供应商 · ${selectedConnections.length} 个账号`}</span><div className="provider-batch-actions"><button className="button" disabled={selectionDisabled || !selectedConnections.some(connection => connection.isActive)} onClick={() => testSelected(selectedConnections)}><Icon name="play"/>批量测试</button><button className="button" disabled={selectionDisabled || !selectedConnections.length || pools.loading || settings.loading || !!pools.error || !!settings.error} onClick={() => setProxyEditor(selectedConnections)}><Icon name="globe"/>批量绑定代理</button>{batchResults.some(result => result.status === 'error') && <button className="button" disabled={selectionDisabled} onClick={() => testSelected(batchResults.filter(result => result.status === 'error').map(result => result.connection))}>重试失败项</button>}<button className="text-button" disabled={selectionDisabled || !selectedItems.length} onClick={() => setSelectedIds(new Set())}>取消选择</button></div><small>{selectedId ? '全选当前筛选中的账号。' : '选择供应商将包含其全部账号。'} 测试会跳过已停用账号。</small></div>}
      {(busy === 'batch-test' || batchResults.length > 0) && <BatchResults results={batchResults} title="批量测试结果" total={batchTotal} busy={busy === 'batch-test'}/>}
      {!selectedId ? <div className="table-shell"><table><caption className="sr-only">供应商分组列表</caption><thead><tr>{selectionHeader}<th>供应商 / 节点</th><th>账号连接</th><th>历史测试 / 启用</th><th>异常原因</th><th>当前代理</th><th>详情</th></tr></thead><tbody>{resource.loading && !resource.data ? <tr><td colSpan={managementEnabled ? 7 : 6} className="table-empty">正在加载供应商…</td></tr> : shownGroups.map(group => {
        const paths = [...new Set(group.connections.map(connection => { const path = proxy(connection); return `${path.title} · ${path.address}`; }))];
        const failures = [...new Set(group.connections.filter(connection => connection.lastError || connection.status === 'error').map(connection => providerFailure(connection.lastError, connection.authType).label))];
        return <tr key={group.id}>{managementEnabled && <td className="provider-selection"><input type="checkbox" aria-label={`选择供应商 ${group.name}`} checked={selectedIds.has(group.id) && group.connections.length > 0} disabled={selectionDisabled || !group.connections.length} onChange={event => select(group.id, event.target.checked)}/></td>}<td><Link className="provider-link" to={`/dashboard/providers/${encodeURIComponent(group.id)}`} onClick={() => setQuery('')}><ProviderIcon provider={group.id}/><div><strong>{group.name}</strong><small>{group.custom ? '自定义节点' : '内置供应商'}{group.prefix ? ` · ${group.prefix}` : ''}</small></div></Link></td><td>{group.connections.length}</td><td><div className="provider-health"><span className={`status ${group.errors ? 'error' : group.healthy ? 'healthy' : 'unknown'}`}><span className="dot"/>{group.errors ? `${group.errors} 个异常` : group.healthy ? `${group.healthy} 个测试正常` : '未测试 / 已停用'}</span><small>{group.enabled} 个启用 · {group.healthy} 个测试正常</small></div></td><td className="provider-failures">{failures.length ? failures.map(label => <Link key={label} to={`/dashboard/providers/${encodeURIComponent(group.id)}`}>{label}</Link>) : <span className="muted">—</span>}</td><td className="proxy-cell">{paths.map(path => <span key={path}>{path}</span>)}</td><td><Link className="icon-button" title={`查看供应商 ${group.name}`} aria-label={`查看供应商 ${group.name}`} to={`/dashboard/providers/${encodeURIComponent(group.id)}`}><Icon name="arrow"/></Link></td></tr>;
      })}{!resource.loading && !shownGroups.length && <tr><td colSpan={managementEnabled ? 7 : 6} className="table-empty">没有匹配的供应商</td></tr>}</tbody></table></div> : selected ? <>
        {selected.baseUrl && <div className="provider-endpoint"><span>接口地址</span><code>{safeProxyUrl(selected.baseUrl)}</code></div>}
        <div className="table-shell"><table><caption className="sr-only">供应商账号连接列表</caption><thead><tr>{selectionHeader}<th>账号连接</th><th>测试状态</th><th>优先级</th><th>当前代理</th><th>启用</th><th>操作</th></tr></thead><tbody>{shownConnections.map(connection => {
          const path = proxy(connection);
          const failure = connection.lastError ? providerFailure(connection.lastError, connection.authType) : null;
          return <tr key={connection.id}>{managementEnabled && <td className="provider-selection"><input type="checkbox" aria-label={`选择账号 ${connection.name}`} checked={selectedIds.has(connection.id)} disabled={selectionDisabled} onChange={event => select(connection.id, event.target.checked)}/></td>}<td><button className="connection-name connection-open" onClick={() => setDetail(connection)}><ProviderIcon provider={connection.provider}/><div><strong>{connection.name}</strong><small>{connection.authType === 'oauth' ? 'OAuth' : 'API Key'} · {formatDate(connection.lastTested)}</small></div></button></td><td className="provider-test-status"><span className={`status ${connection.status}`}><span className="dot"/>{connection.status === 'error' && failure ? failure.label : labels[connection.status]}</span>{failure && <><small>{connection.status === 'disabled' ? `历史异常：${failure.label}。` : ''}{failure.hint}</small><button className="text-button" onClick={() => setDetail(connection)}><Icon name="eye"/>查看错误详情</button></>}</td><td>{connection.priority}</td><td className="proxy-cell"><strong>{path.title}</strong><span>{path.address}</span><ProxyBindingLink proxy={path} data={hermes.error ? null : hermes.data}/>{path.warning && <small className="error-message">绑定失效 · 按回退规则</small>}</td><td><label className="toggle-control"><input type="checkbox" role="switch" aria-label={`启用 ${connection.name}`} checked={connection.isActive} disabled={!managementEnabled || !!busy || resource.loading} onChange={() => act(connection, 'toggle')}/><span aria-hidden="true" className="toggle-track"/></label></td><td><div className="row-actions"><IconButton icon="eye" label={`查看连接 ${connection.name}`} onClick={() => setDetail(connection)}/>{managementEnabled && <><IconButton icon="globe" label={`代理 ${connection.name}`} disabled={!!busy || pools.loading || settings.loading || !!pools.error || !!settings.error} onClick={() => setProxyEditor([connection])}/><IconButton icon="play" label={`测试 ${connection.name}`} disabled={!!busy || resource.loading || !connection.isActive} onClick={() => act(connection, 'test')}/><IconButton icon="edit" label={`编辑 ${connection.name}`} disabled={!!busy} onClick={() => setEditor(connection)}/><IconButton icon="trash" label={`删除 ${connection.name}`} disabled={!!busy} onClick={() => setRemoving(connection)}/></>}</div></td></tr>;
        })}{!shownConnections.length && <tr><td colSpan={managementEnabled ? 7 : 6} className="table-empty">没有匹配的账号连接</td></tr>}</tbody></table></div>
      </> : <p className="empty-state">{resource.loading ? '正在加载供应商…' : resource.error ? '供应商读取失败' : '供应商不存在或已移除'}</p>}
      <div className="table-footer"><span>{selectedId ? `${shownConnections.length} 个账号连接` : `${shownGroups.length} 个供应商 / 节点`}</span><span>代理为当前配置，历史测试不代表实时可用性</span></div>
    </section>
    {selected && <ModelsPage key={selected.id} providerId={selected.id}/>}
    {editor && <ProviderEditor connection={editor.id ? editor : null} initialProvider={editor.provider} onClose={() => setEditor(null)} onSaved={provider => { resource.refresh(); if (provider && provider !== selectedId) navigate(`/dashboard/providers/${encodeURIComponent(provider)}`); }}/>} 
    {proxyEditor && <ProxyEditor connections={proxyEditor} pools={pools.data?.proxyPools || []} onClose={() => setProxyEditor(null)} onSaved={results => { resource.refresh(); const count = results.filter(result => result.status === 'success').length; if (count) setMessage(`已保存 ${count} 个账号的代理配置`); }}/>}
    {activeDetail && <ConnectionDetail connection={activeDetail} info={providerInfo(activeDetail.provider, nodes.data?.nodes, activeDetail)} proxy={proxy(activeDetail)} hermes={hermes.error ? null : hermes.data} onClose={() => setDetail(null)}/>}
    {removing && <ConfirmDelete title="删除供应商连接" name={removing.name} url={`/api/providers/${encodeURIComponent(removing.id)}`} onClose={() => setRemoving(null)} onDeleted={resource.refresh}/>}
  </>;
}

import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { ErrorBlock, IconButton, Modal, PageHeading, formatDate, managementEnabled, useResource } from '../components/Controls.jsx';
import { requestJson } from '../api/client.js';
import { useEgress } from '../components/useEgress.js';
import { groupChain, nodeState, proxyEntries } from '../api/hermes.js';
const ProxySubscriptions = lazy(() => import('../components/ProxySubscriptions.jsx'));
const ProxyWatch = lazy(() => import('../components/ProxyWatch.jsx'));

const watchedGroups = ['ai-谷歌', 'AI-优选'];

function EgressRow({ entry, revision, onSwitch, switchDisabled }) {
  const { data, busy, error, stale, refresh } = useEgress(entry, managementEnabled && entry.probeSupported && !switchDisabled, revision);
  return <tr><td><strong className="mono">:{entry.port}</strong><small className="cell-note">{entry.name}</small></td><td className="proxy-chain">{entry.chain.length ? entry.chain.join(' → ') : '按分流规则处理'}</td><td className="proxy-chain"><strong className="mono">{data?.ip || '—'}</strong><small className="cell-note">{[data?.country, data?.city, data?.org || data?.isp].filter(Boolean).join(' · ') || (data?.checked_at ? '未返回位置' : busy ? '自动检测中' : '等待检测')}</small>{data?.chain?.length > 0 && <small className="cell-note">探测链：{data.chain.join(' → ')}</small>}{error && <small className="error-message" role="alert">{data ? '更新失败，保留上次结果：' : '出口检测失败：'}{error}</small>}</td><td className="muted">{formatDate(data?.checked_at)}<small className="cell-note">{busy ? data ? '检测中，保留上次结果' : '自动检测中' : stale ? '上次结果 · 等待更新' : '自动检测 · 5分钟缓存'}</small></td><td><div className="row-actions"><IconButton icon="globe" label={`检测端口 ${entry.port} 出口`} disabled={!managementEnabled || !entry.probeSupported || busy || switchDisabled} onClick={refresh}/>{onSwitch && <button className="button" aria-label={`切换节点 ${entry.group}`} disabled={busy || switchDisabled} onClick={() => onSwitch(entry.group)}><Icon name="edit"/>切换节点</button>}</div></td></tr>;
}

export function ProxyPage() {
  const groups = useResource('/api/hermes/proxy/groups');
  const [params, setParams] = useSearchParams();
  const view = ['subscriptions', 'watch'].includes(params.get('view')) ? params.get('view') : 'nodes';
  const allGroups = groups.data?.groups || [];
  const requestedGroup = params.get('group') || '';
  const status = useResource(`/api/hermes/proxy/status${requestedGroup ? `?group=${encodeURIComponent(requestedGroup)}` : ''}`);
  const selected = requestedGroup || status.data?.group || '';
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [switching, setSwitching] = useState(null);
  const switchingStatus = useResource(switching?.choosing ? `/api/hermes/proxy/status?group=${encodeURIComponent(switching.group)}` : null);
  const switchingData = switchingStatus.data?.group === switching?.group ? switchingStatus.data : null;
  const [measurements, setMeasurements] = useState({});
  const [revision, setRevision] = useState(0);
  const group = allGroups.find(group => group.name === selected);
  const currentData = status.data?.group === selected ? status.data : null;
  const nodes = (currentData?.nodes || []).filter(node => !node.is_info);
  const entries = proxyEntries(groups.data);
  const filtered = nodes.filter(node => node.name.toLowerCase().includes(query.toLowerCase()));
  const chain = groupChain(selected, groups.data?.groups);
  function chooseNode(group) { setError(''); setSwitching({ group, name: '', choosing: true }); }
  function refresh(removedGroup) {
    if (typeof removedGroup === 'string' && requestedGroup === removedGroup) {
      const next = new URLSearchParams(params); next.delete('group'); setParams(next, { replace: true });
    }
    groups.refresh(); status.refresh(); setRevision(value => value + 1);
  }
  useEffect(() => { setMeasurements({}); setQuery(''); setError(''); setMessage(''); setSwitching(null); }, [selected]);
  useEffect(() => {
    if (view !== 'nodes') return;
    function syncGroups() {
      if (!document.hidden && navigator.onLine !== false && !groups.loading) groups.refresh();
    }
    const timer = setInterval(syncGroups, 30000);
    document.addEventListener('visibilitychange', syncGroups);
    window.addEventListener('online', syncGroups);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', syncGroups); window.removeEventListener('online', syncGroups); };
  }, [view, groups.loading, groups.refresh]);
  async function test(node) {
    setBusy(node.name); setError(''); setMessage('');
    try {
      const result = await requestJson('/api/hermes/proxy/delay', { method: 'POST', body: JSON.stringify({ name: node.name }) });
      setMeasurements(previous => ({ ...previous, [node.name]: { delay: result.delay, alive: typeof result.delay === 'number' && result.delay > 0, measured: true } }));
    } catch (failure) {
      setMeasurements(previous => ({ ...previous, [node.name]: { delay: null, alive: false, measured: true, error: failure.message } }));
      setError(`${node.name}：${failure.message}`);
    } finally { setBusy(''); }
  }
  async function switchNode() {
    if (!switching?.name) return;
    setBusy(switching.name); setError('');
    try {
      await requestJson('/api/hermes/proxy/select', { method: 'POST', body: JSON.stringify({ group: switching.group, name: switching.name }) });
      setMessage(`已切换 ${switching.group} → ${switching.name}`); setSwitching(null); refresh();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(''); }
  }
  return <>
    <PageHeading title="代理控制" subtitle="Mihomo / 代理组与出口"><span className="last-updated">更新于 {formatDate(groups.updated)}</span><button className="button" disabled={groups.loading || status.loading || !!busy} onClick={refresh}><Icon name="refresh"/>刷新状态</button></PageHeading>
    {groups.error && <ErrorBlock message={groups.error} onRetry={groups.refresh}/>}
    {status.error && <ErrorBlock message={status.error} onRetry={status.refresh}/>}
    {error && !switching && <ErrorBlock message={error}/>}
    {message && <p className="success-message" role="status">{message}</p>}
    <div className="monitor-runtime"><span>运行模式 <strong>{currentData?.mode || '—'}</strong></span><span>代理组 <strong>{allGroups.length}</strong></span><span>当前生效机场 <strong>{currentData?.active_airport || '—'}</strong></span><Link className="text-button" to="/dashboard/providers">供应商连接<Icon name="arrow"/></Link></div>
    <div className="monitor-view-tabs" role="tablist" aria-label="代理管理视图">{[['nodes', '节点与出口'], ['subscriptions', '机场与订阅'], ['watch', '故障看护']].map(([value, label]) => <button key={value} id={`proxy-tab-${value}`} role="tab" aria-selected={view === value} aria-controls={`proxy-panel-${value}`} disabled={!!busy} onClick={() => { const next = new URLSearchParams(params); next.set('view', value); setParams(next); }}>{label}</button>)}</div>
    <div role="tabpanel" id={`proxy-panel-${view}`} aria-labelledby={`proxy-tab-${view}`}>
    <Suspense fallback={<p className="empty-state" role="status" aria-busy="true">正在加载…</p>}>
    {view === 'nodes' && <>
    <section className="requests-section"><div className="panel-heading"><div><h2>代理入口</h2><p>自动检测出口 IP / 位置 · 缓存5分钟，切换节点后更新</p></div><Icon name="globe"/></div><div className="table-shell"><table className="proxy-table"><caption className="sr-only">Mihomo 入口和出口检测</caption><thead><tr><th>入口端口</th><th>代理组 → 当前节点</th><th>出口 IP / 位置</th><th>检测时间</th><th>操作</th></tr></thead><tbody>{entries.map(entry => entry.probeSupported ? <EgressRow key={entry.port} entry={entry} revision={revision} switchDisabled={!!busy || groups.loading} onSwitch={managementEnabled && watchedGroups.includes(entry.group) && allGroups.find(group => group.name === entry.group)?.type === 'Selector' ? chooseNode : undefined}/> : <tr key={entry.port}><td className="mono">:{entry.port}</td><td className="proxy-chain">{entry.chain.join(' → ') || '按分流规则处理'}</td><td colSpan="3" className="muted">此入口暂不支持出口探测</td></tr>)}{!entries.length && <tr><td colSpan="5" className="table-empty">{groups.loading ? '正在读取代理入口…' : '暂无代理入口配置'}</td></tr>}</tbody></table></div></section>
    <section className="requests-section proxy-section"><div className="panel-heading"><div><h2>节点</h2><p className="proxy-chain">{chain.join(' → ') || '未选择代理组'}</p></div><span className="badge subdued">{group?.type || '—'}</span></div>
      <div className="proxy-filters"><label>代理组<select aria-label="代理组" value={selected} disabled={!!busy} onChange={event => setParams({ group: event.target.value })}>{!allGroups.length && <option value="">暂无代理组</option>}{allGroups.map(group => <option key={group.name} value={group.name}>{group.name} · {group.type}</option>)}</select></label><label>搜索节点<input type="search" aria-label="搜索节点" value={query} onChange={event => setQuery(event.target.value)} placeholder="节点名称"/></label></div>
      <div className="table-shell"><table className="proxy-table" aria-busy={status.loading}><caption className="sr-only">代理节点与历史探测状态</caption><thead><tr><th>节点名称</th><th>协议 / 类型</th><th>检测状态</th><th>延迟</th><th>操作</th></tr></thead><tbody>{filtered.map(node => {
        const measured = measurements[node.name];
        const state = nodeState({ ...node, ...measured });
        const delay = measured ? measured.delay : node.delay;
        return <tr key={node.name}><td className="proxy-node-name"><strong>{node.name}</strong>{currentData?.now === node.name && <span className="badge subdued">当前选择</span>}</td><td className="muted">{node.type || '—'}</td><td><span className={`status ${state.type}`} title={measured?.error || ''}><span className="dot"/>{state.label}</span><small className="cell-note">{measured ? '本次手动检测' : 'Mihomo 最近记录'}</small></td><td className="mono">{typeof delay === 'number' && delay > 0 ? `${delay} ms` : delay === 0 ? '超时' : '—'}</td><td><div className="row-actions"><IconButton icon="activity" label={`测速 ${node.name}`} disabled={!managementEnabled || !!busy || status.loading} onClick={() => test(node)}/>{group?.type === 'Selector' && <IconButton icon="check" label={`选择 ${node.name}`} disabled={!managementEnabled || !!busy || status.loading || currentData?.now === node.name} onClick={() => { setError(''); setSwitching({ group: selected, name: node.name }); }}/>}</div></td></tr>;
      })}{!filtered.length && <tr><td colSpan="5" className="table-empty">{status.loading ? '正在读取节点…' : '没有匹配的节点'}</td></tr>}</tbody></table></div><div className="table-footer"><span>{filtered.length} 个节点</span><span>{group?.type === 'Selector' ? '节点选择为运行时状态' : '当前代理组由 Mihomo 自动选择节点'}</span></div>
    </section>
    </>}
    {view === 'subscriptions' && <ProxySubscriptions groups={allGroups} revision={revision} onChanged={refresh}/>}
    {view === 'watch' && <section className="proxy-section"><div className="panel-heading"><div><h2>故障看护</h2><p>最近探测、切换与告警</p></div><Icon name="shield"/></div><div className="proxy-watch-grid">{watchedGroups.filter(name => allGroups.some(group => group.name === name)).map(name => <ProxyWatch key={name} group={name} revision={revision} onChanged={refresh}/>)}</div>{!watchedGroups.some(name => allGroups.some(group => group.name === name)) && <p className="empty-state">暂无已接入的看护组</p>}</section>}
    </Suspense>
    </div>
    {switching && <Modal title="切换代理节点" onClose={() => setSwitching(null)} busy={!!busy}><dl className="request-details"><div><dt>代理组</dt><dd>{switching.group}</dd></div><div><dt>当前节点</dt><dd>{(switching.choosing ? switchingData?.now : currentData?.now) || '—'}</dd></div>{!switching.choosing && <div><dt>目标节点</dt><dd>{switching.name}</dd></div>}</dl>
      {switching.choosing && <div className="editor-form"><label>目标节点<select value={switching.name} disabled={!!busy || switchingStatus.loading || !switchingData || !!switchingStatus.error} onChange={event => setSwitching(previous => ({ ...previous, name: event.target.value }))}><option value="">{switchingStatus.loading ? '正在读取节点…' : '请选择池内节点'}</option>{(switchingData?.nodes || []).filter(node => !node.is_info).map(node => <option key={node.name} value={node.name} disabled={node.name === switchingData.now}>{node.name}{node.name === switchingData.now ? ' · 当前使用' : ` · ${nodeState(node).label}`}</option>)}</select></label></div>}
      <p className="proxy-note">使用该代理组的连接将采用新的节点。已启用的自动看护会继续按原规则处理故障。</p>{switching.choosing && switchingStatus.error && <ErrorBlock message={switchingStatus.error} onRetry={switchingStatus.refresh}/>}{error && <ErrorBlock message={error}/>}<div className="dialog-actions"><button className="button" disabled={!!busy} onClick={() => setSwitching(null)}>取消</button><button className="button primary" disabled={!!busy || !switching.name || (switching.choosing && (switchingStatus.loading || !switchingData || !!switchingStatus.error || switching.name === switchingData.now))} onClick={switchNode}><Icon name="check"/>{busy ? '正在切换…' : '确认切换'}</button></div></Modal>}
  </>;
}

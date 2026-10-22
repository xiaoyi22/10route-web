import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { ErrorBlock, Modal, PageHeading, formatDate, formatNumber, managementEnabled, useResource } from '../components/Controls.jsx';
import { requestJson } from '../api/client.js';
import { actionNames, availabilityNames, availabilityTone, summarizeAvailability } from '../api/availability.js';

function AvailabilityStatus({ row }) {
  return <span className={`status ${availabilityTone[row.status] || 'unknown'}`}><span className="dot"/>{availabilityNames[row.status] || row.status}</span>;
}

function RequestEvidence({ target, onClose }) {
  const query = new URLSearchParams({ provider: target.provider, connectionId: target.connectionId, pageSize: '100' });
  if (target.model && target.model !== '*') query.set('model', target.model);
  const resource = useResource('/api/usage/request-details?' + query);
  const row = resource.data?.details?.find(detail => detail.id === target.requestId);
  return <Modal title="关联业务请求" onClose={onClose}><dl className="request-details"><div><dt>请求 ID</dt><dd>{target.requestId}</dd></div><div><dt>模型</dt><dd>{target.model}</dd></div><div><dt>事件原因</dt><dd>{target.reason || '最近一次已记录业务'}</dd></div></dl>{resource.error ? <ErrorBlock message={resource.error} onRetry={resource.refresh}/> : resource.loading ? <p className="inline-note">正在读取业务记录…</p> : row ? <dl className="request-details">{[['请求时间', formatDate(row.timestamp)], ['最终状态', row.status], ['上游错误码', row.error?.code || '无'], ['错误原因', row.error?.message || '无'], ['总耗时', row.latency?.total == null ? '未记录' : `${row.latency.total} ms`], ['入口', row.endpoint || '未记录'], ['上游路径', row.upstreamEndpoint || '未记录']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : <p className="inline-note">最近的日志中未找到此请求，可能已按保留策略清理或尚未落盘。渠道处理记录仍保留。</p>}<p className="inline-note">读取已有日志，不会重新发送模型请求。</p></Modal>;
}

function Rules({ data, refresh }) {
  const [config, setConfig] = useState(data.config);
  const [revision, setRevision] = useState(data.revision);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  useEffect(() => { if (!dirty) { setConfig(data.config); setRevision(data.revision); } }, [data.config, data.revision, dirty]);
  const edit = changes => { setConfig(previous => ({ ...previous, ...changes })); setDirty(true); setSaved(''); };
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await requestJson('/api/model-availability', { method: 'PUT', body: JSON.stringify({ config, revision }) });
      setDirty(false); setSaved('规则已保存。新请求开始累计判定；手工隔离继续保留。'); refresh();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <form className="panel availability-rules" aria-label="自动处理规则" onSubmit={save}><fieldset className="plain-fieldset" disabled={busy || !managementEnabled}>
    <div className="availability-section-heading"><div><h2>自动处理规则</h2><p>只依据真实业务请求，不运行定时探测。人工隔离在两种模式下均生效。</p></div><span className="badge subdued">默认仅观察</span></div>
    <label className="availability-rule-mode">运行模式<select value={config.mode} onChange={event => edit({ mode: event.target.value })}><option value="observe">仅观察 · 记录状态，不自动干预</option><option value="auto">自动处理 · 仅对勾选的供应商生效</option></select></label>
    <div className="availability-rule-grid">{[['failureThreshold', '连续失败阈值', 2, 20, '次'], ['windowMinutes', '失败统计窗口', 1, 1440, '分钟'], ['cooldownMinutes', '默认冷却时间', 1, 1440, '分钟'], ['staleHours', '记录新鲜度', 1, 720, '小时']].map(([key, label, min, max, unit]) => <label key={key}>{label}<div><input type="number" min={min} max={max} required aria-label={label} value={config[key]} onChange={event => edit({ [key]: Number(event.target.value) })}/><span>{unit}</span></div></label>)}</div>
    <div><h3>允许自动处理的供应商</h3><p className="muted">未勾选的供应商持续记录，不自动隔离。</p><div className="availability-provider-choices">{data.providers.map(provider => <label key={provider.id}><input type="checkbox" checked={config.providers.includes(provider.id)} onChange={event => edit({ providers: event.target.checked ? [...config.providers, provider.id] : config.providers.filter(id => id !== provider.id) })}/>{provider.name}</label>)}</div></div>
    <div className="availability-rule-notes"><p><strong>明确账号问题</strong>凭据失效、余额不足暂停对应账号；模型不存在仅暂停对应模型，均需人工处理后解除。</p><p><strong>暂时故障</strong>429 进入冷却；超时和上游错误累计达到阈值后冷却。无法确认的错误只记录。</p><p><strong>恢复方式</strong>冷却结束后只允许一笔真实业务确认恢复；没有业务则保持待恢复，不发送额外请求。</p><p><strong>规则变更</strong>清除旧自动隔离，重新累计；手工停用和手工隔离不受影响。</p></div>
    {error && <ErrorBlock message={error}/>}<div className="dialog-actions"><span className="success-message" role="status">{saved}</span><button type="button" className="button" disabled={!dirty} onClick={() => { setDirty(false); setError(''); }}>撤销更改</button><button className="button primary" disabled={!dirty || (config.mode === 'auto' && !config.providers.length)}><Icon name="check"/>{busy ? '正在保存…' : '保存可用性规则'}</button></div>
  </fieldset></form>;
}

function ChannelControl({ row, onClose, refresh }) {
  const [scope, setScope] = useState(row.accountBlocked ? '*' : row.model);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const release = row.blocked || row.status === 'waiting' || row.status === 'recovering';
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await requestJson('/api/model-availability', { method: 'POST', body: JSON.stringify({ provider: row.provider, connectionId: row.connectionId, model: scope, action: release ? 'release' : 'isolate', reason }) });
      refresh(); onClose();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <Modal title={release ? '解除渠道隔离' : '人工隔离渠道'} onClose={onClose} busy={busy}><form className="editor-form" onSubmit={save}><dl className="request-details"><div><dt>供应商</dt><dd>{row.providerName}</dd></div><div><dt>账号</dt><dd>{row.connectionName}</dd></div><div><dt>当前状态</dt><dd><AvailabilityStatus row={row}/></dd></div></dl><label>操作范围<select value={scope} onChange={event => setScope(event.target.value)}>{row.model !== '*' && <option value={row.model}>仅此模型 · {row.model}</option>}<option value="*">此账号的全部模型</option></select></label>{!release && <label>隔离原因<input value={reason} maxLength={200} onChange={event => setReason(event.target.value)} placeholder="例如：上游渠道维护"/></label>}<p className="inline-note">{release ? '仅解除可用性管理的隔离，等待真实业务确认。不会重新启用手工关闭的账号或模型，也不会改动发布名单。' : '立即从业务调度中排除此范围，不修改账号启用开关和发布名单。'}</p>{row.accountBlocked && scope !== '*' && <p className="error-message">此账号存在账号级隔离，仅解除模型隔离不会恢复账号。</p>}{error && <ErrorBlock message={error}/>}<div className="dialog-actions"><button type="button" className="button" disabled={busy} onClick={onClose}>取消</button><button className={`button ${release ? 'primary' : 'danger'}`} disabled={busy}>{busy ? '正在保存…' : release ? '解除隔离' : '确认隔离'}</button></div></form></Modal>;
}

export default function AvailabilityPage() {
  const resource = useResource('/api/model-availability');
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState('channels');
  const [query, setQuery] = useState(params.get('model') || '');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [control, setControl] = useState(null);
  const [detail, setDetail] = useState(null);
  const [evidence, setEvidence] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const provider = params.get('provider') || '';
  const connectionId = params.get('connectionId') || '';
  useEffect(() => { setPage(1); }, [query, status, provider, connectionId]);
  useEffect(() => { if (!autoRefresh || view === 'rules' || control) return; const timer = setInterval(() => { if (!document.hidden) resource.refresh(); }, 15000); return () => clearInterval(timer); }, [autoRefresh, view, control, resource.refresh]);
  const data = resource.data;
  const rows = data?.rows || [];
  const summary = summarizeAvailability(rows);
  const filtered = rows.filter(row => (!provider || row.provider === provider) && (!connectionId || row.connectionId === connectionId) && (!status || row.status === status || (status === 'blocked' && row.blocked)) && `${row.model} ${row.providerName} ${row.connectionName}`.toLowerCase().includes(query.toLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const current = Math.min(page, pages);
  return <>
    <PageHeading title="模型可用性" subtitle="监控 / 真实业务请求与渠道状态"><label className="checkbox-filter"><input type="checkbox" checked={autoRefresh} onChange={event => setAutoRefresh(event.target.checked)}/>自动刷新状态</label><button className="button" disabled={resource.loading} onClick={resource.refresh}><Icon name="refresh"/>刷新记录</button></PageHeading>
    <div className="availability-intro"><span className="availability-intro-icon"><Icon name="shield"/></span><div><strong>被动观察，不发送探活请求</strong><p>只记录真实业务的最终结果。无请求不判失效，冷却到期不自动标为正常。</p></div><span className="badge subdued">{data ? data.config.mode === 'auto' ? '自动处理已开启' : '仅观察模式' : '正在读取'}</span></div>
    <div className="availability-metrics">{[['模型渠道', summary.total], ['最近调用正常', summary.healthy], ['已暂停渠道', summary.blocked], ['未验证 / 待恢复', summary.unknown]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{data ? formatNumber(value) : '—'}</strong></div>)}</div>
    <div className="monitor-view-tabs" role="tablist" aria-label="可用性视图">{[['channels', '渠道状态'], ['rules', '自动处理规则'], ['history', '处理记录']].map(([value, label]) => <button key={value} role="tab" aria-selected={view === value} aria-controls={`availability-${value}`} id={`availability-tab-${value}`} onClick={() => setView(value)}>{label}</button>)}</div>
    {resource.error && <ErrorBlock message={resource.error} onRetry={resource.refresh}/>}
    {!data ? <p className="empty-state">{resource.loading ? '正在读取可用性记录…' : '可用性数据暂不可用，未推断任何渠道正常。'}</p> : <>
      <div className="availability-observed"><span>开始记录 {formatDate(data.since)}</span><span>已观察 {formatNumber(data.observedRequests)} 次真实请求</span><Link to="/dashboard/monitor">原有模型检测<Icon name="arrow"/></Link></div>
      {view === 'rules' ? <div role="tabpanel" id="availability-rules" aria-labelledby="availability-tab-rules"><Rules data={data} refresh={resource.refresh}/></div> : view === 'history' ? <section className="panel" role="tabpanel" id="availability-history" aria-labelledby="availability-tab-history"><div className="availability-section-heading"><div><h2>处理记录</h2><p>保留最近 500 条规则、人工操作和自动处理记录。</p></div></div>{data.events.length ? <ul className="availability-events">{data.events.map(event => <li key={event.id}><span className={`availability-event-icon ${event.action.includes('restore') || event.action.includes('release') ? 'restored' : ''}`}><Icon name={event.action === 'config' ? 'settings' : event.action.includes('isolate') ? 'shield' : 'check'}/></span><div><strong>{actionNames[event.action] || event.action}</strong><p>{event.provider && `${data.providers.find(item => item.id === event.provider)?.name || event.provider} · `}{rows.find(row => row.connectionId === event.connectionId)?.connectionName || ''}{event.model && ` · ${event.model === '*' ? '账号全部模型' : event.model}`}</p><p>{event.reason}</p>{event.requestId && <button className="text-button" onClick={() => setEvidence(event)}>关联请求：{event.requestId}</button>}</div><time>{formatDate(event.at)}</time></li>)}</ul> : <p className="empty-state">暂无处理记录。仅浏览页面不会发送模型请求。</p>}</section> : <section className="panel" role="tabpanel" id="availability-channels" aria-labelledby="availability-tab-channels">
        <div className="table-toolbar"><div className="filter-search"><Icon name="search"/><input aria-label="搜索可用性渠道" placeholder="搜索模型、中转站或账号…" value={query} onChange={event => setQuery(event.target.value)}/></div><select className="filter-select" aria-label="可用性供应商" value={provider} onChange={event => { const next = new URLSearchParams(params); if (event.target.value) next.set('provider', event.target.value); else next.delete('provider'); next.delete('connectionId'); setParams(next); }}><option value="">全部供应商</option>{data.providers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select className="filter-select" aria-label="可用性状态" value={status} onChange={event => setStatus(event.target.value)}><option value="">全部状态</option><option value="blocked">已暂停渠道</option>{Object.entries(availabilityNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>{connectionId && <button className="text-button" onClick={() => { const next = new URLSearchParams(params); next.delete('connectionId'); setParams(next); }}>清除账号筛选</button>}</div>
        <div className="table-shell"><table className="availability-table"><caption className="sr-only">真实业务模型可用性</caption><thead><tr><th>模型 / 中转站账号</th><th>渠道状态</th><th>最近成功 / 失败</th><th>业务统计</th><th>发布与调度</th><th>操作</th></tr></thead><tbody>{filtered.slice((current - 1) * 20, current * 20).map(row => <tr key={row.key}><td><strong>{row.model === '*' ? '账号全部模型 · 未指定目录' : row.model}</strong><small>{row.providerName} · {row.connectionName}</small>{row.routeId && <code>{row.routeId}</code>}</td><td><AvailabilityStatus row={row}/>{row.blockReason && <small>{row.blockReason}</small>}{row.lastError && !row.blockReason && <small>{row.lastError.message}</small>}{row.until && <small>冷却至 {formatDate(row.until)}</small>}</td><td><small>成功 {formatDate(row.lastSuccess)}</small><small>失败 {formatDate(row.lastFailure)}</small></td><td><span>{formatNumber(row.successes || 0)} 成功 / {formatNumber(row.failures || 0)} 异常</span><small>连续异常 {row.consecutiveFailures || 0} 次</small>{row.latencyMs != null && <small>最近耗时 {formatNumber(row.latencyMs)} ms</small>}</td><td><span>{row.publicationRequested ? '已选择发布' : '未选择发布'}</span><small>{row.disabledByUser ? '手工停用优先' : row.blocked ? '此账号不参与调度' : '可参与业务调度'}</small></td><td><div className="row-actions"><button className="button" onClick={() => setDetail(row)}>详情</button>{managementEnabled && <button className="button" onClick={() => setControl(row)}>{row.blocked || ['waiting', 'recovering'].includes(row.status) ? '解除隔离' : '隔离'}</button>}</div></td></tr>)}{!filtered.length && <tr><td colSpan="6" className="table-empty">没有匹配的模型渠道</td></tr>}</tbody></table></div><div className="table-footer"><span>{filtered.length} 个渠道 · 状态不等于模型身份或质量证明</span><div className="pagination"><button className="button" disabled={current <= 1} onClick={() => setPage(current - 1)}>上一页</button><span>{current} / {pages}</span><button className="button" disabled={current >= pages} onClick={() => setPage(current + 1)}>下一页</button></div></div>
      </section>}
    </>}
    {control && <ChannelControl row={control} onClose={() => setControl(null)} refresh={resource.refresh}/>}
    {detail && <Modal title={`渠道详情 · ${detail.model}`} onClose={() => setDetail(null)}><dl className="request-details">{[['中转站', detail.providerName], ['账号', detail.connectionName], ['状态', availabilityNames[detail.status]], ['最近成功', formatDate(detail.lastSuccess)], ['最近失败', formatDate(detail.lastFailure)], ['最近业务结果', detail.lastOutcome || '未验证'], ['失败原因', detail.lastError?.message || detail.blockReason || '无'], ['最近请求 ID', detail.lastRequestId || '无'], ['手工停用', detail.disabledByUser ? '是，解除隔离不会重新启用' : '否']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p className="inline-note">只保留状态与错误摘要，不保存请求正文或凭据。恢复资格不等于调用已验证成功。</p>{detail.lastRequestId && <button className="button" onClick={() => { setDetail(null); setEvidence({ ...detail, requestId: detail.lastRequestId }); }}>查看关联请求<Icon name="arrow"/></button>}</Modal>}
    {evidence && <RequestEvidence target={evidence} onClose={() => setEvidence(null)}/>}
  </>;
}

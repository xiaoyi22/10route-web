import { useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import ProviderIcon from '../components/ProviderIcon.jsx';
import ProviderError from '../components/ProviderError.jsx';
import { ErrorBlock, IconButton, Modal, PageHeading, formatDate, formatNumber, managementEnabled, useResource } from '../components/Controls.jsx';
import { requestJson } from '../api/client.js';
import { providerInfo } from '../api/providers.js';
import { checkNames, resultNames, resultTone, explicitMonitorConfig, toggleMonitorModel, monitorTargets, recentChecks, checkLatency, manualCheckRow } from '../api/monitor.js';

const duration = value => typeof value === 'number' ? `${(value / 1000).toFixed(2)} s` : '—';
const percent = value => value === null ? '—' : `${value.toFixed(1)}%`;

function CheckStatus({ status = 'pending' }) {
  return <span className={`status ${resultTone(status)}`}><span className="dot"/>{resultNames[status] || (status === 'pending' ? '未检测' : status)}</span>;
}

function CheckDetail({ row, name, catalog, onClose }) {
  const provider = catalog.find(item => item.id === row.provider);
  const accountName = id => provider?.connections?.find(connection => connection.id === id)?.name || id || '后端未返回';
  return <Modal title={`${checkNames[row.check || 'iq']} · ${row.model}`} onClose={onClose}>
    <dl className="request-details"><div><dt>供应商</dt><dd>{name(row.provider)}</dd></div><div><dt>检测时间</dt><dd>{formatDate(row.at)}</dd></div><div><dt>结果</dt><dd><CheckStatus status={row.status}/></dd></div><div><dt>本轮耗时</dt><dd>{duration(checkLatency(row))}</dd></div>{row.check !== 'availability' && <div><dt>题库正确率</dt><dd>{row.score == null ? '未评分' : `${row.score}%`}</dd></div>}<div><dt>记录来源</dt><dd>{row.manual ? '本页单次测试' : '后台检测记录'}</dd></div></dl>
    {(row.answers || []).map((answer, index) => <section className="monitor-answer" key={index}><h3>{row.check === 'availability' ? '模型回复' : `题目 ${index + 1}`}</h3>{answer.question && <p>{answer.question}</p>}<dl className="request-details">{row.check !== 'availability' && <><div><dt>标准答案</dt><dd>{answer.answer ?? answer.iq?.expected ?? '—'}</dd></div><div><dt>模型答案</dt><dd>{answer.iq?.modelAnswered || '—'}</dd></div></>}<div><dt>状态</dt><dd><CheckStatus status={answer.status}/></dd></div><div><dt>HTTP 状态</dt><dd>{answer.ok ? answer.statusCode ?? answer.httpStatus ?? '—' : answer.statusCode ?? answer.httpStatus ?? '—'}</dd></div><div><dt>耗时</dt><dd>{duration(answer.latencyMs)}</dd></div><div><dt>使用账号</dt><dd>{accountName(answer.connectionId)}</dd></div></dl>{answer.error ? <ProviderError error={{ message: answer.error, status: answer.statusCode ?? answer.httpStatus }} authType={provider?.connections?.find(connection => connection.id === answer.connectionId)?.authType}/> : <pre className="request-metadata">{answer.content || answer.iq?.modelAnswered || '后端未返回文本'}</pre>}</section>)}
  </Modal>;
}

function ManualTest({ target, check, routeId, onClose, onResult }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const settings = useResource(check === 'iq' ? '/api/settings' : null);
  async function run() {
    setBusy(true); setError('');
    try {
      const result = await requestJson('/api/models/test', { method: 'POST', body: JSON.stringify({ model: routeId, kind: 'llm', ...(check === 'iq' && { probe: 'iq' }) }) });
      onResult(manualCheckRow(result, target, check));
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <Modal title={`单次${checkNames[check]} · ${target.model}`} onClose={onClose} busy={busy}>
    <dl className="request-details"><div><dt>模型路由</dt><dd><code>{routeId}</code></dd></div><div><dt>账号选择</dt><dd>由后端路由选择可用账号</dd></div><div><dt>请求次数</dt><dd>1 次真实模型请求，按上游规则计费</dd></div><div><dt>记录范围</dt><dd>结果保留在当前页面；后台历史展示自动检测记录</dd></div></dl>
    {check === 'iq' && <section className="monitor-answer"><h3>网关单次检测题目</h3>{settings.error ? <ErrorBlock message={settings.error} onRetry={settings.refresh}/> : settings.loading ? <p>正在读取题目…</p> : <><p>{settings.data?.iqProbe?.question || '后端未返回单题配置'}</p><span className="muted">标准答案：{settings.data?.iqProbe?.answer ?? '—'}</span></>}</section>}
    {error && <ErrorBlock message={error}/>}<div className="dialog-actions"><button className="button" disabled={busy} onClick={onClose}>取消</button><button className="button primary" disabled={busy || (check === 'iq' && (!settings.data?.iqProbe?.question || !!settings.error))} onClick={run}><Icon name="play"/>{busy ? '正在检测…' : '开始检测'}</button></div>
  </Modal>;
}

function MonitorConfig({ data, onSaved }) {
  const [config, setConfig] = useState(() => explicitMonitorConfig(data.config, data.catalog));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const edit = patch => { setConfig(previous => ({ ...previous, ...patch })); setDirty(true); setMessage(''); };
  const changeProvider = (id, patch) => edit({ providers: config.providers.map(provider => provider.id === id ? { ...provider, ...patch } : provider) });
  const targets = monitorTargets(config, data.catalog);
  const requests = targets.reduce((sum, target) => sum + (target.check === 'iq' ? config.questions.length : 1), 0);
  async function save(event) {
    event.preventDefault(); setError(''); setMessage('');
    if (config.providers.some(provider => !provider.models.length)) { setError('请为已选择的供应商勾选至少一个检测模型，或取消该供应商。'); return; }
    if (config.enabled && !targets.length) { setError('启用自动检测前，请选择至少一个可用检测模型。'); return; }
    setBusy(true);
    try {
      const result = await requestJson('/api/iq-monitor', { method: 'PUT', body: JSON.stringify(config) });
      setConfig(explicitMonitorConfig(result.config, data.catalog)); setDirty(false);
      setMessage(result.config.enabled ? '已保存，后台将在约 30 秒内检查检测计划。' : '已保存，自动检测已关闭。'); onSaved();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <form className="monitor-config" onSubmit={save}>
    <fieldset disabled={!managementEnabled || busy}>
      <section className="monitor-config-band"><div className="panel-heading"><h2>自动检测计划</h2><span className="muted">{dirty ? '有未保存更改' : '已保存配置'}</span></div><div className="monitor-plan-controls"><label className="checkbox-filter"><input type="checkbox" aria-label="启用自动检测" checked={config.enabled} onChange={event => edit({ enabled: event.target.checked })}/>启用自动检测</label><label>间隔（分钟）<input aria-label="检测间隔" type="number" min="15" max="10080" step="1" required value={config.intervalMinutes} onChange={event => edit({ intervalMinutes: Number(event.target.value) })}/></label><span className="muted">{config.providers.length} 个供应商 · 每轮最多 {requests} 次请求</span></div><p className="inline-note">检测会产生上游用量。单次测试使用网关单题，自动智商检测执行下方题库。</p></section>
      <section className="monitor-config-band"><div className="panel-heading"><h2>供应商与模型</h2></div><div className="filter-search"><Icon name="search"/><input aria-label="搜索检测配置供应商" placeholder="搜索供应商或模型…" value={query} onChange={event => setQuery(event.target.value)}/></div>
        {config.providers.filter(selected => !data.catalog.some(provider => provider.id === selected.id)).map(selected => <div className="error-block" key={selected.id}>供应商已不存在：{selected.id}<IconButton icon="trash" label={`移除 ${selected.id}`} onClick={() => edit({ providers: config.providers.filter(item => item.id !== selected.id) })}/></div>)}
        {data.catalog.filter(provider => `${provider.name} ${provider.id} ${provider.models.join(' ')}`.toLowerCase().includes(query.toLowerCase())).map(provider => {
          const selected = config.providers.find(item => item.id === provider.id);
          return <details key={provider.id} className="monitor-provider-config"><summary><ProviderIcon provider={provider.id}/><strong>{provider.name}</strong><span>{selected ? `${selected.models.length} 个检测模型` : '未加入检测'} · {provider.models.length} 个模型</span></summary><div className="monitor-provider-body"><label className="checkbox-filter"><input aria-label={`参与检测 ${provider.name}`} type="checkbox" disabled={!selected && !provider.models.length} checked={!!selected} onChange={event => edit({ providers: event.target.checked ? [...config.providers, { id: provider.id, mode: 'selected', models: [], modelChecks: {}, excludedConnectionIds: [] }] : config.providers.filter(item => item.id !== provider.id) })}/>参与检测</label>
            {selected && <><ProviderModelChecks provider={provider} selected={selected} onChange={patch => changeProvider(provider.id, patch)}/><div className="monitor-excluded"><h3>不参与自动检测的账号</h3>{provider.connections.map(connection => <label className="checkbox-filter" key={connection.id}><input aria-label={`排除账号 ${connection.name}`} type="checkbox" checked={(selected.excludedConnectionIds || []).includes(connection.id)} onChange={event => changeProvider(provider.id, { excludedConnectionIds: event.target.checked ? [...(selected.excludedConnectionIds || []), connection.id] : (selected.excludedConnectionIds || []).filter(id => id !== connection.id) })}/>{connection.name}</label>)}</div></>}
          </div></details>;
        })}
        {!data.catalog.length && <p className="empty-state">暂无供应商，请先添加账号和模型。</p>}
      </section>
      <section className="monitor-config-band"><div className="panel-heading"><h2>自动检测题库</h2><span className="muted">数字标准答案 · {config.questions.length} / 20 题</span></div>{config.questions.map((question, index) => <div className="monitor-question" key={index}><label>题目 {index + 1}<textarea aria-label={`检测题目 ${index + 1}`} rows="3" required maxLength="10000" value={question.question} onChange={event => edit({ questions: config.questions.map((item, position) => position === index ? { ...item, question: event.target.value } : item) })}/></label><div><label>标准答案<input aria-label={`标准答案 ${index + 1}`} required pattern="-?[0-9]+(\.[0-9]+)?" value={question.answer} onChange={event => edit({ questions: config.questions.map((item, position) => position === index ? { ...item, answer: event.target.value } : item) })}/></label><IconButton icon="trash" label={`删除题目 ${index + 1}`} disabled={config.questions.length === 1} onClick={() => edit({ questions: config.questions.filter((_, position) => position !== index) })}/></div></div>)}<button type="button" className="button" disabled={config.questions.length >= 20} onClick={() => edit({ questions: [...config.questions, { question: '', answer: '' }] })}><Icon name="plus"/>添加题目</button></section>
      {error && <ErrorBlock message={error}/>}<div className="monitor-save"><span role="status">{message}</span><button className="button primary" type="submit" disabled={busy || !dirty}><Icon name="check"/>{busy ? '正在保存…' : '保存检测配置'}</button></div>
    </fieldset>
  </form>;
}

function ProviderModelChecks({ provider, selected, onChange }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const models = [...new Set([...provider.models, ...selected.models])].filter(model => model.toLowerCase().includes(search.toLowerCase()));
  const pages = Math.max(1, Math.ceil(models.length / 20));
  const current = Math.min(page, pages);
  return <div className="monitor-model-checks"><div className="filter-search"><Icon name="search"/><input aria-label={`搜索检测模型 ${provider.name}`} placeholder="搜索模型…" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }}/></div><div className="table-shell"><table><thead><tr><th>模型</th><th>测活</th><th>智商检测</th></tr></thead><tbody>{models.slice((current - 1) * 20, current * 20).map(model => <tr key={model}><td className="log-model">{model}{!provider.models.includes(model) && <small>当前不可用</small>}</td>{['availability', 'iq'].map(check => <td key={check}><input type="checkbox" aria-label={`${provider.name} ${model} ${checkNames[check]}`} checked={selected.modelChecks?.[model]?.includes(check) || false} disabled={!provider.models.includes(model) && !selected.modelChecks?.[model]?.includes(check)} onChange={event => onChange(toggleMonitorModel(selected, model, check, event.target.checked))}/></td>)}</tr>)}</tbody></table></div><div className="table-footer"><span>{models.length} 个模型</span><div className="pagination"><IconButton icon="back" label={`上一页检测模型 ${provider.name}`} disabled={current <= 1} onClick={() => setPage(current - 1)}/><span>{current} / {pages}</span><IconButton icon="arrow" label={`下一页检测模型 ${provider.name}`} disabled={current >= pages} onClick={() => setPage(current + 1)}/></div></div></div>;
}

export function MonitorPage() {
  const resource = useResource('/api/iq-monitor');
  const nodes = useResource('/api/provider-nodes');
  const [view, setView] = useState('status');
  const [check, setCheck] = useState('availability');
  const [provider, setProvider] = useState('');
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('configured');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);
  const [manual, setManual] = useState(null);
  const [manualResults, setManualResults] = useState({});
  const [autoRefresh, setAutoRefresh] = useState(true);
  useEffect(() => { if (!autoRefresh) return; const timer = setInterval(() => { if (!document.hidden) resource.refresh(); }, 15000); return () => clearInterval(timer); }, [autoRefresh, resource.refresh]);
  const data = resource.data;
  const catalog = data?.catalog || [];
  const history = data?.state?.history || [];
  const targets = data ? monitorTargets(data.config, catalog) : [];
  const name = id => { const info = providerInfo(id, nodes.data?.nodes); return info.name === id || info.name.startsWith('自定义节点（') ? catalog.find(item => item.id === id)?.name || id : info.name; };
  const matches = row => (!provider || row.provider === provider) && `${row.model} ${name(row.provider)}`.toLowerCase().includes(query.toLowerCase());
  const statusRows = (scope === 'all' ? catalog.flatMap(item => item.models.map(model => ({ provider: item.id, model, check }))) : targets.filter(target => target.check === check)).filter(matches);
  const filteredHistory = history.filter(row => (row.check || 'iq') === check && matches(row)).sort((a, b) => b.at - a.at);
  const rows = view === 'history' ? filteredHistory : statusRows;
  const pages = Math.max(1, Math.ceil(rows.length / 20));
  const current = Math.min(page, pages);
  const latestFor = target => {
    const automatic = recentChecks(history, target.provider, target.model, check)[0];
    const manual = manualResults[JSON.stringify([target.provider, target.model, check])];
    return manual && (!automatic || manual.at > automatic.at) ? manual : automatic;
  };
  const selectedLatest = statusRows.map(latestFor).filter(Boolean);
  const passed = selectedLatest.filter(row => ['available', 'correct'].includes(row.status)).length;
  const failed = selectedLatest.filter(row => ['incorrect', 'rate_limited', 'timeout', 'error'].includes(row.status)).length;
  const filter = (setter, value) => { setter(value); setPage(1); };
  const stateLabel = data?.running ? '检测中' : data?.config.enabled ? '等待下一轮' : '自动检测已关闭';
  return <>
    <PageHeading title="模型检测" subtitle="模型测活 / 智商检测"><label className="checkbox-filter"><input aria-label="自动刷新检测结果" type="checkbox" checked={autoRefresh} onChange={event => setAutoRefresh(event.target.checked)}/>自动刷新</label><span className="last-updated">{resource.updated?.toLocaleTimeString('zh-CN') || '—'}</span><button className="button" disabled={resource.loading} onClick={resource.refresh}><Icon name="refresh"/>刷新</button></PageHeading>
    {resource.error && <ErrorBlock message={`${resource.error}${data ? ' · 当前保留上次结果' : ''}`} onRetry={resource.refresh}/>}
    <div className="monitor-view-tabs" role="tablist" aria-label="模型检测视图">{[['status', '模型状态'], ['history', '检测记录'], ['config', '自动检测配置']].map(([value, title]) => <button type="button" role="tab" aria-selected={view === value} key={value} onClick={() => { setView(value); setPage(1); }}>{title}</button>)}</div>
    {!data ? <p className="empty-state">{resource.error ? '检测数据读取失败' : '正在读取检测数据…'}</p> : <>
      <div className="monitor-runtime"><span className={`status ${data.running ? 'healthy' : 'unknown'}`}><span className="dot"/>{stateLabel}</span><span>上轮完成 {formatDate(data.state.completedAt)}</span><span>下轮 {data.config.enabled ? data.running ? '本轮完成后计算' : data.state.revision !== data.config.revision ? '等待后台检查' : formatDate(data.state.nextAt) : '—'}</span></div>
      {view === 'config' ? <MonitorConfig data={data} onSaved={resource.refresh}/> : <>
        <div className="section-toolbar"><div className="period-tabs" aria-label="检测类型">{Object.entries(checkNames).map(([value, title]) => <button type="button" key={value} aria-pressed={check === value} className={check === value ? 'selected' : ''} onClick={() => filter(setCheck, value)}>{title}</button>)}</div><span className="muted">{check === 'iq' ? '得分按题库正确率计算' : '测活按后端返回的有效回复判定'}</span></div>
        {view === 'status' && <section className="metrics-grid monitor-metrics" aria-label="检测汇总">{[['匹配模型', statusRows.length], ['最近通过', passed], ['最近异常', failed], ['未检测 / 未评分', statusRows.length - passed - failed]].map(([title, count]) => <div className="metric" key={title}><div className="metric-label">{title}</div><div className="metric-value">{formatNumber(count)}</div></div>)}</section>}
        <div className="monitor-filters"><div className="filter-search"><Icon name="search"/><input aria-label="搜索检测模型" placeholder="搜索模型或供应商…" value={query} onChange={event => filter(setQuery, event.target.value)}/></div><label>供应商<select aria-label="检测供应商" value={provider} onChange={event => filter(setProvider, event.target.value)}><option value="">全部供应商</option>{[...new Set([...catalog.map(item => item.id), ...history.map(row => row.provider)])].map(id => <option key={id} value={id}>{name(id)}</option>)}</select></label>{view === 'status' && <label>模型范围<select aria-label="检测模型范围" value={scope} onChange={event => filter(setScope, event.target.value)}><option value="configured">已配置检测模型</option><option value="all">全部可检测模型</option></select></label>}</div>
        <div className="table-shell"><table className="monitor-table"><caption className="sr-only">{view === 'history' ? '真实后台检测历史' : '供应商模型检测状态'}</caption><thead><tr><th>模型 / 供应商</th><th>结果</th><th>{view === 'history' ? '检测时间' : '最近 30 轮'}</th><th>{check === 'iq' ? '题库正确率' : '最近通过率'}</th><th>本轮耗时</th><th>{view === 'history' ? '操作' : '最新检测 / 操作'}</th></tr></thead><tbody>{rows.slice((current - 1) * 20, current * 20).map((target, index) => {
          const previous = recentChecks(history, target.provider, target.model, check);
          const key = JSON.stringify([target.provider, target.model, check]);
          const row = view === 'history' ? target : latestFor(target);
          const success = previous.length ? previous.filter(item => ['available', 'correct'].includes(item.status)).length / previous.length * 100 : null;
          const backoff = data.state.backoff?.[target.provider];
          return <tr key={view === 'history' ? `${key}-${target.at}-${index}` : key}><td><div className="connection-name"><ProviderIcon provider={target.provider}/><div className="log-model"><strong>{target.model}</strong><small>{name(target.provider)}</small></div></div></td><td><CheckStatus status={row?.status}/>{row?.manual && <small className="log-mode">单次测试</small>}{backoff > Date.now() && <small className="log-mode">退避至 {formatDate(backoff)}</small>}</td><td>{view === 'history' ? <span className="mono muted">{formatDate(row.at)}</span> : <div className="monitor-history-dots" aria-label="最近30轮后台检测，左旧右新">{Array.from({ length: 30 - previous.length }, (_, i) => <span key={`empty-${i}`} title="未检测"/>)}{[...previous].reverse().map((item, i) => <button type="button" key={`${item.at}-${i}`} className={resultTone(item.status)} title={`${formatDate(item.at)} · ${resultNames[item.status] || item.status}`} aria-label={`查看检测 ${target.model} ${formatDate(item.at)}`} onClick={() => setDetail(item)}/>)}</div>}</td><td className="mono">{check === 'iq' ? row?.score == null ? '—' : `${row.score}%` : percent(success)}{check === 'iq' && typeof row?.change === 'number' && <small className="log-mode">{row.change > 0 ? '+' : ''}{row.change} 分</small>}</td><td className="mono">{duration(checkLatency(row))}</td><td><div className="monitor-actions">{view === 'status' && <small>{formatDate(row?.at)}</small>}<div>{row && <IconButton icon="eye" label={`查看检测详情 ${target.model}`} onClick={() => setDetail(row)}/>} {view === 'status' && <IconButton icon="play" label={`单次${checkNames[check]} ${target.model}`} disabled={!managementEnabled} onClick={() => setManual({ target, check })}/>}</div></div></td></tr>;
        })}{!rows.length && <tr><td className="table-empty" colSpan="6">{view === 'history' ? '暂无匹配的检测记录' : scope === 'configured' ? '暂无匹配的已配置模型' : '暂无匹配的可检测模型'}{view === 'status' && scope === 'configured' && <button type="button" className="text-button" onClick={() => setView('config')}>配置检测模型</button>}</td></tr>}</tbody></table></div>
        <div className="table-footer"><span>{rows.length} {view === 'history' ? '条记录' : '个模型'}</span><div className="pagination"><IconButton icon="back" label="上一页检测结果" disabled={current <= 1} onClick={() => setPage(current - 1)}/><span>{current} / {pages}</span><IconButton icon="arrow" label="下一页检测结果" disabled={current >= pages} onClick={() => setPage(current + 1)}/></div></div>
      </>}
    </>}
    {detail && <CheckDetail row={detail} name={name} catalog={catalog} onClose={() => setDetail(null)}/>}
    {manual && <ManualTest {...manual} routeId={`${providerInfo(manual.target.provider, nodes.data?.nodes).prefix || manual.target.provider}/${manual.target.model}`} onClose={() => setManual(null)} onResult={row => { setManualResults(previous => ({ ...previous, [JSON.stringify([row.provider, row.model, row.check])]: row })); setManual(null); setDetail(row); }}/>} 
  </>;
}

import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { ErrorBlock, PageHeading, formatDate, formatNumber, managementEnabled, useResource } from '../components/Controls.jsx';
import { requestJson } from '../api/client.js';
import { componentLabel, healthState } from '../api/hermes.js';

function HealthSection({ title, result, loading }) {
  const state = healthState(result);
  const names = { 'Embedder': '嵌入模型', 'Reranker': '重排模型', 'LLM': '语言模型', 'LLM 端点': '提取模型', 'fabric 目录': '提取文件', 'Qdrant 同步': '记忆新鲜度' };
  return <section className="chain-health-section"><div className="panel-heading"><div><h2>{title}</h2><p>检测于 {formatDate(result?.checked_at)}</p></div><span className={`status ${state.type}`}><span className="dot"/>{state.label}</span></div>
    {result?.error && <ErrorBlock message={result.error}/>}
    <div className="table-shell"><table className="health-table"><caption className="sr-only">{title} 组件检查结果</caption><thead><tr><th>组件</th><th>结果</th><th>耗时</th><th>详情</th></tr></thead><tbody>{(result?.components || []).map(component => <tr key={component.name}><td><strong>{names[component.name] || component.name}</strong></td><td><span className={`status ${component.ok === true ? 'healthy' : component.ok === false ? 'error' : 'unknown'}`}><span className="dot"/>{componentLabel(component)}</span>{state.label === '结果已过期' && <small className="cell-note">历史结果</small>}</td><td className="mono">{typeof component.latency_ms === 'number' ? `${component.latency_ms} ms` : '—'}</td><td className="health-detail">{component.detail || (component.ok === false ? '上游未提供失败原因' : '—')}{component.status > 0 && <small className="cell-note">HTTP {component.status}</small>}</td></tr>)}{!result?.components?.length && <tr><td colSpan="4" className="table-empty">{loading ? '正在读取检测记录…' : result?.error ? '无法获取组件结果' : '尚无检测记录'}</td></tr>}</tbody></table></div>
  </section>;
}

export function ChainHealthPage() {
  const resource = useResource('/api/hermes/health');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const data = result || resource.data;
  async function check() {
    setBusy(true); setError('');
    try { setResult(await requestJson('/api/hermes/health/check', { method: 'POST', body: '{}' })); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  function refresh() { setResult(null); resource.refresh(); }
  const components = [data?.mem0, data?.icarus].flatMap(result => result?.components || []);
  const failed = components.filter(component => component.ok === false).length;
  return <>
    <PageHeading title="链路健康" subtitle="Hermes / Mem0 与 Icarus"><button className="button" disabled={busy || resource.loading} onClick={refresh}><Icon name="refresh"/>刷新记录</button>{managementEnabled && <button className="button primary" disabled={busy || resource.loading} onClick={check}><Icon name="activity"/>{busy ? '正在检测…' : '检测链路'}</button>}</PageHeading>
    {(error || resource.error) && <ErrorBlock message={error || resource.error} onRetry={refresh}/>}
    <div className="monitor-runtime"><span>最近检测 <strong>{formatDate(data?.checked_at)}</strong></span><span>检测范围 <strong>组件接口、配置与数据新鲜度</strong></span><span>检测链路会调用模型服务</span></div>
    <section className="metrics-grid health-metrics" aria-label="链路检测摘要"><div className="metric"><div className="metric-label">已检查组件<Icon name="activity"/></div><div className="metric-value">{data?.checked_at ? components.length : '—'}</div><span className="metric-note">Mem0 + Icarus</span></div><div className="metric"><div className="metric-label">异常组件<Icon name="shield"/></div><div className="metric-value">{data?.checked_at ? failed : '—'}</div><span className="metric-note">最近一次结果</span></div><div className="metric"><div className="metric-label">记忆数量<Icon name="server"/></div><div className="metric-value">{formatNumber(data?.mem0?.memory_count)}</div><span className="metric-note">Qdrant / mem0</span></div><div className="metric"><div className="metric-label">提取文件<Icon name="logs"/></div><div className="metric-value">{formatNumber(data?.icarus?.fabric_count)}</div><span className="metric-note">Icarus / fabric</span></div></section>
    <HealthSection title="Mem0" result={data?.mem0} loading={resource.loading}/>
    <HealthSection title="Icarus" result={data?.icarus} loading={resource.loading}/>
  </>;
}

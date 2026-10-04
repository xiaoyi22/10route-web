import { useState } from 'react';
import { cacheRate } from '../api/data.js';
import { providerInfo } from '../api/providers.js';
import { formatNumber, IconButton } from './Controls.jsx';

function UsageRow({ name, provider, requests, input, output, total, cached, summary = false }) {
  const rate = cacheRate(cached, input);
  return <tr className={summary ? 'usage-total-row' : ''}>
    <td><div className="log-model"><strong>{name}</strong>{provider && <small>{provider}</small>}</div></td>
    <td className="mono">{formatNumber(requests)}</td><td className="mono">{formatNumber(input)}</td><td className="mono">{formatNumber(output)}</td>
    <td className="mono">{formatNumber(total)}</td><td className="mono">{formatNumber(cached)}</td>
    <td><div className="usage-hit"><span data-testid={summary ? 'cache-rate' : undefined}>{rate === null ? '—' : `${rate.toFixed(1)}%`}</span><div className="cache-track" role="img" aria-label={`${name} 缓存命中占比 ${rate === null ? '未知' : `${rate.toFixed(1)}%`}`}><span style={{ width: `${rate ?? 0}%` }}/></div></div></td>
  </tr>;
}

export default function TokenUsageTable({ stats, loading, periodTitle, nodes = [] }) {
  const [page, setPage] = useState(1);
  const models = Object.entries(stats?.byModel || {}).sort((a, b) => (b[1].requests || 0) - (a[1].requests || 0));
  const pages = Math.max(1, Math.ceil(models.length / 20));
  const currentPage = Math.min(page, pages);
  return <section className="cache-section token-usage-section" aria-label="Token 与缓存统计">
    <div className="panel-heading"><div><h2>模型用量明细</h2><p>{periodTitle}</p></div></div>
    <div className="table-shell"><table><caption className="sr-only">同一时间段的输入、输出、总 Token 和缓存读取；缓存命中率为缓存读取除以输入</caption><thead><tr><th>模型 / 供应商</th><th>请求</th><th>输入 Token</th><th>输出 Token</th><th>总 Token</th><th>缓存读取 Token</th><th>缓存命中率</th></tr></thead>
      <tbody>{loading ? <tr><td colSpan="7" className="table-empty">正在加载用量统计…</td></tr> : <>
        <UsageRow name="全部模型" summary requests={stats?.totalRequests} input={stats?.totalPromptTokens} output={stats?.totalCompletionTokens} total={stats?.totalTokens} cached={stats?.totalCachedTokens}/>
        {models.slice((currentPage - 1) * 20, currentPage * 20).map(([id, model]) => <UsageRow key={id} name={model.rawModel || id} provider={model.provider ? providerInfo(model.provider, nodes).name : ''} requests={model.requests} input={model.promptTokens} output={model.completionTokens} total={typeof model.promptTokens === 'number' && typeof model.completionTokens === 'number' ? model.promptTokens + model.completionTokens : null} cached={model.cachedTokens}/>)}
      </>}</tbody></table></div>
    <div className="table-footer"><span>{models.length} 个模型 · {periodTitle}</span>{models.length > 20 && <div className="pagination"><IconButton icon="back" label="上一页用量模型" disabled={currentPage <= 1 || loading} onClick={() => setPage(currentPage - 1)}/><span>{currentPage} / {pages}</span><IconButton icon="arrow" label="下一页用量模型" disabled={currentPage >= pages || loading} onClick={() => setPage(currentPage + 1)}/></div>}</div>
  </section>;
}

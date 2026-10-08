import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import ProviderIcon from '../components/ProviderIcon.jsx';
import { ErrorBlock, PageHeading, formatNumber, formatDate } from '../components/Controls.jsx';
import { useOverviewResource } from '../components/useOverviewResource.js';
import { useOverviewActivity } from '../components/useOverviewActivity.js';
import { normalizeProviders } from '../api/client.js';
import { overviewSummary, requestTrendPoints, recentThroughput } from '../api/overview.js';
import { groupProviders, providerInfo } from '../api/providers.js';
import { usePreferences } from '../store/preferences.js';
import './overview.css';

const RequestChart = lazy(() => import('../components/OverviewTrafficChart.jsx'));
const TokenChart = lazy(() => import('../components/TokenCacheChart.jsx'));
const periods = [['today', '今日'], ['24h', '24 小时'], ['7d', '7 天'], ['30d', '30 天'], ['60d', '60 天']];
const percent = value => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) + '%' : '—';
const compact = value => value === null ? '—' : new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value);
const failed = entry => ['error', 'failed'].includes(entry.status);
const formatRate = value => value === null ? '—' : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(value);

function Freshness({ resource, enabled }) {
  return <span className="last-updated">{resource.offline ? '网络已断开 · 上次数据 · ' : resource.error ? resource.data ? '上次数据 · 已过期 · ' : '获取失败' : !resource.updated ? '等待数据' : !enabled ? '已暂停 · ' : resource.loading ? '后台更新 · ' : '更新于 '}{resource.updated && formatDate(resource.data?.sampledAt || resource.updated)}{resource.error && enabled && !resource.offline && <span> · 自动重试中</span>}</span>;
}

function ResourceError({ resource, label }) {
  return resource.error && <ErrorBlock message={label + '：' + resource.error + (resource.data ? ' · 保留上次数据，可能已过期' : '')} onRetry={resource.refresh}/>;
}

function State({ type = 'unknown', children }) {
  return <span className={'status ' + type}><span className="dot"/>{children}</span>;
}

function Throughput({ resource }) {
  const data = recentThroughput(resource.data);
  return <section className="overview-throughput" aria-label="近期吞吐" aria-busy={resource.loading}>
    <div className="overview-throughput-heading"><h2>近期吞吐</h2><p>最近 5 个完整分钟平均</p></div>
    <dl className="overview-throughput-rates">
      <div><dt className="sr-only">每分钟请求数</dt><dd><strong data-testid="throughput-rpm">{formatRate(data.rpm)}</strong><abbr title="每分钟请求数">RPM</abbr></dd></div>
      <div><dt className="sr-only">每分钟 Token 总量</dt><dd><strong data-testid="throughput-tpm">{formatRate(data.tpm)}</strong><abbr title="每分钟输入与输出 Token 合计，缓存不重复计入">TPM</abbr></dd></div>
    </dl>
    <dl className="overview-throughput-tokens"><div><dt>输入 TPM</dt><dd data-testid="throughput-input-tpm">{formatRate(data.inputTpm)}</dd></div><div><dt>输出 TPM</dt><dd data-testid="throughput-output-tpm">{formatRate(data.outputTpm)}</dd></div></dl>
    <p className="overview-throughput-note">不受统计周期影响 · 按后端已记录调用计数 · 排除当前分钟{resource.error ? ' · 上次数据已过期' : data.rpm === null || data.tpm === null ? resource.loading ? ' · 读取中' : ' · 分钟数据不完整' : ''}</p>
  </section>;
}


function Ranking({ title, items, empty, providerName }) {
  const total = items.reduce((sum, item) => sum + (item.requests || 0), 0);
  return <section className="overview-ranking"><h3>{title}</h3>{items.length ? items.slice(0, 4).map((item, index) => <div className="model-row" key={item.id}><div className="model-label"><span className={'model-dot model-color-' + index}/><strong title={providerName ? providerName(item.id) : item.id}>{providerName ? providerName(item.id) : item.id}</strong><span>{percent(item.share ?? (total ? item.requests / total * 100 : null))}</span></div><div className="model-track"><span className={'model-color-' + index} style={{ width: (item.share ?? (total ? item.requests / total * 100 : 0)) + '%' }}/></div><small>{formatNumber(item.requests)} 次请求</small></div>) : <p className="empty-state">{empty}</p>}</section>;
}

export default function OverviewPage() {
  const autoRefresh = usePreferences(state => state.autoRefreshOverview);
  const setAutoRefresh = usePreferences(state => state.setAutoRefreshOverview);
  const [trend, setTrend] = useState('requests');
  const period = usePreferences(state => state.usagePeriod);
  const setPeriod = usePreferences(state => state.setUsagePeriod);
  const periodTitle = { today: '今日', '24h': '最近 24 小时', '7d': '最近 7 天', '30d': '最近 30 天', '60d': '最近 60 天' }[period] || '最近 24 小时';
  const stats = useOverviewResource('/api/usage/stats?period=' + period, 10000, autoRefresh);
  const chart = useOverviewResource('/api/usage/chart?period=' + period, 30000, autoRefresh);
  const accounts = useOverviewResource('/api/providers', 60000, autoRefresh);
  const directory = useOverviewResource('/api/provider-nodes', 120000, autoRefresh);
  const health = useOverviewResource('/api/health', 30000, autoRefresh);
  const resources = [stats, chart, accounts, directory, health];
  const summary = overviewSummary(stats.data, accounts.data);
  const activity = useOverviewActivity(autoRefresh);
  const activityCurrent = activity.data && (!stats.updated || activity.updated >= stats.updated);
  const active = overviewSummary(activityCurrent ? activity.data : stats.data);
  const activityLabel = !autoRefresh || activity.status === 'paused' ? '已暂停 · 保留上次状态' : activity.status === 'offline' ? '网络已断开 · 保留上次状态' : activity.status === 'live' ? '实时推送 · 不受统计周期影响' : '实时推送未连接 · 10 秒轮询兜底';
  const connections = normalizeProviders(accounts.data || {});
  const nodes = directory.data?.nodes || [];
  const providerName = id => providerInfo(id, nodes, connections.find(connection => connection.provider === id)).name;
  const groups = groupProviders(connections, nodes);
  const models = Object.entries(stats.data?.byModel || {}).map(([id, data]) => ({ id, requests: data.requests })).sort((first, second) => (second.requests || 0) - (first.requests || 0));
  const recent = Array.isArray(stats.data?.recentRequests) ? stats.data.recentRequests : [];
  const failures = recent.filter(failed).slice(0, 4);
  const abnormal = connections.filter(connection => connection.isActive && connection.status === 'error').slice(0, 4);
  const healthOld = health.error || health.updated && Date.now() - health.updated.getTime() > 90000;
  const metrics = [
    { title: '请求总量', value: formatNumber(summary.totalRequests), note: periodTitle + ' · 次模型调用', icon: 'activity', test: 'request-value' },
    { title: 'Token 用量', value: compact(summary.totalTokens), note: '输入 ' + compact(stats.data?.totalPromptTokens ?? null) + ' / 输出 ' + compact(stats.data?.totalCompletionTokens ?? null), icon: 'chart' },
    { title: '累计费用', value: summary.totalCost === null ? '—' : '$' + summary.totalCost.toFixed(2), note: periodTitle + ' · 后端计价 USD', icon: 'coins' },
    { title: '当前在途', value: formatNumber(active.activeCount), note: activityLabel, icon: 'radio', test: 'overview-active' },
    { title: '启用账号', value: formatNumber(summary.enabledAccounts), note: accounts.data ? connections.length + ' 个已配置 · 非实时可用性' : '正在读取连接配置', icon: 'server' },
    { title: '异常账号', value: formatNumber(summary.errorAccounts), note: '已启用账号 · 历史测试 / 错误记录', icon: 'shield' },
  ];
  return <div className="gateway-overview">
    <PageHeading title="概览" subtitle="网关运行、业务流量与连接状态">
      <label className="checkbox-filter"><input type="checkbox" checked={autoRefresh} onChange={event => setAutoRefresh(event.target.checked)} aria-label="自动更新概览"/>自动更新</label>
      <button className="button refresh-button" aria-label="刷新" disabled={resources.some(resource => resource.loading)} onClick={() => resources.forEach(resource => resource.refresh())}><Icon name="refresh"/>{resources.some(resource => resource.loading) ? '更新中…' : '刷新'}</button>
    </PageHeading>
    <section className="overview-health-strip" aria-label="网关状态">
      <span><Icon name="activity"/>网关 <State type={healthOld ? 'error' : health.data ? 'healthy' : 'unknown'}>{healthOld ? '检查失败 / 已过期' : health.data ? autoRefresh ? '可达' : '上次检查可达' : '检查中'}</State></span>
      <span><Icon name="server"/>数据库 <State type={healthOld ? 'unknown' : health.data?.ok === true ? 'healthy' : health.data ? 'error' : 'unknown'}>{healthOld ? '状态未确认' : health.data?.ok === true ? health.data.driver || '健康' : health.data ? '异常' : '检查中'}</State></span>
      <Freshness resource={health} enabled={autoRefresh}/><Link to="/dashboard/chain-health" className="text-button">链路检测<Icon name="arrow"/></Link>
    </section>
    <ResourceError resource={health} label="网关健康"/>
    <div className="section-toolbar"><span className="section-kicker">GATEWAY OVERVIEW</span><div className="period-tabs" aria-label="统计周期">{periods.map(([value, title]) => <button key={value} aria-pressed={period === value} className={period === value ? 'selected' : ''} onClick={() => setPeriod(value)}>{title}</button>)}</div></div>
    <ResourceError resource={stats} label="业务统计"/>
    <ResourceError resource={accounts} label="账号连接"/>
    <ResourceError resource={directory} label="供应商目录"/>
    <section className="metrics-grid overview-metrics" aria-label="网关核心指标" aria-busy={stats.loading}>{metrics.map(metric => <div className="metric" key={metric.title}><div className="metric-label">{metric.title}<Icon name={metric.icon}/></div><div className="metric-value" data-testid={metric.test}>{metric.value}</div><span className="metric-note">{metric.note}</span></div>)}</section>
    <Throughput resource={stats}/>
    <div className="overview-data-toolbar"><Freshness resource={stats} enabled={autoRefresh}/><span className="muted" title="统计 10 秒，图表和健康 30 秒，账号 60 秒，供应商目录 120 秒；请求完成后再计时">统计 10 秒 · 分级更新 · 隐藏页面暂停</span><Link to="/dashboard/usage" className="text-button">详细用量<Icon name="arrow"/></Link></div>
    <div className="overview-traffic-grid">
      <div className="overview-trend"><div className="overview-trend-switch" role="group" aria-label="趋势指标">{[['requests', '请求趋势'], ['tokens', 'Token 趋势']].map(([value, title]) => <button key={value} aria-pressed={trend === value} className={trend === value ? 'selected' : ''} onClick={() => setTrend(value)}>{title}</button>)}</div><ResourceError resource={chart} label="趋势数据"/><Suspense fallback={<div className="empty-state" role="status">正在加载图表…</div>}>{trend === 'requests' ? <RequestChart chart={requestTrendPoints(stats.data)} loading={!stats.data && stats.loading}/> : <TokenChart chart={Array.isArray(chart.data) ? chart.data : []} stats={stats.data} loading={!chart.data && chart.loading} periodTitle={periodTitle}/>}</Suspense></div>
      <div className="overview-panel overview-rankings"><div className="panel-heading"><div><h2>流量分布</h2><p>{periodTitle} · 按请求数量</p></div></div><Ranking title="热门模型" items={models} empty={stats.data ? '暂无模型记录' : '等待统计数据'}/><Ranking title="供应商占比" items={summary.providers} providerName={providerName} empty={stats.data ? '暂无供应商统计' : '等待统计数据'}/></div>
    </div>
    <div className="overview-operations-grid">
      <section className="overview-panel"><div className="panel-heading"><div><h2>正在处理</h2><p>当前在途请求 · 非排队长度</p></div><span className="badge subdued">{formatNumber(active.activeCount)} 次</span></div><p className="overview-footnote overview-activity-status">{activityLabel}{activity.status === 'live' && activity.updated && ' · ' + formatDate(activity.updated)}</p>{active.activeRequests?.length ? <ul className="overview-operation-list">{active.activeRequests.slice(0, 6).map((entry, index) => <li key={entry.model + '-' + entry.provider + '-' + index}><div><strong>{entry.model || '未知模型'}</strong><small>{providerName(entry.provider)} · {entry.account || '账号未提供'}</small></div><span className="badge subdued">{formatNumber(entry.count)} 次</span></li>)}</ul> : <p className="empty-state">{active.activeRequests ? '当前没有在途请求' : '后端未提供当前请求明细'}</p>}</section>
      <section className="overview-panel"><div className="panel-heading"><div><h2>需要关注</h2><p>异常连接与最近请求中的失败记录</p></div><Link className="text-button" to="/dashboard/logs">请求日志<Icon name="arrow"/></Link></div><ul className="overview-operation-list">{stats.data?.errorProvider && <li><div><strong>最近异常供应商</strong><small>{providerName(stats.data.errorProvider)}</small></div><State type="error">异常记录</State></li>}{abnormal.map(connection => <li key={connection.id}><Link to={'/dashboard/providers/' + encodeURIComponent(connection.provider)}><strong>{connection.name}</strong><small>{providerName(connection.provider)} · 历史检测状态</small></Link><State type="error">连接异常</State></li>)}{failures.map((entry, index) => <li key={entry.timestamp + '-' + index}><div><strong>{entry.model || '未知模型'}</strong><small>{providerName(entry.provider)} · {formatDate(entry.timestamp)}</small></div><State type="error">请求失败</State></li>)}</ul>{!abnormal.length && !failures.length && !stats.data?.errorProvider && <p className="empty-state">{accounts.error || stats.error ? '数据不完整，暂无法确认异常' : accounts.data && stats.data ? '当前摘要未发现异常记录' : '等待异常摘要'}</p>}<p className="overview-footnote">历史连接状态不代表实时探测；最近失败记录不构成所选周期的完整错误统计。</p></section>
    </div>
    <section className="connections-section"><div className="panel-heading"><div><h2>供应商连接 <span className="heading-count">{accounts.data ? groups.length : '—'}</span></h2><p>按供应商查看账号启用与历史异常状态</p></div><Link className="text-button" to="/dashboard/providers">全部连接<Icon name="arrow"/></Link></div><div className="connections-grid">{groups.length ? groups.map(group => <Link className="connection-item" key={group.id} to={'/dashboard/providers/' + encodeURIComponent(group.id)}><ProviderIcon provider={group.id}/><div><strong title={group.name}>{group.name}</strong><span className="muted">{group.connections.length} 个账号 · {group.enabled} 个启用 · {group.errors} 个历史异常</span></div><Icon name="arrow"/></Link>) : <p className="empty-state">{accounts.data ? '暂无连接配置' : '等待连接数据'}</p>}</div></section>
    <section className="requests-section"><div className="panel-heading"><div><h2>最近请求</h2><p>网关最新记录 · 不受统计周期筛选影响</p></div><Link className="text-button" to="/dashboard/logs">全部日志<Icon name="arrow"/></Link></div><div className="overview-recent-list">{recent.length ? recent.slice(0, 6).map((entry, index) => <div key={entry.timestamp + '-' + index}><div><strong>{entry.model || '未知模型'}</strong><small>{providerName(entry.provider)}</small></div><State type={failed(entry) ? 'error' : ['ok', 'success'].includes(entry.status) ? 'healthy' : 'unknown'}>{failed(entry) ? '失败' : ['ok', 'success'].includes(entry.status) ? '成功' : entry.status || '未知'}</State><time>{formatDate(entry.timestamp)}</time></div>) : <p className="empty-state">{stats.data ? '暂无请求记录' : '等待请求数据'}</p>}</div></section>
  </div>;
}

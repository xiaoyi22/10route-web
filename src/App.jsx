import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import Icon from './components/Icon.jsx';
import ProviderIcon from './components/ProviderIcon.jsx';
import TokenUsageTable from './components/TokenUsageTable.jsx';
import { requestJson, normalizeProviders, normalizeStats } from './api/client.js';
import { usePreferences } from './store/preferences.js';
import { CopyButton, ErrorBlock, PageHeading, managementEnabled, useResource } from './components/Controls.jsx';
import { groupProviders, providerInfo } from './api/providers.js';
import { ProxyPage } from './pages/ProxyPage.jsx';
import './admin.css';

const TokenCacheChart = lazy(() => import('./components/TokenCacheChart.jsx'));
const OverviewPage = lazy(() => import('./pages/OverviewPage.jsx'));
const SystemPage = lazy(() => import('./pages/SystemPage.jsx'));
const CheckinsPage = lazy(() => import('./pages/CheckinsPage.jsx'));
const ProvidersPage = lazy(() => import('./pages/ProvidersPage.jsx').then(module => ({ default: module.ProvidersPage })));
const EndpointPage = lazy(() => import('./pages/CorePages.jsx').then(module => ({ default: module.EndpointPage })));
const LogsPage = lazy(() => import('./pages/CorePages.jsx').then(module => ({ default: module.LogsPage })));
const ModelsPage = lazy(() => import('./pages/CorePages.jsx').then(module => ({ default: module.ModelsPage })));
const MonitorPage = lazy(() => import('./pages/MonitorPage.jsx').then(module => ({ default: module.MonitorPage })));
const CombosPage = lazy(() => import('./pages/CombosPage.jsx').then(module => ({ default: module.CombosPage })));
const DistributionPage = lazy(() => import('./pages/DistributionPage.jsx').then(module => ({ default: module.DistributionPage })));
const BalancesPage = lazy(() => import('./pages/BalancesPage.jsx').then(module => ({ default: module.BalancesPage })));
const ChainHealthPage = lazy(() => import('./pages/ChainHealthPage.jsx').then(module => ({ default: module.ChainHealthPage })));
const PricingPage = lazy(() => import('./pages/PricingPage.jsx').then(module => ({ default: module.PricingPage })));
const ProxyPoolsPage = lazy(() => import('./pages/ProxyPoolsPage.jsx').then(module => ({ default: module.ProxyPoolsPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx').then(module => ({ default: module.SettingsPage })));
const AuthorizationPage = lazy(() => import('./pages/AuthorizationPage.jsx').then(module => ({ default: module.AuthorizationPage })));
const TranslatorPage = lazy(() => import('./pages/TranslatorPage.jsx').then(module => ({ default: module.TranslatorPage })));

const demo = __DATA_MODE__ === 'demo';
const navItems = [
  { path: '/dashboard/overview', title: '概览', icon: 'grid', group: '工作区' },
  { path: '/dashboard/providers', title: '供应商', icon: 'server', group: '工作区' },
  { path: '/dashboard/authorization', title: '账号授权', icon: 'key', group: '工作区' },
  { path: '/dashboard/endpoint', title: '端点与接入', icon: 'link', group: '工作区' },
  { path: '/dashboard/models', title: '模型', icon: 'grid', group: '工作区' },
  { path: '/dashboard/combos', title: '组合模型', icon: 'radio', group: '工作区' },
  { path: '/dashboard/distribution', title: '下游分发', icon: 'globe', group: '工作区' },
  { path: '/dashboard/proxy', title: '代理控制', icon: 'globe', group: '工作区' },
  { path: '/dashboard/balances', title: '余额与配额', icon: 'coins', group: '监控' },
  { path: '/dashboard/checkins', title: '每日签到', icon: 'check', group: '管理' },
  { path: '/dashboard/usage', title: '用量统计', icon: 'chart', group: '监控' },
  { path: '/dashboard/logs', title: '请求日志', icon: 'logs', group: '监控' },
  { path: '/dashboard/monitor', title: '模型检测', icon: 'activity', group: '监控' },
  { path: '/dashboard/chain-health', title: '链路健康', icon: 'shield', group: '监控' },
  { path: '/dashboard/system', title: '系统信息', icon: 'server', group: '监控' },
  { path: '/dashboard/pricing', title: '模型价格', icon: 'coins', group: '管理' },
  { path: '/dashboard/proxy-pools', title: '代理池', icon: 'server', group: '管理' },
  { path: '/dashboard/settings', title: '系统设置', icon: 'shield', group: '管理' },
  { path: '/dashboard/translator', title: '协议调试', icon: 'activity', group: '管理' },
];
const number = value => value === null || value === undefined ? '—' : new Intl.NumberFormat('zh-CN').format(value);
const compact = value => value === null || value === undefined ? '—' : new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value);

function ThemeControl() {
  const { theme, setTheme } = usePreferences();
  return <label className="theme-control"><Icon name="globe"/><select aria-label="主题模式" value={theme} onChange={event => setTheme(event.target.value)}><option value="system">跟随系统</option><option value="dark">深色</option><option value="light">浅色</option></select></label>;
}

function useTheme() {
  const theme = usePreferences(state => state.theme);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { document.documentElement.dataset.theme = theme === 'system' ? media.matches ? 'dark' : 'light' : theme; };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}

function Login({ auth, onLogin }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const passwordEnabled = !['sso', 'oidc', 'saml'].includes(auth.authMode);
  const ssoEnabled = auth.authMode && auth.authMode !== 'password';
  const saml = auth.ssoType === 'saml' || auth.authMode === 'saml';
  const ssoConfigured = saml ? auth.samlConfigured : auth.oidcConfigured;
  const callbackError = new URLSearchParams(window.location.search).get('error');
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await requestJson('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) });
      setPassword('');
      await onLogin();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <div className="login-page">
    <div className="login-top"><Link to="/dashboard"><Brand /></Link><ThemeControl /></div>
    <main className="login-card">
      <div className="login-symbol"><Icon name="radio"/></div>
      <span className="eyebrow">MY AI GATEWAY</span>
      <h1>连接你的工作空间</h1><p className="subtitle">登录 10router，查看你的网关。</p>
      <div className="mode-banner"><Icon name="shield"/><div><strong>{demo ? '演示工作区' : '网关登录'}</strong><span>{demo ? '演示数据 · 未连接真实网关' : '使用网关管理密码登录'}</span></div></div>
      {passwordEnabled && <form onSubmit={submit}><label htmlFor="login-password">登录密码</label><input id="login-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required autoFocus placeholder="输入管理密码"/>{error && <p className="error-message" role="alert">{error}</p>}<button className="button primary full" disabled={busy} type="submit">{busy ? '正在登录…' : '进入管理端'}<Icon name="arrow"/></button></form>}
      {ssoEnabled && (ssoConfigured ? <a className="button full" href={`/api/auth/${saml ? 'saml' : 'oidc'}/start`}><Icon name="shield"/>{(saml ? auth.samlLoginLabel : auth.oidcLoginLabel) || '使用统一账号登录'}</a> : <p className="error-message" role="alert">统一登录尚未配置完整，请联系网关管理员。</p>)}
      {callbackError && <p className="error-message" role="alert">统一登录未完成：{callbackError}</p>}
      {demo && <p className="demo-password">演示密码 <code>linear-demo</code><button type="button" className="text-button" onClick={() => setPassword('linear-demo')}>填入</button></p>}
    </main><div className="login-footer">10router / 网关控制台</div>
  </div>;
}

function Brand() {
  return <div className="brand"><span className="brand-mark">10</span><span>10router<span className="brand-dot">.</span></span></div>;
}

function SearchDialog({ open, onClose }) {
  const ref = useRef(null);
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (open) { setQuery(''); ref.current.showModal(); inputRef.current.focus(); }
    else if (ref.current.open) ref.current.close();
  }, [open]);
  const matches = navItems.filter(item => item.title.includes(query));
  return <dialog className="search-dialog" ref={ref} onClose={onClose} aria-labelledby="quick-search-title"><div className="dialog-top"><h2 id="quick-search-title">快速跳转</h2><button className="icon-button" onClick={onClose} aria-label="关闭搜索" title="关闭搜索"><Icon name="close"/></button></div><div className="search-input"><Icon name="search"/><input ref={inputRef} aria-label="搜索页面" placeholder="搜索页面…" value={query} onChange={event => setQuery(event.target.value)}/></div><div className="search-results">{matches.map(item => <Link key={item.path} to={item.path} onClick={onClose}><Icon name={item.icon}/><span>{item.title}</span><Icon name="arrow"/></Link>)}{!matches.length && <p className="empty-state">没有匹配的页面</p>}</div></dialog>;
}

function Layout({ auth, onLogout }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();
  const current = navItems.find(item => item.path === location.pathname || location.pathname.startsWith(`${item.path}/`)) || navItems[2];
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  useEffect(() => {
    const handle = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(value => !value); }
      if (event.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, []);
  return <div className="app-shell">
    <a className="skip-link" href="#main">跳到主内容</a>
    {mobileOpen && <button className="nav-backdrop" aria-label="关闭导航" onClick={() => setMobileOpen(false)}/>}
    <aside className={`sidebar ${mobileOpen ? 'is-open' : ''}`}>
      <Brand/>
      <div className="workspace"><span className="workspace-mark"><Icon name="radio"/></span><div><strong>我的网关</strong><small>{demo ? '演示工作区' : '10router 工作区'}</small></div></div>
      <button type="button" className="sidebar-search" onClick={() => setSearchOpen(true)}><Icon name="search"/><span>搜索页面</span><Icon name="arrow"/></button>
      <nav aria-label="主导航">{['工作区', '监控', '管理'].map(group => <div key={group}><p className="nav-group">{group}</p>{navItems.filter(item => item.group === group).map(item => <NavLink key={item.path} to={item.path} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Icon name={item.icon}/><span>{item.title}</span></NavLink>)}</div>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-caption"><Icon name="shield"/><span>{managementEnabled ? '网关管理访问' : '网关只读访问'}</span></div><div className="profile"><span className="avatar">{demo ? 'D' : 'R'}</span><div><strong>{auth.displayName || '管理用户'}</strong><small>{demo ? '演示访客' : '网关管理员'}</small></div><button className="icon-button" aria-label="退出登录" title="退出登录" onClick={onLogout}><Icon name="logout"/></button></div></div>
    </aside>
    <div className="app-content">
      <header className="topbar"><button className="icon-button mobile-menu" aria-label="打开导航" title="打开导航" onClick={() => setMobileOpen(true)}><Icon name="menu"/></button><span className="mobile-brand">10router</span><span>我的网关</span><span className="breadcrumb-slash">/</span><strong>{current.title}</strong><div className="topbar-right"><span className="mode-indicator"><span className="dot"/>{demo ? '演示数据' : managementEnabled ? '网关管理' : '网关只读'}</span><ThemeControl /></div></header>
      <Suspense fallback={<main id="main" className="main-content"><p className="empty-state" role="status" aria-busy="true">正在加载…</p></main>}>
      <main id="main" className="main-content"><Routes><Route index element={<Navigate to="/dashboard/overview" replace/>}/><Route path="overview" element={<OverviewPage/>}/><Route path="system" element={<SystemPage/>}/><Route path="checkins" element={<CheckinsPage/>}/><Route path="usage" element={<UsagePage/>}/><Route path="providers" element={<ProvidersPage/>}/><Route path="providers/:provider" element={<ProvidersPage/>}/><Route path="endpoint" element={<EndpointPage/>}/><Route path="models" element={<ModelsPage/>}/><Route path="logs" element={<LogsPage/>}/><Route path="monitor" element={<MonitorPage/>}/><Route path="combos" element={<CombosPage/>}/><Route path="distribution" element={<DistributionPage/>}/><Route path="balances" element={<BalancesPage/>}/><Route path="proxy" element={<ProxyPage/>}/><Route path="chain-health" element={<ChainHealthPage/>}/><Route path="pricing" element={<PricingPage/>}/><Route path="proxy-pools" element={<ProxyPoolsPage/>}/><Route path="settings" element={<SettingsPage/>}/><Route path="authorization" element={<AuthorizationPage/>}/><Route path="translator" element={<TranslatorPage/>}/><Route path="*" element={<NotFound/>}/></Routes><footer className="page-footer"><span><span className="dot"/>{demo ? '演示工作区 · 未连接真实网关' : `10router · ${managementEnabled ? '管理' : '只读'}工作区`}</span><span>YOUR MODELS. YOUR GATEWAY.</span></footer></main>
    </Suspense>
    </div><SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)}/>
  </div>;
}

function UsagePage({ overview = false }) {
  const directory = useResource('/api/provider-nodes');
  const accounts = useResource('/api/providers');
  const connections = normalizeProviders(accounts.data || {});
  const period = usePreferences(state => state.usagePeriod);
  const setPeriod = usePreferences(state => state.setUsagePeriod);
  const periodTitle = { today: '今日', '24h': '最近 24 小时', '7d': '最近 7 天', '30d': '最近 30 天', '60d': '最近 60 天' }[period] || '最近 24 小时';
  const [loadedPeriod, setLoadedPeriod] = useState(null);
  const [stats, setStats] = useState(null);
  const [chart, setChart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [updated, setUpdated] = useState(null);
  const [stream, setStream] = useState({ state: 'connecting', count: 0, timestamp: null });
  const [autoRefresh, setAutoRefresh] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    Promise.all([
      requestJson(`/api/usage/stats?period=${period}`, { signal: controller.signal }),
      requestJson(`/api/usage/chart?period=${period}`, { signal: controller.signal }),
    ]).then(([data, points]) => {
      if (controller.signal.aborted) return;
      setStats(normalizeStats(data));
      setLoadedPeriod(period);
      setChart(Array.isArray(points) ? points : []);
      setUpdated(new Date());
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [period, revision]);
  useEffect(() => {
    const source = new EventSource('/api/usage/stream');
    let refreshTimer;
    source.onmessage = event => {
      try {
        JSON.parse(event.data);
        setStream(previous => ({ state: 'connected', count: previous.count + 1, timestamp: new Date() }));
        // Stream events may contain all-time totals; reload the selected REST period.
        if (autoRefresh && !refreshTimer) refreshTimer = setTimeout(() => { refreshTimer = null; setRevision(value => value + 1); }, 5000);
      } catch { setStream(previous => ({ ...previous, state: 'invalid' })); }
    };
    source.onerror = () => setStream(previous => ({ ...previous, state: 'reconnecting' }));
    return () => { source.close(); clearTimeout(refreshTimer); };
  }, [autoRefresh]);
  const pendingPeriod = loadedPeriod !== period;
  const currentStats = pendingPeriod ? null : stats;
  const models = Object.entries(currentStats?.byModel || {}).sort((first, second) => (second[1].requests || 0) - (first[1].requests || 0)).slice(0, 4);
  const modelTotal = Object.values(currentStats?.byModel || {}).reduce((sum, value) => sum + (value.requests || 0), 0);
  const metrics = [
    { title: '请求总量', value: number(currentStats?.totalRequests), note: '次模型调用', test: 'request-value', icon: 'activity' },
    { title: '输入 Token', value: compact(currentStats?.totalPromptTokens), note: `${periodTitle} · 输入上下文`, icon: 'input' },
    { title: '输出 Token', value: compact(currentStats?.totalCompletionTokens), note: `${periodTitle} · 模型生成`, icon: 'output' },
    { title: '累计费用', value: currentStats?.totalCost === null || !currentStats ? '—' : `$${currentStats.totalCost.toFixed(2)}`, note: demo ? '演示估算 · USD' : '后端计价 · USD', icon: 'coins' },
  ];
  return <>
    <PageHeading title={overview ? '概览' : '用量统计'} subtitle={overview ? '我的网关 / 请求、模型与连接' : '查看网关的请求记录与模型用量'}>
      <label className="checkbox-filter"><input type="checkbox" checked={autoRefresh} onChange={event => setAutoRefresh(event.target.checked)} aria-label="自动更新用量"/>自动更新</label>
      <span className="last-updated">更新于 {!pendingPeriod && updated?.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) || '—'}</span>
      <button className="button refresh-button" aria-label="刷新" aria-busy={loading} disabled={loading} onClick={() => setRevision(value => value + 1)}><Icon name="refresh"/>{loading ? '更新中…' : '刷新'}</button>
    </PageHeading>
    <div className="section-toolbar"><span className="section-kicker">{overview ? 'GATEWAY OVERVIEW' : 'USAGE ANALYTICS'}</span><div className="period-tabs" aria-label="统计周期">{[['today', '今日'], ['24h', '24 小时'], ['7d', '7 天'], ['30d', '30 天'], ['60d', '60 天']].map(([value, title]) => <button key={value} type="button" aria-pressed={period === value} className={period === value ? 'selected' : ''} onClick={() => setPeriod(value)}>{title}</button>)}</div></div>
    {error && <ErrorBlock message={`${error}${currentStats ? ' · 保留上次数据，可能已过期' : ' · 该周期数据未加载，请重试'}`} onRetry={() => setRevision(value => value + 1)}/>}
    <section className={`metrics-grid ${pendingPeriod ? 'is-loading' : ''}`} aria-label="网关用量" aria-busy={loading}>{metrics.map(metric => <div className="metric" key={metric.title}><div className="metric-label">{metric.title}<Icon name={metric.icon}/></div><div className="metric-value" data-testid={metric.test}>{pendingPeriod ? '—' : metric.value}</div><span className="metric-note">{metric.note}</span></div>)}</section>
    {!(pendingPeriod && error) && <div className="charts-grid">
      <Suspense fallback={<section className="chart-section" aria-busy="true"><div className="traffic-chart empty-state" role="status">正在加载图表…</div></section>}><TokenCacheChart chart={chart} stats={stats} loading={pendingPeriod} periodTitle={periodTitle}/></Suspense>
      <section className="model-section"><div className="panel-heading"><div><h2>模型分布</h2><p>按请求数量</p></div><span className="badge subdued">TOP {models.length}</span></div><div className="model-list">{models.length ? models.map(([name, data], index) => <div key={name} className="model-row"><div className="model-label"><span className={`model-dot model-color-${index}`}/><strong title={data.rawModel || name}>{data.rawModel || name}</strong><span>{modelTotal ? Math.round((data.requests || 0) / modelTotal * 100) : 0}%</span></div><div className="model-track"><span className={`model-color-${index}`} style={{ width: `${modelTotal ? (data.requests || 0) / modelTotal * 100 : 0}%` }}/></div><small>{number(data.requests)} 次请求</small></div>) : <p className="empty-state">{pendingPeriod ? '正在加载模型…' : '暂无模型记录'}</p>}</div></section>
    </div>}
    <div className="stream-strip"><Icon name="radio"/><span className={`status ${stream.state === 'connected' ? 'healthy' : 'unknown'}`}><span className="dot"/>{stream.state === 'connected' ? '实时流已连接' : stream.state === 'invalid' ? '流事件格式异常' : stream.state === 'reconnecting' ? '流连接中断，正在重连' : '正在连接实时流'}</span><span className="stream-timestamp">最后事件 {stream.timestamp?.toLocaleTimeString('zh-CN') || '—'}</span><span className="badge subdued">{number(stream.count)} 个事件</span></div>
    {!(pendingPeriod && error) && <TokenUsageTable stats={currentStats} loading={pendingPeriod} periodTitle={periodTitle} nodes={directory.data?.nodes}/>}
    {overview && <ConnectionOverview revision={revision}/>}
    <section className="requests-section"><div className="panel-heading"><div><h2>最近请求</h2><p>网关最新记录</p></div><Icon name="activity"/></div><div className="table-shell"><table><caption className="sr-only">网关最近请求，不受统计周期筛选影响</caption><thead><tr><th>模型</th><th>供应商</th><th>状态</th><th>时间</th></tr></thead><tbody>{stats?.recentRequests.length ? stats.recentRequests.slice(0, 6).map((entry, index) => <tr key={entry.id || `${entry.timestamp}-${index}`}><td className="request-model">{entry.model || '—'}</td><td className="mono muted">{providerInfo(entry.provider, directory.data?.nodes, connections.find(connection => connection.id === entry.connectionId)).name}</td><td><span className={`status ${['ok', 'success'].includes(entry.status) ? 'healthy' : ['error', 'failed'].includes(entry.status) ? 'error' : 'unknown'}`}><span className="dot"/>{['ok', 'success'].includes(entry.status) ? '成功' : ['error', 'failed'].includes(entry.status) ? '失败' : entry.status || '未知'}</span></td><td className="mono muted">{entry.timestamp ? new Date(entry.timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td></tr>) : <tr><td colSpan="4" className="table-empty">{loading && !stats ? '正在加载请求…' : '暂无请求记录'}</td></tr>}</tbody></table></div></section>
  </>;
}

function ConnectionOverview({ revision }) {
  const [connections, setConnections] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    Promise.all([requestJson('/api/providers', { signal: controller.signal }), requestJson('/api/provider-nodes', { signal: controller.signal })])
      .then(([data, nodeData]) => { if (!controller.signal.aborted) { setConnections(normalizeProviders(data)); setNodes(nodeData.nodes || []); } })
      .catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [revision, retry]);
  const groups = groupProviders(connections || [], nodes);
  const healthy = connections?.filter(connection => connection.status === 'healthy').length;
  return <section className="connections-section"><div className="panel-heading"><div><h2>供应商连接 <span className="heading-count">{connections ? groups.length : '—'}</span></h2><p>{connections ? `${connections.length} 个账号连接 · ${healthy} 个历史测试正常` : '正在读取连接'}</p></div><Link className="text-button" to="/dashboard/providers">全部连接<Icon name="arrow"/></Link></div>
    {error && <ErrorBlock message={`${error}${connections ? ' · 显示上次数据' : ''}`} onRetry={() => setRetry(value => value + 1)}/>}
    <div className="connections-grid">{connections?.length ? groups.map(group => <Link className="connection-item" key={group.id} to={`/dashboard/providers/${encodeURIComponent(group.id)}`}><ProviderIcon provider={group.id}/><div><strong title={group.name}>{group.name}</strong><span className="muted">{group.connections.length} 个账号 · {group.enabled} 个启用 · {group.errors} 个异常</span></div><Icon name="arrow"/></Link>) : <p className="empty-state">{connections ? '暂无连接配置' : error ? '无法读取连接' : '正在加载连接…'}</p>}</div>
  </section>;
}

function NotFound() {
  return <div className="not-found"><h1>页面不存在</h1><p>无法找到这个网关页面。</p><Link className="button" to="/dashboard/overview">返回概览</Link></div>;
}

export default function App() {
  useTheme();
  const [auth, setAuth] = useState(null);
  const [error, setError] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  const checkAuth = useCallback(async () => {
    setError('');
    const status = await requestJson('/api/auth/status');
    setAuth(status);
    return status;
  }, []);
  useEffect(() => {
    let active = true;
    requestJson('/api/auth/status').then(status => { if (active) setAuth(status); }).catch(failure => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [location.pathname]);
  useEffect(() => {
    const expired = () => { setError(''); setAuth(previous => ({ ...previous, authenticated: false, requireLogin: true, bootstrapLocal: false })); };
    window.addEventListener('tenrouter:unauthorized', expired);
    return () => window.removeEventListener('tenrouter:unauthorized', expired);
  }, []);
  async function logout() {
    try { await requestJson('/api/auth/logout', { method: 'POST' }); setAuth(null); navigate('/login'); }
    catch (failure) { setError(failure.message); }
  }
  const accessible = auth && (auth.authenticated || auth.requireLogin === false || auth.bootstrapLocal);
  if (location.pathname === '/callback') return <div className="login-page"><div className="login-card"><Brand/><h1>授权页面已返回</h1><p className="subtitle">复制当前回调地址，返回账号授权窗口粘贴并完成接入。</p><div className="dialog-actions"><CopyButton value={window.location.href} label="复制回调地址"/><a className="button" href="/dashboard/authorization">返回账号授权</a></div></div></div>;
  if (error) return <div className="connection-error"><Brand/><h1>暂时无法连接验证接口</h1><p role="alert">{error}</p><button className="button" onClick={() => { setError(''); checkAuth().catch(failure => setError(failure.message)); }}>重新连接</button></div>;
  if (!auth) return <div className="loading-screen"><Brand/><p>正在连接工作区…</p></div>;
  if (!accessible) return <Login auth={auth} onLogin={async () => { await checkAuth(); if (!location.pathname.startsWith('/dashboard')) navigate('/dashboard/overview'); }}/>;
  return <Routes><Route path="/dashboard/*" element={<Layout auth={auth} onLogout={logout}/>}/><Route path="*" element={<Navigate to="/dashboard/overview" replace/>}/></Routes>;
}

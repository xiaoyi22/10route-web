import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { ErrorBlock, PageHeading, formatDate, formatNumber, managementEnabled, useResource } from '../components/Controls.jsx';
import { requestJson } from '../api/client.js';
import QuotaCard from '../components/QuotaCard.jsx';

const periodNames = { hourly: '每小时', rolling5h: '5 小时', daily: '每日', weekly: '每周', monthly: '每月', total: '总额度' };
const money = value => typeof value?.amount === 'number' && Number.isFinite(value.amount) ? `${formatNumber(value.amount)} ${value.currency || ''}` : '—';
const hasAmount = value => typeof value?.amount === 'number' && Number.isFinite(value.amount);
const stateText = { login_required: '需到供应商网站登录查看', unavailable: '上游暂不提供', error: '查询失败' };
// 只把真正拿到了余额数字的渠道算作“有数据”，空对象和报错都归入无数据分组，避免一排“—”误导。
function channelState(option, channel, failures) {
  if (!option.enabled) return 'disabled';
  if (failures.length) return 'error';
  const connections = channel?.connections || [];
  const funded = connections.some(connection => hasAmount(connection.wallet) || hasAmount(connection.available) || typeof connection.today?.cost === 'number' || (connection.limits || []).some(row => !row.unlimited && typeof (row.limit ?? row.total) === 'number'));
  if (funded) return 'funded';
  if (connections.length) return 'empty';
  return 'unreachable';
}
const stateLabels = { funded: '有余额', error: '查询异常', empty: '上游无数据', unreachable: '上游未返回', disabled: '已关闭' };
function Limits({ rows = [] }) {
  return rows.length ? <div className="table-shell"><table><thead><tr><th>额度窗口</th><th>已用</th><th>剩余</th><th>总额</th><th>重置时间</th></tr></thead><tbody>{rows.map((row, index) => <tr key={index}><td>{periodNames[row.period] || row.name || row.period || '额度'}</td><td>{formatNumber(row.used)} {row.currency || row.unit || ''}</td><td className="value-cache">{row.unlimited ? '不限额' : formatNumber(row.remaining)} {row.currency || row.unit || ''}</td><td>{row.unlimited ? '不限额' : formatNumber(row.limit ?? row.total)}</td><td>{formatDate(row.resetsAt || row.resetAt)}</td></tr>)}</tbody></table></div> : null;
}
// 预算型窗口（如 Codex 5 小时/每周额度，只有百分比，无钱包金额）用于渠道卡的醒目用量条；金额型窗口仍走额度明细折叠。
function UsagePills({ rows = [] }) {
  const entries = rows.map(row => {
    const limit = row.limit ?? row.total;
    if (row.unlimited || typeof limit !== 'number' || !limit) return null;
    const remaining = typeof row.remaining === 'number' ? row.remaining : (typeof row.used === 'number' ? Math.max(limit - row.used, 0) : null);
    if (remaining === null) return null;
    return { name: periodNames[row.period] || row.name || row.period || '额度', percent: Math.min(100, Math.max(0, Math.round(remaining / limit * 100))), resetsAt: row.resetsAt || row.resetAt };
  }).filter(Boolean);
  return entries.length ? <div className="finance-usage">{entries.map((entry, index) => <div className="finance-usage-row" key={index} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={entry.percent} aria-label={`${entry.name}剩余 ${entry.percent}%`}><span className="finance-usage-name">{entry.name}</span><span className="finance-usage-bar"><span className={`finance-usage-fill${entry.percent < 20 ? ' is-low' : ''}`} style={{ width: `${entry.percent}%` }}/></span><span className="finance-usage-value">{entry.percent}%</span>{entry.resetsAt && <span className="finance-usage-reset">{formatDate(entry.resetsAt)} 重置</span>}</div>)}</div> : null;
}
// 卡片主金额：钱包余额或密钥可用额度二选一；第 2 个有钱账号的金额才并列显示，其余归入账户列表，避免一排 $0.00 的零墙。
function heroEntries(channel) {
  if (!channel) return [];
  const entries = [];
  for (const connection of channel.connections || []) {
    const wallet = hasAmount(connection.wallet) ? { kind: 'wallet', account: connection.name, label: '钱包余额', amount: connection.wallet } : null;
    const available = hasAmount(connection.available) && (!wallet || connection.available.amount !== connection.wallet.amount) ? { kind: 'available', account: connection.name, label: '密钥可用额度', amount: connection.available } : null;
    if (wallet) entries.push(wallet);
    if (available) entries.push(available);
  }
  const positive = entries.filter(entry => entry.amount.amount > 0);
  const uniquePositive = [...new Map(positive.map(entry => [`${entry.account}|${entry.amount.amount}|${entry.amount.currency}`, entry])).values()];
  if (uniquePositive.length) return uniquePositive.slice(0, 2);
  return entries.slice(0, 1);
}
// 渠道内金额型额度总数与最佳重置时间，用于折叠行的胶囊摘要。
function limitSummary(channel) {
  let count = 0;
  let resets = [];
  for (const connection of channel?.connections || []) {
    count += (connection.limits || []).length;
    for (const funding of connection.channelFunding || []) count += (funding.windows || []).length;
    if (connection.keyQuota) count += 1;
  }
  for (const subscription of channel?.subscriptions || []) {
    count += (subscription.windows || []).length;
    if (subscription.expiresAt) resets.push(new Date(subscription.expiresAt).getTime());
  }
  resets = resets.filter(Number.isFinite).sort((a, b) => a - b);
  return { count, nextReset: resets.length ? resets[0] : null };
}
export function BalancesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('view') === 'balances' ? 'balances' : 'quotas';
  const [revisions, setRevisions] = useState({ balances: { id: 0, force: false }, quotas: { id: 0, force: false } });
  const suffix = key => revisions[key].id ? `?${revisions[key].force ? 'force=1&' : ''}refresh=${revisions[key].id}` : '';
  const balances = useResource(`/api/channel-balances${suffix('balances')}`);
  const quotas = useResource(`/api/usage/quotas${suffix('quotas')}`);
  const [autoRefresh, setAutoRefresh] = useState(() => {
    try { return localStorage.getItem('balancesAutoRefresh') !== 'false'; }
    catch { return true; }
  });
  const [queries, setQueries] = useState({ quotas: '', balances: '' });
  const query = queries[activeTab];
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    try { localStorage.setItem('balancesAutoRefresh', String(autoRefresh)); } catch {}
  }, [autoRefresh]);
  useEffect(() => {
    if (!autoRefresh || balances.loading || quotas.loading || busy) return;
    let timer;
    function schedule() {
      clearInterval(timer);
      if (document.visibilityState === 'visible') timer = setInterval(() => {
        if (document.visibilityState === 'visible') setRevisions(value => ({ ...value, [activeTab]: { id: value[activeTab].id + 1, force: false } }));
      }, (activeTab === 'quotas' ? 1 : 5) * 60 * 1000);
    }
    schedule();
    document.addEventListener('visibilitychange', schedule);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', schedule); };
  }, [autoRefresh, activeTab, balances.loading, quotas.loading, busy]);
  const options = balances.data?.channelOptions || [];
  const channels = balances.data?.channels || [];
  const matches = (value, filter) => value.toLowerCase().includes(filter.trim().toLowerCase());
  const quotaAccounts = (quotas.data?.connections || []).filter(connection => matches(`${connection.providerName} ${connection.name || ''} ${connection.email || ''}`, queries.quotas));
  const visibleOptions = options.filter(option => matches(`${option.name} ${channels.find(channel => channel.id === option.id)?.connections.map(connection => connection.name).join(' ') || ''}`, queries.balances));
  const channelViews = visibleOptions.map(option => {
    const channel = channels.find(item => item.id === option.id);
    const failures = (balances.data?.errors || []).filter(item => item.channelId === option.id);
    return { option, channel, failures, state: channelState(option, channel, failures) };
  });
  const summary = channelViews.reduce((counts, view) => ({ ...counts, [view.state]: (counts[view.state] || 0) + 1 }), {});
  const stateOrder = ['funded', 'error', 'empty', 'unreachable', 'disabled'];
  const fundedViews = channelViews.filter(view => view.state === 'funded');
  const restViews = channelViews.filter(view => view.state !== 'funded');
  const quotaGroups = new Map();
  for (const connection of quotaAccounts) {
    const key = connection.provider || connection.providerName || 'unknown';
    if (!quotaGroups.has(key)) quotaGroups.set(key, { name: connection.providerName || connection.provider || '未知供应商', accounts: [] });
    quotaGroups.get(key).accounts.push(connection);
  }
  function selectTab(tab) {
    setSearchParams(previous => {
      const next = new URLSearchParams(previous);
      if (tab === 'quotas') next.delete('view');
      else next.set('view', tab);
      return next;
    });
  }
  function moveTab(event) {
    const tabs = ['quotas', 'balances'];
    const index = tabs.indexOf(activeTab);
    const next = event.key === 'ArrowRight' ? tabs[(index + 1) % tabs.length] : event.key === 'ArrowLeft' ? tabs[(index + tabs.length - 1) % tabs.length] : event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : null;
    if (!next) return;
    event.preventDefault();
    selectTab(next);
    event.currentTarget.querySelector(`#finance-tab-${next}`).focus();
  }
  async function toggle(channel) {
    setBusy(channel.id); setError('');
    try { await requestJson('/api/channel-balances', { method: 'PATCH', body: JSON.stringify({ channelId: channel.id, enabled: !channel.enabled }) }); balances.refresh(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(null); }
  }
  return <div className="balances-page"><PageHeading title="余额与配额" subtitle="账号限额与供应商余额，分开查看"><label className="checkbox-filter" title="仅在本页可见时更新当前标签；接口缓存有效时展示缓存数据"><input type="checkbox" aria-label="自动更新余额与配额" checked={autoRefresh} onChange={event => setAutoRefresh(event.target.checked)}/>自动更新 · {activeTab === 'quotas' ? '1' : '5'} 分钟</label><button className="button refresh-button" aria-label="刷新余额与配额" aria-busy={balances.loading || quotas.loading} disabled={balances.loading || quotas.loading} onClick={() => setRevisions(value => ({ balances: { id: value.balances.id + 1, force: true }, quotas: { id: value.quotas.id + 1, force: true } }))}><Icon name="refresh"/>{balances.loading || quotas.loading ? '余额配额更新中' : '刷新余额与配额'}</button></PageHeading>
    <div className="finance-toolbar">
      <div className="finance-tabs" role="tablist" aria-label="余额与配额视图" onKeyDown={moveTab}>
        <button type="button" role="tab" id="finance-tab-quotas" aria-controls="finance-panel-quotas" aria-selected={activeTab === 'quotas'} tabIndex={activeTab === 'quotas' ? 0 : -1} onClick={() => selectTab('quotas')}>账号配额<span aria-hidden="true">{quotas.data?.connections?.length ?? '—'}</span></button>
        <button type="button" role="tab" id="finance-tab-balances" aria-controls="finance-panel-balances" aria-selected={activeTab === 'balances'} tabIndex={activeTab === 'balances' ? 0 : -1} onClick={() => selectTab('balances')}>供应商余额<span aria-hidden="true">{balances.data ? options.length : '—'}</span></button>
      </div>
      <div className="filter-search"><Icon name="search"/><input type="search" aria-label={activeTab === 'quotas' ? '搜索配额账号' : '搜索余额账号'} placeholder={activeTab === 'quotas' ? '搜索供应商、账号或邮箱…' : '搜索供应商或余额账号…'} value={query} onChange={event => setQueries(previous => ({ ...previous, [activeTab]: event.target.value }))}/></div>
    </div>
    <p className="finance-hint">{activeTab === 'quotas' ? '每个账号的配额独立计算，查看剩余额度与重置时间。未提供的数据显示“—”。' : '钱包余额、密钥额度和订阅限额分别展示，不相加。未提供数据的项目显示“—”，不代表余额为零。'}</p>
    <section className="finance-section" role="tabpanel" id="finance-panel-quotas" aria-labelledby="finance-tab-quotas" hidden={activeTab !== 'quotas'} tabIndex={0}>
      {quotas.error && <ErrorBlock message={`账号配额：${quotas.error}`} onRetry={quotas.refresh}/>}
      <div className="panel-heading"><h2>账号配额</h2><span className="muted">{quotas.loading && !quotas.data ? '读取中' : `${quotaAccounts.length} 个账号`}</span></div>{quotas.loading && !quotas.data && <p className="muted">正在读取账号配额…</p>}<div className="quota-groups" aria-busy={quotas.loading}>{[...quotaGroups].map(([key, group]) => <section className="quota-provider-group" key={key} aria-label={`${group.name}配额账号`}><div className="quota-group-heading"><h3>{group.name}</h3><span className="muted">{group.accounts.length} 个账号</span></div><div className="quota-grid">{group.accounts.map(connection => <QuotaCard key={connection.id} connection={connection}/>)}</div></section>)}</div>{(!quotas.loading || quotas.data) && !quotas.error && !quotaAccounts.length && <p className="empty-state">{queries.quotas ? '没有匹配的配额账号。' : '暂无支持配额查询的账号。'}</p>}
    </section>
    <section className="finance-section" role="tabpanel" id="finance-panel-balances" aria-labelledby="finance-tab-balances" hidden={activeTab !== 'balances'} tabIndex={0}>
      {error && <ErrorBlock message={error}/>}{balances.error && <ErrorBlock message={`渠道余额：${balances.error}`} onRetry={balances.refresh}/>}
      <div className="panel-heading"><h2>供应商余额</h2><span className="muted">{balances.loading && !balances.data ? '读取中' : `${visibleOptions.length} 个供应商`}</span></div>{balances.loading && !balances.data && <p className="muted">正在读取余额…</p>}
      {balances.data && visibleOptions.length > 0 && <div className="balance-summary">
        <div className="balance-summary-item is-funded is-primary"><span className="balance-summary-label">有余额供应商</span><strong className="balance-summary-value">{summary.funded || 0}</strong><small className="balance-summary-note">共 {channelViews.length} 个供应商</small></div>
        {stateOrder.filter(state => state !== 'funded' && summary[state]).map(state => <div key={state} className={`balance-summary-item is-${state}`}><span className="balance-summary-label">{stateLabels[state]}</span><strong className="balance-summary-value">{summary[state]}</strong><small className="balance-summary-note">{state === 'disabled' ? '未开启余额查询' : state === 'error' ? '需要复查上游' : state === 'unreachable' ? '接口无返回' : '无可展示数据'}</small></div>)}
      </div>}
      {fundedViews.length > 0 && <section className="finance-group is-funded">
        <h2 className="finance-group-heading">有余额<span className="muted">{fundedViews.length} 个</span></h2>
        <div className="finance-channel-grid">{fundedViews.map(({ option, channel, failures }) => <section className="finance-channel" key={option.id}>
          <div className="finance-channel-head"><div className="finance-channel-title"><span className="finance-state-dot is-funded"/><h3><Link to={`/dashboard/providers/${encodeURIComponent(option.id)}`}>{option.name}</Link></h3><span className="finance-channel-meta">{channel?.connections.length || 0} 个账号</span></div><label className="checkbox-filter"><input type="checkbox" aria-label={`查询余额 ${option.name}`} disabled={!managementEnabled || !!busy} checked={option.enabled} onChange={() => toggle(option)}/>查询余额</label></div>
          {failures.map((item, index) => <ErrorBlock key={index} message={`${item.connectionName}：${item.error}`}/>)}{!channel && !failures.length && <p className="muted">该供应商尚未提供可查询的余额数据。</p>}
          <div className="finance-hero">{heroEntries(channel).map((entry, index) => <div className={`finance-hero-amount${entry.amount.amount === 0 ? ' is-zero' : ''}`} key={index}><span className="finance-hero-label">{entry.label}<span className="finance-hero-account">{entry.account}</span></span><strong>{money(entry.amount)}</strong></div>)}</div>
          {(() => {
            const allLimits = [];
            const usageLimits = [];
            const today = { cost: 0, costSet: false, calls: 0, callsSet: false, tokens: 0, tokensSet: false, currency: '' };
            let checkedAt = null;
            let staleAny = false;
            let cachedAny = false;
            for (const connection of channel?.connections || []) {
              for (const row of connection.limits || []) {
                const limit = row.limit ?? row.total;
                const isUsage = !row.unlimited && typeof limit === 'number' && limit > 0 && (row.unit === '百分比' || row.name?.includes('使用') || row.name?.includes('限额') || !!(row.period && (row.name?.match(/小时|周|月|日/) || periodNames[row.period])));
                (isUsage ? usageLimits : allLimits).push(row);
              }
              for (const funding of connection.channelFunding || []) for (const row of funding.windows || []) allLimits.push({ ...row, name: `${funding.name} · ${periodNames[row.period] || row.name || row.period || '额度'}` });
              if (connection.keyQuota) allLimits.push({ name: '密钥额度', ...connection.keyQuota });
              if (typeof connection.today?.cost === 'number') { today.cost += connection.today.cost; today.costSet = true; today.currency = connection.today.currency || today.currency; }
              if (typeof connection.today?.calls === 'number') { today.calls += connection.today.calls; today.callsSet = true; }
              if (typeof connection.today?.tokens === 'number') { today.tokens += connection.today.tokens; today.tokensSet = true; }
              if (connection.checkedAt && (!checkedAt || new Date(connection.checkedAt) > new Date(checkedAt))) checkedAt = connection.checkedAt;
              staleAny = staleAny || !!connection.stale;
              cachedAny = cachedAny || !!connection.cached;
            }
            for (const subscription of channel?.subscriptions || []) for (const row of subscription.windows || []) allLimits.push({ ...row, name: `${subscription.name || '订阅'} · ${periodNames[row.period] || row.name || row.period || '额度'}` });
            const meta = [];
            if (today.costSet) meta.push(`今日费用 ${formatNumber(today.cost)} ${today.currency}`.trim());
            if (today.callsSet) meta.push(`今日调用 ${formatNumber(today.calls)} 次`);
            if (today.tokensSet) meta.push(`今日 Token ${formatNumber(today.tokens)}`);
            const accountsWithData = (channel?.connections || []).filter(connection => hasAmount(connection.wallet) || hasAmount(connection.available) || typeof connection.today?.cost === 'number' || typeof connection.today?.calls === 'number');
            return <>
              <UsagePills rows={usageLimits}/>
              {meta.length > 0 && <p className="finance-meta">{meta.join(' · ')}{checkedAt ? ` · 更新于 ${formatDate(checkedAt)}${staleAny ? '（上次数据）' : cachedAny ? '（缓存）' : ''}` : ''}</p>}
              {accountsWithData.length > 1 && <div className="finance-accounts">{accountsWithData.map(connection => <div className="finance-account-line" key={connection.id}><span className="finance-account-name">{connection.name}</span><span className="finance-account-amount">{hasAmount(connection.wallet) ? money(connection.wallet) : hasAmount(connection.available) ? `${money(connection.available)}（密钥）` : typeof connection.today?.cost === 'number' ? `今日 ${formatNumber(connection.today.cost)} ${connection.today.currency || ''}` : '—'}</span></div>)}</div>}
              {allLimits.length > 0 && <details className="finance-limits"><summary>额度明细<span>{allLimits.length} 项{limitSummary(channel).nextReset ? ` · ${formatDate(limitSummary(channel).nextReset)} 重置` : ''}</span></summary><Limits rows={allLimits}/></details>}
            </>;
          })()}
        </section>)}</div>
      </section>}
      {restViews.length > 0 && <section className="finance-group is-secondary">
        <h2 className="finance-group-heading">其他供应商<span className="muted">{restViews.length} 个</span></h2>
        <div className="finance-compact-list">{restViews.map(({ option, channel, failures }) => { const rowState = channelState(option, channel, failures); return <section className={`finance-channel is-compact is-${rowState}`} key={option.id}>
          <div className="finance-compact-row"><div className="finance-compact-main"><span className={`finance-state-dot is-${rowState}`}/><h3><Link to={`/dashboard/providers/${encodeURIComponent(option.id)}`}>{option.name}</Link></h3><span className="finance-compact-note">{!option.enabled ? '已关闭' : failures.length ? '查询异常' : !channel ? '该供应商尚未提供可查询的余额数据。' : (channel.connections || []).length ? '上游无数据' : '上游未返回'}</span></div><label className="checkbox-filter"><input type="checkbox" aria-label={`查询余额 ${option.name}`} disabled={!managementEnabled || !!busy} checked={option.enabled} onChange={() => toggle(option)}/>查询余额</label></div>
          {failures.map((item, index) => <div className="finance-compact-detail" key={index}><ErrorBlock message={`${item.connectionName}：${item.error}`}/></div>)}
          {!option.enabled && <p className="finance-compact-hint">余额查询已关闭，打开开关后才会向上游查询。</p>}
          {channel?.subscriptions.map((subscription, index) => <div className="finance-compact-detail" key={subscription.id || index}><h4>{subscription.name || '订阅'} · 到期 {formatDate(subscription.expiresAt)}</h4><Limits rows={subscription.windows}/></div>)}
        </section>; })}</div>
      </section>}
      {(!balances.loading || balances.data) && !balances.error && !visibleOptions.length && <p className="empty-state">{queries.balances ? '没有匹配的余额账号。' : '暂无兼容供应商账号。'}</p>}
    </section>
  </div>;
}

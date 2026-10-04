import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { ErrorBlock, PageHeading, formatDate, formatNumber, managementEnabled, useResource } from '../components/Controls.jsx';
import { requestJson } from '../api/client.js';
import QuotaCard from '../components/QuotaCard.jsx';

const periodNames = { hourly: '每小时', rolling5h: '5 小时', daily: '每日', weekly: '每周', monthly: '每月', total: '总额度' };
const money = value => typeof value?.amount === 'number' && Number.isFinite(value.amount) ? `${formatNumber(value.amount)} ${value.currency || ''}` : '—';
function Limits({ rows = [] }) {
  return rows.length ? <div className="table-shell"><table><thead><tr><th>额度窗口</th><th>已用</th><th>剩余</th><th>总额</th><th>重置时间</th></tr></thead><tbody>{rows.map((row, index) => <tr key={index}><td>{periodNames[row.period] || row.name || row.period || '额度'}</td><td>{formatNumber(row.used)} {row.currency || row.unit || ''}</td><td className="value-cache">{row.unlimited ? '不限额' : formatNumber(row.remaining)} {row.currency || row.unit || ''}</td><td>{row.unlimited ? '不限额' : formatNumber(row.limit ?? row.total)}</td><td>{formatDate(row.resetsAt || row.resetAt)}</td></tr>)}</tbody></table></div> : null;
}
export function BalancesPage() {
  const [revision, setRevision] = useState(0);
  const balances = useResource(`/api/channel-balances${revision ? `?force=1&refresh=${revision}` : ''}`);
  const quotas = useResource(`/api/usage/quotas${revision ? `?force=1&refresh=${revision}` : ''}`);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const options = balances.data?.channelOptions || [];
  const channels = balances.data?.channels || [];
  const matches = value => value.toLowerCase().includes(query.toLowerCase());
  const quotaAccounts = (quotas.data?.connections || []).filter(connection => matches(`${connection.providerName} ${connection.name || ''} ${connection.email || ''}`));
  const quotaGroups = new Map();
  for (const connection of quotaAccounts) {
    const key = connection.provider || connection.providerName || 'unknown';
    if (!quotaGroups.has(key)) quotaGroups.set(key, { name: connection.providerName || connection.provider || '未知供应商', accounts: [] });
    quotaGroups.get(key).accounts.push(connection);
  }
  async function toggle(channel) {
    setBusy(channel.id); setError('');
    try { await requestJson('/api/channel-balances', { method: 'PATCH', body: JSON.stringify({ channelId: channel.id, enabled: !channel.enabled }) }); balances.refresh(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(null); }
  }
  return <><PageHeading title="余额与配额" subtitle="上游钱包 / 密钥额度 / 账号限额"><button className="button" disabled={balances.loading || quotas.loading} onClick={() => setRevision(value => value + 1)}><Icon name="refresh"/>刷新余额与配额</button></PageHeading>
    <p className="inline-note">钱包余额、密钥额度和订阅限额分别展示，不相加。未提供数据的项目显示“—”，不代表余额为零。</p>
    <div className="filter-search"><Icon name="search"/><input aria-label="搜索余额账号" placeholder="搜索供应商或账号…" value={query} onChange={event => setQuery(event.target.value)}/></div>
    {error && <ErrorBlock message={error}/>} {[balances, quotas].map((item, index) => item.error && <ErrorBlock key={index} message={`${index ? '账号配额' : '渠道余额'}：${item.error}`} onRetry={item.refresh}/>)}
    <section className="finance-section"><div className="panel-heading"><h2>账号配额</h2><span className="muted">{quotas.loading ? '读取中' : `${quotaAccounts.length} 个账号`}</span></div>{quotas.loading && <p className="muted">正在读取账号配额…</p>}<div className="quota-groups" aria-busy={quotas.loading}>{[...quotaGroups].map(([key, group]) => <section className="quota-provider-group" key={key} aria-label={`${group.name}配额账号`}><div className="quota-group-heading"><h3>{group.name}</h3><span className="muted">{group.accounts.length} 个账号</span></div><div className="quota-grid">{group.accounts.map(connection => <QuotaCard key={connection.id} connection={connection}/>)}</div></section>)}</div>{!quotas.loading && !quotas.error && !quotaAccounts.length && <p className="empty-state">{query ? '没有匹配的配额账号。' : '暂无支持配额查询的账号。'}</p>}</section>
    <section className="finance-section"><h2>供应商余额</h2>{balances.loading && <p className="muted">正在读取余额…</p>}
      {options.filter(option => matches(`${option.name} ${channels.find(channel => channel.id === option.id)?.connections.map(connection => connection.name).join(' ') || ''}`)).map(option => {
        const channel = channels.find(item => item.id === option.id);
        const failures = (balances.data?.errors || []).filter(item => item.channelId === option.id);
        return <section className="finance-channel" key={option.id}><div className="panel-heading"><h3><Link to={`/dashboard/providers/${encodeURIComponent(option.id)}`}>{option.name}</Link></h3><label className="checkbox-filter"><input type="checkbox" aria-label={`查询余额 ${option.name}`} disabled={!managementEnabled || !!busy} checked={option.enabled} onChange={() => toggle(option)}/>查询余额</label></div>
          {!option.enabled ? <p className="muted">余额查询已关闭</p> : <>{failures.map((item, index) => <ErrorBlock key={index} message={`${item.connectionName}：${item.error}`}/>)}{!channel && !failures.length && <p className="muted">该供应商尚未提供可查询的余额数据。</p>}
          {channel?.connections.map(connection => <div className="finance-account" key={connection.id}><h4>{connection.name}</h4><div className="finance-values"><span>钱包余额<strong>{money(connection.wallet)}</strong></span><span>密钥可用额度<strong>{money(connection.available)}</strong></span><span>今日费用<strong>{typeof connection.today?.cost === 'number' ? `${formatNumber(connection.today.cost)} ${connection.today.currency || ''}` : '—'}</strong></span><span>更新于<strong className="muted">{formatDate(connection.checkedAt)}{connection.stale ? ' · 上次数据' : connection.cached ? ' · 缓存' : ''}</strong></span></div>
            {connection.walletUnavailable && <p className="inline-note">钱包余额需到供应商网站登录查看，接口额度不等于钱包余额。</p>}{connection.error && <ErrorBlock message={connection.error}/>}
            <Limits rows={[...(connection.limits || []), ...(connection.keyQuota ? [{ name: '密钥额度', ...connection.keyQuota }] : [])]}/>
            {(connection.channelFunding || []).map(funding => <div key={funding.id}><h4>{funding.name} · {funding.status === 'available' ? '可用' : '不可用'}</h4><Limits rows={funding.windows}/></div>)}
          </div>)}{channel?.subscriptions.map((subscription, index) => <div key={subscription.id || index}><h4>{subscription.name || '订阅'} · 到期 {formatDate(subscription.expiresAt)}</h4><Limits rows={subscription.windows}/></div>)}</>}
        </section>;
      })}{!balances.loading && !options.length && <p className="empty-state">暂无兼容供应商账号。</p>}
    </section>
  </>;
}

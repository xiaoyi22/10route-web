import { useEffect, useRef, useState } from 'react';
import { ErrorBlock, Modal, formatDate, formatNumber } from './Controls.jsx';
import ProviderIcon from './ProviderIcon.jsx';
import Icon from './Icon.jsx';
import { isSpentPack, quotaGroups, quotaPool, quotaTiming, quotaValues } from './quotaPresentation.js';

const finite = value => typeof value === 'number' && Number.isFinite(value);

function quotaValue(row) {
  const { percent, remaining, unit } = quotaValues(row);
  return row.unlimited ? '不限额' : percent !== null ? `${formatNumber(Math.round(percent * 10) / 10)}%` : finite(remaining) ? `${formatNumber(remaining)} ${unit}`.trim() : '—';
}

function QuotaWindow({ row, label, now }) {
  const { name, percent, tone } = quotaValues(row);
  const value = quotaValue(row);
  const timing = quotaTiming(row, now);
  return <div className={`quota-window ${tone}`}>
    <div className="quota-window-heading"><h4 title={name}>{label || name}</h4><div className="quota-remaining" aria-label={`剩余 ${value}`}><strong>{value}</strong>{timing && <span title={formatDate(row.resetsAt || row.resetAt)}>{timing}</span>}</div></div>
    {!row.unlimited && (percent !== null ? <div className="quota-track" role="progressbar" aria-label={`${name}剩余配额`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }}/></div> : <div className="quota-track unknown" aria-label={`${name}比例未知`}/>)}
  </div>;
}

function QuotaPool({ pool, now }) {
  const tone = pool.percent <= 20 ? 'warning' : 'healthy';
  const filled = Math.min(100, pool.segments.reduce((value, segment) => value + segment.remaining / pool.total * 100, 0));
  const soonest = pool.live.find(row => quotaValues(row).resetAt);
  return <div className={`quota-pool ${tone}`}>
    <p className="quota-pool-label">剩余额度{pool.unit && ` · ${pool.unit}`}</p>
    <div className="quota-pool-amount"><strong>{formatNumber(pool.remaining)}</strong><span>{formatNumber(pool.remaining)} / {formatNumber(pool.total)}</span></div>
    <div className="quota-pool-track" role="progressbar" aria-label="资源包剩余额度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pool.percent}>{pool.segments.map((segment, index) => <span key={index} className="quota-pool-segment" style={{ flexGrow: segment.remaining / pool.total * 100, opacity: Math.max(.45, 1 - index * .04) }} title={`${segment.name} · 剩余 ${formatNumber(segment.remaining)}${segment.row ? ` · ${quotaTiming(segment.row, now)}` : ''}`}/>)}{filled < 100 && <span className="quota-pool-used" style={{ flexGrow: 100 - filled }}/>}</div>
    <div className="quota-pool-meta"><span>{pool.live.length} 个资源包可用</span>{soonest && <span title={formatDate(quotaValues(soonest).resetAt)}>{quotaTiming(soonest, now)}</span>}</div>
  </div>;
}

function QuotaDetails({ connection, pool, onClose }) {
  const [showSpent, setShowSpent] = useState(false);
  const detail = pool?.detail || connection.quotas || [];
  const spent = pool ? detail.filter(row => isSpentPack(row)) : [];
  const rows = showSpent ? detail : detail.filter(row => !spent.includes(row));
  return <Modal title="配额明细" className="quota-details-dialog" onClose={onClose}>
    <div className="quota-details-account"><ProviderIcon provider={connection.provider || connection.providerName}/><div><strong>{connection.name || '未命名账号'}</strong><p>{[connection.providerName, connection.plan, connection.email !== connection.name && connection.email].filter(Boolean).join(' · ')}</p></div><span className="badge subdued">{rows.length} 项</span></div>
    <div className="quota-details-scroll" tabIndex={0} aria-label="全部配额明细"><table className="quota-details-table"><thead><tr><th>额度项目</th><th>剩余</th><th>已用</th><th>总额</th><th>重置 / 到期</th></tr></thead><tbody>{rows.map((row, index) => {
      const { name, total, remaining, tone, unit, percentageOnly, resetAt, status } = quotaValues(row);
      const value = quotaValue(row);
      const expired = row.recurring === false && resetAt && new Date(resetAt).getTime() <= Date.now();
      return <tr key={`${name}-${index}`}><th scope="row"><strong>{name}</strong><span className={`status ${expired ? 'disabled' : tone}`}><span className="dot"/>{expired ? '已到期' : status}</span></th><td data-label="剩余"><strong className={`quota-detail-value ${tone}`}>{value}</strong>{!percentageOnly && finite(remaining) && !row.unlimited && <small>{formatNumber(remaining)} {unit}</small>}</td><td data-label="已用">{percentageOnly ? '—' : `${formatNumber(row.used)} ${unit}`}</td><td data-label="总额">{row.unlimited ? '不限额' : percentageOnly ? '—' : `${formatNumber(total)} ${unit}`}</td><td data-label={row.recurring === false ? '到期' : '重置'}>{resetAt ? <><small>{row.recurring === false ? '到期' : '重置'}</small>{formatDate(resetAt)}</> : '—'}</td></tr>;
    })}</tbody></table></div>
    <div className="quota-details-footer"><span>更新于 {formatDate(connection.checkedAt)}{connection.stale ? ' · 上次数据' : connection.cached ? ' · 缓存' : ''}{spent.length > 0 && <label className="quota-history"><input type="checkbox" checked={showSpent} onChange={event => setShowSpent(event.target.checked)}/>显示已耗尽 / 到期包（{spent.length}）</label>}</span><button className="button" onClick={onClose}>关闭</button></div>
  </Modal>;
}

export default function QuotaCard({ connection }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [now, setNow] = useState(Date.now);
  const detailsButton = useRef(null);
  function closeDetails() {
    setDetailsOpen(false);
    requestAnimationFrame(() => detailsButton.current?.focus());
  }
  const rows = connection.quotas || [];
  useEffect(() => {
    if (!rows.some(row => row.resetAt || row.resetsAt)) return;
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, [connection.quotas]);
  const pool = quotaPool(connection, now);
  const groups = quotaGroups(connection.provider === 'antigravity' ? rows : rows.slice(0, 3));
  const type = connection.isActive === false ? 'disabled' : connection.error || connection.limitReached ? 'error' : rows.length ? 'healthy' : 'unknown';
  const label = connection.isActive === false ? '已停用' : connection.error ? '查询异常' : connection.limitReached ? '已达限额' : rows.length ? '启用' : '未提供额度';
  return <article className="quota-card" aria-label={`${connection.providerName} · ${connection.name || '未命名账号'}`}>
    <div className="quota-card-heading"><ProviderIcon provider={connection.provider || connection.providerName}/><div><span className="quota-provider">{connection.providerName}</span><h3 title={connection.name || '未命名账号'}>{connection.name || '未命名账号'}</h3></div><span className={`status ${type}`}><span className="dot"/>{label}</span></div>
    <p className="quota-plan" title={[connection.plan, connection.email].filter(Boolean).join(' · ')}>{connection.plan && <span>{connection.plan}</span>}{connection.email && connection.email !== connection.name && <span>{connection.email}</span>}</p>
    {connection.error ? <div className="quota-card-message"><ErrorBlock message={connection.error}/></div> : rows.length ? <><div className="quota-windows">{pool ? <QuotaPool pool={pool} now={now}/> : groups.map((group, index) => <div className="quota-family" key={index}>{group.family && <h4 className="quota-family-name">{group.family}</h4>}{group.rows.map(({ row, label }, rowIndex) => <QuotaWindow key={rowIndex} row={row} label={label} now={now}/>)}</div>)}</div><button ref={detailsButton} className="quota-expand" type="button" aria-haspopup="dialog" onClick={() => setDetailsOpen(true)}>{pool ? '逐包明细' : '查看明细'}{(pool?.detail || rows).length > 3 ? ` · ${(pool?.detail || rows).length} 项` : ''}<Icon name="arrow"/></button></> : <p className="quota-no-data">{connection.message || '暂未提供配额数据'}</p>}
    <footer className="quota-card-footer"><span>更新于 {formatDate(connection.checkedAt)}</span>{(connection.stale || connection.cached) && <span>{connection.stale ? '上次数据' : '缓存'}</span>}</footer>
    {detailsOpen && <QuotaDetails connection={connection} pool={pool} onClose={closeDetails}/>}
  </article>;
}

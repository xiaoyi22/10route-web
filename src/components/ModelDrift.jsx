import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import { CopyButton, ErrorBlock, Modal, formatDate, managementEnabled } from './Controls.jsx';
import { requestJson } from '../api/client.js';
import { buildDriftReport, DRIFT, driftLabels, fetchUpstreamSnapshot, isCompatibleNode } from '../api/model-drift.js';

const tabs = [['models', '模型'], ['combos', '组合'], ['keys', '密钥']];
const filters = [['missing', '上游已下架'], ['suspect', '存疑'], ['ok', '上游仍有'], ['unchecked', '未核对']];
const PAGE_SIZE = 15;

function stateOf(model) {
  if (model.state === DRIFT.unavailable || model.state === DRIFT.unsupported) return 'unchecked';
  return model.state;
}

function State({ state }) {
  const tone = state === DRIFT.missing ? 'error' : state === DRIFT.ok ? 'healthy' : 'unknown';
  return <span className={`status ${tone}`}><span className="dot"/>{driftLabels[state]}</span>;
}

// 快照只对「核对当时那份登记表」有意义，登记或账号一变就必须重查，不能拿旧结论下判断。
export function useUpstreamDrift({ connections, nodes, custom, combos, keys, signature = '' }) {
  const [snapshot, setSnapshot] = useState(null);
  const [progress, setProgress] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [at, setAt] = useState(null);
  const [stamp, setStamp] = useState('');
  const running = useRef(false);
  const stale = !!snapshot && stamp !== signature;
  const report = snapshot && !stale ? buildDriftReport({ customModels: custom, nodes, upstream: snapshot, combos, keys }) : null;
  async function refresh() {
    if (running.current) return;
    if (!nodes.some(node => isCompatibleNode(node))) { setError('当前没有兼容节点，无需核对'); return; }
    running.current = true;
    setBusy(true); setError(''); setSnapshot(null);
    try {
      setProgress({ done: 0, total: nodes.filter(node => isCompatibleNode(node)).length });
      const result = await fetchUpstreamSnapshot(connections, nodes, requestJson, value => setProgress(value));
      setSnapshot(result); setStamp(signature); setAt(new Date());
    } catch (failure) { setError(failure.message); }
    finally { running.current = false; setBusy(false); setProgress(null); }
  }
  return { report, snapshot: stale ? null : snapshot, stale, progress, busy, error, at, refresh };
}

function CopyLines({ value, label }) {
  return <div className="drift-copy"><code>{value.join('\n') || '（空）'}</code><CopyButton value={value.join('\n')} label={label}/></div>;
}

function KeyRow({ row }) {
  const [open, setOpen] = useState(false);
  const problems = row.entries.filter(entry => entry.missing.length || entry.deadMembers.length || entry.suspect.length);
  return <li className="drift-key">
    <button type="button" className="drift-key-head" aria-expanded={open} onClick={() => setOpen(!open)}>
      <Icon name="key"/><strong>{row.name}</strong>
      <span className={`status ${row.active ? 'healthy' : 'disabled'}`}><span className="dot"/>{row.active ? '启用' : '停用'}</span>
      <span className="muted">{row.entries.length ? `${row.entries.length} 条白名单` : '未限制模型（等于全部放行）'}</span>
      {problems.length > 0 && <span className="status error"><span className="dot"/>{problems.length} 条需要处理</span>}
    </button>
    {open && (row.entries.length ? <div className="drift-key-body">
      <ul className="drift-entry-list">{row.entries.map(entry => <li key={`${entry.kind}-${entry.text}`}>
        <code>{entry.text}</code>
        <span className="muted">{entry.kind === 'combo' ? 'Combo' : entry.wildcard ? '通配' : '模型'}</span>
        {entry.missing.length > 0 && <span className="error-message">已下架{entry.missing.length > 1 ? `（命中 ${entry.missing.length} 个）` : ''}</span>}
        {entry.suspect.length > 0 && <span className="muted">存疑 {entry.suspect.length} 个</span>}
        {entry.deadMembers.length > 0 && <span className="error-message">组合内含已下架成员 {entry.deadMembers.length} 个</span>}
        {!entry.matches.length && !entry.deadMembers.length && <span className="muted">未匹配到已登记的自定义模型</span>}
      </li>)}</ul>
      {row.drop.length > 0 ? <>
        <p className="inline-note">建议把下列 {row.drop.length} 条精确指向已下架模型的条目移出白名单。通配条目影响面更大，不在此列，请自行判断。</p>
        <CopyLines value={row.suggestedModels} label={`复制 ${row.name} 建议模型白名单`}/>
      </> : <p className="inline-note">没有可以安全摘除的条目。停用账号或恢复上游模型后重新核对。</p>}
      <p className="proxy-note">复制后到<Link to="/dashboard/endpoint">端点与接入</Link>的「编辑权限」里粘贴保存。</p>
    </div> : <p className="inline-note drift-key-body">此密钥没有绑定模型名单，不受模型下架影响。</p>)}
  </li>;
}

export default function ModelDrift({ report, busy, progress, error, at, stale, onRefresh, onClose, snapshot, links }) {
  const [tab, setTab] = useState('models');
  const [filter, setFilter] = useState('missing');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const rows = report ? report.models.filter(model => stateOf(model) === filter && `${model.routeId} ${model.name} ${model.nodeName}`.toLowerCase().includes(query.toLowerCase())) : [];
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const nodeRows = snapshot ? Object.values(snapshot) : [];
  return <Modal title="核对上游模型" className="drift-dialog" busy={busy} onClose={onClose}>
    <div className="drift-content">
      <div className="drift-head">
        <div><p className="inline-note">逐个兼容节点读取上游实时模型列表，与已登记的自定义模型对账。只核对，不改任何配置。</p>
          {at && <p className="muted">上次核对 {formatDate(at)} · {nodeRows.length} 个节点</p>}</div>
        <button type="button" className="button" disabled={busy} onClick={onRefresh}><Icon name="refresh"/>{busy ? '正在核对…' : report ? '重新核对' : '开始核对'}</button>
      </div>
      {error && <ErrorBlock message={error} onRetry={onRefresh}/>}
      {stale && !busy && <div className="drift-warning" role="status"><Icon name="warning"/><div><strong>登记表或账号在核对后发生了变化</strong><p className="proxy-note">旧结果不再可信，请重新核对。</p></div></div>}
      {busy && progress && <p className="inline-note" role="status">正在读取 {progress.node || '上游模型'} …（{progress.done} / {progress.total} 个节点）</p>}
      {!report && !busy && !error && <p className="upstream-empty"><Icon name="server"/><span>点「开始核对」读取上游模型列表。核对会向上游查询一次模型列表，不会发起模型调用。</span></p>}
      {report && <>
        <div className="upstream-counts" role="status"><span>已登记 <strong>{report.summary.registered}</strong></span><span>上游已下架 <strong>{report.summary.missing}</strong></span><span>存疑 <strong>{report.summary.suspect}</strong></span><span>上游仍有 <strong>{report.summary.ok}</strong></span><span>未核对 <strong>{report.summary.unchecked}</strong></span></div>
        {nodeRows.some(node => node.partial) && <div className="drift-warning" role="status"><Icon name="warning"/><div><strong>有节点没拿到完整的上游列表</strong><ul>{nodeRows.filter(node => node.partial).map(node => <li key={node.nodeId}>{node.name}：{node.accounts.length ? node.accounts.filter(account => account.status !== 'ok').map(account => `${account.name} ${account.reason || '未返回'}`).join('；') : '没有可用账号'}</li>)}</ul><p className="proxy-note">这些节点下的模型只标记为「存疑」，不进入下架清单，避免把 Key 失效误判成下架。</p></div></div>}
        <div className="period-tabs" role="tablist" aria-label="核对范围">{tabs.map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} aria-pressed={tab === value} className={tab === value ? 'selected' : ''} onClick={() => { setTab(value); setPage(1); }}>{label}{value === 'combos' && report.summary.combos ? `（${report.summary.combos}）` : ''}{value === 'keys' && report.summary.keys ? `（${report.summary.keys}）` : ''}</button>)}</div>
        {tab === 'models' && <>
          <div className="drift-toolbar"><div className="period-tabs" aria-label="模型状态">{filters.map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} className={filter === value ? 'selected' : ''} onClick={() => { setFilter(value); setPage(1); }}>{label}</button>)}</div>
            <div className="filter-search"><Icon name="search"/><input aria-label="搜索核对结果" placeholder="搜索路由、模型或节点…" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }}/></div></div>
          <div className="table-shell drift-table"><table><caption className="sr-only">上游模型核对结果</caption><thead><tr><th>模型 / 路由</th><th>供应商</th><th>状态</th><th>依据</th></tr></thead><tbody>
            {rows.length ? rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE).map(model => <tr key={model.routeId}>
              <td><div className="model-name"><strong>{model.name}</strong><code>{model.routeId}</code>{!model.enabled && <small className="cell-note">已停用</small>}</div></td>
              <td><span>{model.nodeName}</span><small className="cell-note">{model.enabled ? '已启用' : '已停用'}</small></td>
              <td><State state={model.state}/></td>
              <td><small>{model.state === DRIFT.ok ? model.sample.filter(item => item.includes('已列出')).join('；') || '—' : model.reason}</small></td>
            </tr>) : <tr><td colSpan="4" className="table-empty">{filters.find(([value]) => value === filter)?.[1]}：没有匹配的记录</td></tr>}
          </tbody></table></div>
          {rows.length > PAGE_SIZE && <div className="table-footer"><span>{rows.length} 个模型</span><div className="pagination"><button type="button" className="icon-button" aria-label="上一页" disabled={current <= 1} onClick={() => setPage(current - 1)}><Icon name="back"/></button><span>{current} / {pages}</span><button type="button" className="icon-button" aria-label="下一页" disabled={current >= pages} onClick={() => setPage(current + 1)}><Icon name="arrow"/></button></div></div>}
          <p className="proxy-note">这次只出清单，不自动停用或删除。确认后可在<Link to={links?.models || '/dashboard/models'} onClick={onClose}>模型页</Link>逐个停用，或在本页记下路由 ID 后再处理。</p>
        </>}
        {tab === 'combos' && (report.combos.length ? <ul className="drift-list">{report.combos.map(combo => <li key={combo.id} className={combo.missing.length ? 'drift-item error' : 'drift-item'}>
          <div className="drift-item-head"><Icon name="fork"/><strong>{combo.name}</strong><span className="muted">{combo.members.length} 个成员</span>{combo.missing.length ? <span className="status error"><span className="dot"/>{combo.missing.length} 个成员已下架</span> : combo.suspect.length ? <span className="status unknown"><span className="dot"/>{combo.suspect.length} 个待确认</span> : <span className="status healthy"><span className="dot"/>成员均在上游</span>}</div>
          <ul className="drift-members">{combo.members.map(member => <li key={member.route}><code>{member.route}</code>{member.state === DRIFT.missing ? <span className="error-message">已下架</span> : member.state === DRIFT.suspect ? <span className="muted">待确认</span> : member.state === 'unknown' ? <span className="muted">非自定义模型</span> : null}</li>)}</ul>
          {combo.missing.length > 0 && <p className="inline-note">组合按顺序回退时，已下架成员会先失败一次再切下一个。请在<Link to="/dashboard/combos" onClick={onClose}>组合模型</Link>里移除或替换。</p>}
        </li>)}</ul> : <p className="table-empty">没有包含兼容节点模型的组合。</p>)}
        {tab === 'keys' && (report.keys.some(row => row.entries.length) ? <ul className="drift-list">{report.keys.map(row => <KeyRow key={row.id} row={row}/>)}</ul> : <p className="table-empty">所有密钥都没有绑定模型白名单，不受下架影响。</p>)}
        {tab === 'keys' && <p className="proxy-note">网关匹配规则：模型条目支持 <code>*</code> 通配与去前缀匹配；Combo 条目只做精确匹配。这里给出的建议值只摘除「精确指向已下架模型」的条目。</p>}
      </>}
      <div className="dialog-actions"><span className="muted">{managementEnabled ? '只读核对，不写入配置' : '当前为只读工作区'}</span><button type="button" className="button" onClick={onClose}>关闭</button></div>
    </div>
  </Modal>;
}

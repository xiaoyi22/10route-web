import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import { ErrorBlock, IconButton, Modal, formatDate, managementEnabled, useResource } from './Controls.jsx';
import ProxyOperationResult from './ProxyOperationResult.jsx';
import { requestJson } from '../api/client.js';

function SubscriptionEditor({ airport, importing, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState(airport?.subscription_mode || 'regular');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  async function save(event) {
    event.preventDefault(); setBusy(true); setFeedback(null);
    try {
      const body = airport ? { airport_id: airport.id, url: url.trim() } : { name: name.trim(), group: group.trim() || name.trim(), url: url.trim() };
      if (!importing) body.subscription_mode = mode;
      const result = await requestJson(importing ? '/api/hermes/subscription/update' : airport ? '/api/hermes/subscription/save' : '/api/hermes/airports', { method: 'POST', body: JSON.stringify(body) });
      setUrl(''); onSaved(importing ? `${airport.name}：节点已导入并保存` : airport ? '订阅地址已保存' : '机场已添加，尚未更新节点', result); onClose();
    } catch (failure) { if (importing || mode === 'one_time') setUrl(''); setFeedback({ ...failure.details, error: failure.message }); }
    finally { setBusy(false); }
  }
  return <Modal title={importing ? `重新导入 · ${airport.name}` : airport ? `编辑订阅 · ${airport.name}` : '添加机场'} onClose={onClose} busy={busy}><form className="editor-form" onSubmit={save}>
    {!airport && <><label>机场名称<input value={name} onChange={event => setName(event.target.value)} maxLength={100} required autoFocus/></label><label>代理组名称<input value={group} onChange={event => setGroup(event.target.value)} maxLength={100} placeholder={name || '与机场名称一致'}/></label></>}
    {airport && <dl className="request-details"><div><dt>当前订阅</dt><dd>{airport.masked_url || '—'}</dd></div></dl>}
    {!importing && <label>订阅方式<select value={mode} onChange={event => setMode(event.target.value)}><option value="regular">常规订阅</option><option value="one_time">一次性订阅</option></select></label>}
    {(importing || mode === 'one_time') && <p className="proxy-note">从机场后台获取尚未使用的新链接。导入时读取一次并保存节点，下次重新导入需获取新链接。</p>}
    <label>{importing ? '新订阅地址' : '订阅地址'}<input type="password" autoComplete="new-password" value={url} onChange={event => setUrl(event.target.value)} maxLength={4096} required autoFocus={!!airport}/></label>
    <ProxyOperationResult result={feedback}/>
    <div className="dialog-actions"><button type="button" className="button" disabled={busy} onClick={onClose}>取消</button><button className="button primary" type="submit" disabled={busy || !url.trim() || (!airport && !name.trim())}><Icon name="check"/>{busy ? importing ? '正在导入…' : '正在保存…' : importing ? '导入节点' : '保存'}</button></div>
  </form></Modal>;
}

export default function ProxySubscriptions({ groups, revision, onChanged }) {
  const resource = useResource('/api/hermes/subscription/status');
  const [editor, setEditor] = useState(null);
  const [action, setAction] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const previousRevision = useRef(revision);
  useEffect(() => {
    if (previousRevision.current === revision) return;
    previousRevision.current = revision; resource.refresh();
  }, [revision, resource.refresh]);
  const airports = resource.data?.airports || [];
  const active = groups.find(group => group.name === 'GLOBAL')?.now || '';
  function changed(message, result = {}, removedGroup) { setFeedback({ ...result, message }); onChanged(removedGroup); }
  async function execute() {
    setBusy(true); setFeedback(null);
    const airport = action.airport;
    let failed = false;
    try {
      let result;
      if (action.type === 'update') result = await requestJson('/api/hermes/subscription/update', { method: 'POST', body: JSON.stringify({ airport_id: airport.id }) });
      else if (action.type === 'delete') result = await requestJson(`/api/hermes/airports/${encodeURIComponent(airport.id)}/delete`, { method: 'POST', body: '{}' });
      else result = await requestJson('/api/hermes/proxy/select', { method: 'POST', body: JSON.stringify({ group: 'GLOBAL', name: airport.group || airport.name }) });
      changed(action.type === 'update' ? `${airport.name}：节点已更新并重载` : action.type === 'delete' ? `${airport.name}：已删除` : `${airport.name}：已应用`, result, action.type === 'delete' ? airport.group || airport.name : undefined);
      setAction(null);
    } catch (failure) {
      failed = true; setFeedback({ ...failure.details, error: failure.message }); onChanged();
    } finally { setBusy(false); if (failed) setAction(previous => previous ? { ...previous, failed: true } : null); }
  }
  const titles = { update: '更新订阅节点', apply: '应用机场', delete: '删除机场' };
  return <section className="proxy-section"><div className="panel-heading"><div><h2>机场与订阅</h2><p>配置更新于 {formatDate(resource.data?.config_mtime)}</p></div>{managementEnabled && <button className="button" disabled={busy} onClick={() => { setFeedback(null); setEditor({}); }}><Icon name="plus"/>添加机场</button>}</div>
    {resource.error && <ErrorBlock message={resource.error} onRetry={resource.refresh}/>}
    {!action && <ProxyOperationResult result={feedback}/>}
    <div className="table-shell"><table className="proxy-table" aria-busy={resource.loading}><caption className="sr-only">机场订阅与运行状态</caption><thead><tr><th>机场 / 代理组</th><th>订阅地址</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead><tbody>{airports.map(airport => {
      const group = airport.group || airport.name;
      const ready = groups.some(entry => entry.name === group);
      const oneTime = airport.subscription_mode === 'one_time';
      return <tr key={airport.id}><td className="proxy-chain"><strong>{airport.name}</strong><small className="cell-note">{group}</small></td><td className="proxy-subscription-url"><code>{airport.masked_url || '未配置'}</code>{oneTime && <small className="cell-note">一次性订阅{airport.one_time_consumed ? ' · 链接已使用' : ' · 待导入'}</small>}</td><td><span className={`status ${active === group ? 'healthy' : ready ? 'disabled' : 'unknown'}`}><span className="dot"/>{active === group ? '当前生效' : ready ? '节点已加载' : '待更新节点'}</span></td><td className="muted">{formatDate(airport.updated_at)}</td><td><div className="row-actions">{ready && <Link className="icon-button" title={`查看机场 ${airport.name}`} aria-label={`查看机场 ${airport.name}`} to={`/dashboard/proxy?group=${encodeURIComponent(group)}`}><Icon name="eye"/></Link>}{managementEnabled && <><IconButton icon="edit" label={`编辑订阅 ${airport.name}`} disabled={busy || resource.loading} onClick={() => { setFeedback(null); setEditor(airport); }}/><IconButton icon="refresh" label={`${oneTime ? '重新导入' : '更新节点'} ${airport.name}`} disabled={busy || resource.loading} onClick={() => { setFeedback(null); if (oneTime) setEditor({ ...airport, importing: true }); else setAction({ type: 'update', airport }); }}/><IconButton icon="check" label={`应用机场 ${airport.name}`} disabled={busy || resource.loading || !ready || active === group} onClick={() => { setFeedback(null); setAction({ type: 'apply', airport }); }}/><IconButton icon="trash" label={`删除机场 ${airport.name}`} disabled={busy || resource.loading} onClick={() => { setFeedback(null); setAction({ type: 'delete', airport }); }}/></>}</div></td></tr>;
    })}{!airports.length && <tr><td colSpan="5" className="table-empty">{resource.loading ? '正在读取订阅…' : resource.error ? '订阅读取失败' : '暂无机场订阅'}</td></tr>}</tbody></table></div>
    <div className="table-footer"><span>{airports.length} 个机场</span><span>订阅地址已脱敏</span></div>
    {editor && <SubscriptionEditor airport={editor.id ? editor : null} importing={editor.importing} onClose={() => setEditor(null)} onSaved={changed}/>}
    {action && <Modal title={titles[action.type]} onClose={() => setAction(null)} busy={busy}><dl className="request-details"><div><dt>机场</dt><dd>{action.airport.name}</dd></div><div><dt>代理组</dt><dd>{action.airport.group || action.airport.name}</dd></div></dl>
      <p className="proxy-note">{action.type === 'update' ? '下载订阅并更新该机场节点，校验后重载 Mihomo 配置。' : action.type === 'delete' ? '删除订阅记录、机场组及其独有节点，相关连接可能受到影响。' : '切换 GLOBAL 的机场选择。全局模式使用该选择，规则模式按分流规则处理；独立入口按各自代理组处理。'}</p>
      <ProxyOperationResult result={feedback}/><div className="dialog-actions"><button className="button" disabled={busy} onClick={() => setAction(null)}>{action.failed ? '关闭' : '取消'}</button><button className={`button ${action.type === 'delete' ? 'danger' : 'primary'}`} disabled={busy} onClick={execute}><Icon name={action.type === 'delete' ? 'trash' : 'check'}/>{busy ? '正在处理…' : action.failed ? '重新执行' : '确认操作'}</button></div>
    </Modal>}
  </section>;
}

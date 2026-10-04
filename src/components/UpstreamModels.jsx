import { useEffect, useRef, useState } from 'react';
import { Modal } from './Controls.jsx';
import Icon from './Icon.jsx';
import { requestJson } from '../api/client.js';
import ProviderError from './ProviderError.jsx';

export default function UpstreamModels({ supplier, connections, existing, onClose, onSaved }) {
  const [connectionId, setConnectionId] = useState((connections.find(connection => connection.status === 'healthy') || connections[0])?.id || '');
  const [models, setModels] = useState(null);
  const [selected, setSelected] = useState([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [scope, setScope] = useState('all');
  const [importedIds, setImportedIds] = useState([]);
  const [progress, setProgress] = useState(null);
  const selectAll = useRef(null);
  const registered = new Set([...existing.map(model => model.upstreamId), ...importedIds]);
  const account = connections.find(connection => connection.id === connectionId);
  const accountStatus = { healthy: '历史测试正常', error: '历史测试异常', unknown: '未测试' };
  async function fetchModels() {
    setBusy('fetch'); setError(''); setWarning(''); setModels(null); setSelected([]); setProgress(null);
    try {
      const result = await requestJson(`/api/providers/${encodeURIComponent(connectionId)}/models`, { cache: 'no-store' });
      if (!Array.isArray(result.models)) throw new Error('上游返回的模型列表格式无效');
      const items = result.models.map(item => {
        const id = typeof item === 'string' ? item : item?.id || item?.model || item?.name;
        if (!id || typeof id !== 'string') return null;
        return { id, name: item?.display_name || item?.displayName || item?.name || id };
      }).filter(Boolean);
      setModels([...new Map(items.map(item => [item.id, item])).values()]);
      setWarning(result.warning || '');
    } catch (failure) { setError(failure); }
    finally { setBusy(''); }
  }
  async function importModels() {
    setBusy('import'); setError(''); setProgress({ done: 0, total: selected.length });
    let imported = 0;
    try {
      for (const id of selected) {
        const model = models.find(item => item.id === id);
        await requestJson('/api/models/custom', { method: 'POST', body: JSON.stringify({ providerAlias: supplier.id, id, name: model.name, type: 'llm', enabled: true }) });
        imported++;
        setImportedIds(previous => [...previous, id]);
        setProgress({ done: imported, total: selected.length });
        setSelected(previous => previous.filter(value => value !== id));
      }
    } catch (failure) { setError(failure); }
    finally { if (imported) onSaved(); setBusy(''); }
  }
  const shown = models?.filter(model => `${model.id} ${model.name}`.toLowerCase().includes(query.toLowerCase()) && (scope === 'all' || (scope === 'registered' ? registered.has(model.id) : !registered.has(model.id)))) || [];
  const available = shown.filter(model => !registered.has(model.id));
  const selectedVisible = available.filter(model => selected.includes(model.id)).length;
  useEffect(() => { if (selectAll.current) selectAll.current.indeterminate = selectedVisible > 0 && selectedVisible < available.length; }, [selectedVisible, available.length]);
  const registeredCount = models?.filter(model => registered.has(model.id)).length || 0;
  return <Modal title={`获取上游模型 · ${supplier.name}`} className="upstream-models-dialog" busy={!!busy} onClose={onClose}>
    <div className="upstream-models-content">
      <div className="upstream-account"><label>查询账号<select value={connectionId} disabled={!!busy} onChange={event => { setConnectionId(event.target.value); setModels(null); setSelected([]); setError(''); setWarning(''); setProgress(null); }}>{connections.map(connection => <option key={connection.id} value={connection.id}>{connection.name} · {accountStatus[connection.status] || '未测试'}</option>)}</select></label>
        <button className="button" disabled={!!busy || !connectionId} onClick={fetchModels}><Icon name="refresh"/>{busy === 'fetch' ? '正在获取模型…' : '获取模型列表'}</button>
      </div>
      {error && <ProviderError error={error} authType={account?.authType}/>}{warning && <p className="inline-note" role="status">{warning}</p>}
      {busy === 'fetch' && <p className="upstream-empty" role="status">正在读取 {account?.name} 的模型列表…</p>}
      {models === null && !busy && !error && <div className="upstream-empty"><Icon name="server"/><strong>{account?.name || '暂无查询账号'}</strong><span>{accountStatus[account?.status] || '未测试'}</span></div>}
      {models && <>
        <div className="upstream-counts" role="status"><span>上游模型 <strong>{models.length}</strong></span><span>待导入 <strong>{models.length - registeredCount}</strong></span><span>已登记 <strong>{registeredCount}</strong></span><span>已选择 <strong>{selected.length}</strong></span></div>
        <div className="upstream-filters"><div className="filter-search"><Icon name="search"/><input aria-label="搜索上游模型" placeholder="搜索模型 ID 或名称…" value={query} onChange={event => setQuery(event.target.value)}/></div><select aria-label="登记状态" value={scope} onChange={event => setScope(event.target.value)}><option value="all">全部模型</option><option value="new">待导入</option><option value="registered">已登记</option></select></div>
        <div className="upstream-selection"><label className="checkbox-filter"><input ref={selectAll} type="checkbox" disabled={!!busy || !available.length} checked={!!available.length && selectedVisible === available.length} onChange={event => setSelected(previous => event.target.checked ? [...new Set([...previous, ...available.map(model => model.id)])] : previous.filter(id => !available.some(model => model.id === id)))}/>选择当前结果（{available.length}）</label><span className="muted">显示 {shown.length} 个</span></div>
        <div className="table-shell upstream-model-list"><table><caption className="sr-only">上游模型及登记状态</caption><thead><tr><th>选择</th><th>模型</th><th>登记状态</th></tr></thead><tbody>{shown.map(model => <tr key={model.id} className={selected.includes(model.id) ? 'upstream-selected' : ''}><td><input type="checkbox" aria-label={`导入 ${model.id}`} disabled={!!busy || registered.has(model.id)} checked={selected.includes(model.id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, model.id] : previous.filter(id => id !== model.id))}/></td><td><div className="upstream-model-name"><strong>{model.name}</strong><code>{model.id}</code></div></td><td><span className={`status ${registered.has(model.id) ? 'healthy' : 'unknown'}`}>{registered.has(model.id) ? '已登记' : selected.includes(model.id) ? '已选择' : '待导入'}</span></td></tr>)}{!shown.length && <tr><td colSpan="3" className="table-empty">{models.length ? '没有匹配的模型' : '上游返回了空模型列表'}</td></tr>}</tbody></table></div>
      </>}
      {progress && <p className={busy === 'import' || progress.done !== progress.total ? 'inline-note' : 'success-message'} role="status">{busy === 'import' ? `正在导入 ${progress.done} / ${progress.total} 个模型…` : progress.done === progress.total ? `已导入 ${progress.done} 个模型，已向下游发布。` : `已导入 ${progress.done} / ${progress.total} 个模型，剩余 ${selected.length} 个未导入。`}</p>}
      <div className="dialog-actions"><span className="muted upstream-selected-count">已选择 {selected.length} 个{selected.length > selectedVisible ? ` · 当前结果外 ${selected.length - selectedVisible} 个` : ''}</span><button className="button" disabled={!!busy} onClick={onClose}>{progress?.done ? '完成' : '取消'}</button><button className="button primary" disabled={!!busy || !selected.length} onClick={importModels}><Icon name="download"/>{busy === 'import' ? '正在导入…' : `导入所选模型${selected.length ? `（${selected.length}）` : ''}`}</button></div>
    </div>
  </Modal>;
}

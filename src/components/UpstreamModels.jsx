import { useState } from 'react';
import { ErrorBlock, Modal } from './Controls.jsx';
import { requestJson } from '../api/client.js';

export default function UpstreamModels({ supplier, connections, existing, onClose, onSaved }) {
  const [connectionId, setConnectionId] = useState(connections[0]?.id || '');
  const [models, setModels] = useState(null);
  const [selected, setSelected] = useState([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const registered = new Set(existing.map(model => model.upstreamId));
  async function fetchModels() {
    setBusy(true); setError(''); setWarning(''); setModels(null); setSelected([]);
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
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function importModels() {
    setBusy(true); setError('');
    let imported = 0;
    try {
      for (const id of selected) {
        const model = models.find(item => item.id === id);
        await requestJson('/api/models/custom', { method: 'POST', body: JSON.stringify({ providerAlias: supplier.id, id, name: model.name, type: 'llm', enabled: true }) });
        imported++;
        setSelected(previous => previous.filter(value => value !== id));
      }
      onClose();
    } catch (failure) { setError(`已导入 ${imported} 个模型；${failure.message}`); }
    finally { if (imported) onSaved(); setBusy(false); }
  }
  const shown = models?.filter(model => `${model.id} ${model.name}`.toLowerCase().includes(query.toLowerCase())) || [];
  const available = shown.filter(model => !registered.has(model.id));
  return <Modal title={`获取上游模型 · ${supplier.name}`} busy={busy} onClose={onClose}>
    <div className="editor-form"><label>查询账号<select value={connectionId} disabled={busy} onChange={event => { setConnectionId(event.target.value); setModels(null); setSelected([]); setError(''); setWarning(''); }}>{connections.map(connection => <option key={connection.id} value={connection.id}>{connection.name}</option>)}</select></label>
      <button className="button" disabled={busy || !connectionId} onClick={fetchModels}>{busy ? '正在处理…' : '获取模型列表'}</button>
      {error && <ErrorBlock message={error}/>} {warning && <p className="inline-note" role="status">{warning}</p>}
      {models && <><label>搜索上游模型<input value={query} onChange={event => setQuery(event.target.value)}/></label>
        <label className="checkbox-filter"><input type="checkbox" disabled={busy || !available.length} checked={!!available.length && available.every(model => selected.includes(model.id))} onChange={event => setSelected(previous => event.target.checked ? [...new Set([...previous, ...available.map(model => model.id)])] : previous.filter(id => !available.some(model => model.id === id)))}/>选择当前搜索结果</label>
        <div className="table-shell" style={{ maxHeight: 360, overflowY: 'auto' }}><table><thead><tr><th>导入</th><th>上游模型 ID</th><th>名称</th></tr></thead><tbody>{shown.map(model => <tr key={model.id}><td><input type="checkbox" aria-label={`导入 ${model.id}`} disabled={busy || registered.has(model.id)} checked={selected.includes(model.id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, model.id] : previous.filter(id => id !== model.id))}/>{registered.has(model.id) && <span className="muted">已登记</span>}</td><td className="log-model">{model.id}</td><td>{model.name}</td></tr>)}{!shown.length && <tr><td colSpan="3" className="table-empty">{models.length ? '没有匹配的模型' : '上游返回了空模型列表，可手动添加自定义模型'}</td></tr>}</tbody></table></div>
        <span className="muted">{models.length} 个上游模型 · 已选择 {selected.length} 个</span></>}
      <p className="inline-note">模型列表使用所选账号查询。导入后向下游发布；已登记模型保留原有配置。上游未提供列表时，可手动添加自定义模型。</p>
      <div className="dialog-actions"><button className="button" disabled={busy} onClick={onClose}>取消</button><button className="button primary" disabled={busy || !selected.length} onClick={importModels}>导入所选模型</button></div>
    </div>
  </Modal>;
}

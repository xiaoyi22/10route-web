import { useState } from 'react';
import { ErrorBlock, IconButton, Modal, managementEnabled } from './Controls.jsx';
import Icon from './Icon.jsx';
import { normalizeCapacityEntry, saveCapacityEntry } from '../api/media.js';
import '../pages/media.css';

const capabilities = [['vision', '默认识图模型', 'eye'], ['audioInput', '音频输入兜底', 'audio']];

function AdapterEditor({ capability, title, entry, choices, onClose, onSaved }) {
  const [initial] = useState(() => normalizeCapacityEntry(entry));
  const [draft, setDraft] = useState(initial);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const update = patch => setDraft(previous => ({ ...previous, ...patch }));
  function add() {
    const model = selected.trim();
    if (!model || draft.models.includes(model)) return;
    update({ models: [...draft.models, model] }); setSelected('');
  }
  function move(index, offset) {
    const models = [...draft.models];
    [models[index], models[index + offset]] = [models[index + offset], models[index]];
    update({ models });
  }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { await saveCapacityEntry(capability, draft, initial); onSaved(); onClose(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <Modal title={title} onClose={onClose} busy={busy}><form className="editor-form" onSubmit={save}>
    <fieldset className="plain-fieldset" disabled={busy}>
      <label className="checkbox-filter"><input type="checkbox" checked={draft.enabled} onChange={event => update({ enabled: event.target.checked })}/>启用{title}</label>
      <label>模型池调度<select value={draft.roundRobin ? 'round-robin' : 'fallback'} onChange={event => update({ roundRobin: event.target.value === 'round-robin' })}><option value="fallback">按顺序回退</option><option value="round-robin">轮询</option></select></label>
      <div className="media-model-add"><label>模型路由<input list="capacity-model-options" value={selected} onChange={event => setSelected(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); add(); } }} placeholder="供应商前缀/模型 ID"/></label><IconButton icon="plus" label="添加兜底模型" disabled={!selected.trim() || draft.models.includes(selected.trim())} onClick={add}/></div>
      <datalist id="capacity-model-options">{choices.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}</datalist>
      <ol className="combo-members media-members">{draft.models.map((model, index) => <li key={model}><code>{model}</code><div className="row-actions"><IconButton icon="up" label={`上移 ${model}`} disabled={!index} onClick={() => move(index, -1)}/><IconButton icon="down" label={`下移 ${model}`} disabled={index === draft.models.length - 1} onClick={() => move(index, 1)}/><IconButton icon="trash" label={`移除 ${model}`} onClick={() => update({ models: draft.models.filter(item => item !== model) })}/></div></li>)}</ol>
      {!draft.models.length && <p className="muted">模型池为空 · 启用时沿用后端默认模型</p>}
    </fieldset>
    {error && <ErrorBlock message={error}/>}
    <div className="dialog-actions"><button type="button" className="button" disabled={busy} onClick={onClose}>取消</button><button className="button primary" disabled={busy} type="submit"><Icon name="check"/>{busy ? '正在保存…' : '保存模型池'}</button></div>
  </form></Modal>;
}

export default function CapacityAdapter({ settings, choices, onSaved, disabled }) {
  const [editing, setEditing] = useState(null);
  if (!settings) return <section className="capacity-adapter" aria-label="默认模型"><div className="section-toolbar"><h2>默认模型</h2></div><p className="muted" role="status">默认模型配置尚未读取</p></section>;
  return <section className="capacity-adapter" aria-label="默认模型">
    <div className="section-toolbar"><h2>默认模型</h2></div>
    <div className="capacity-rows">{capabilities.map(([key, title, icon]) => {
      const entry = normalizeCapacityEntry(settings?.capacityAdapter?.[key]);
      return <div className="capacity-row" key={key}><div className="capacity-name"><Icon name={icon}/><strong>{title}</strong><span className={`status ${entry.enabled ? 'healthy' : 'disabled'}`}><span className="dot"/>{entry.enabled ? '已启用' : '已停用'}</span></div><div className="capacity-pool"><span className="muted">{entry.roundRobin ? '轮询' : '按顺序回退'}</span>{entry.models.length ? entry.models.map((model, index) => <code key={model}>{index + 1}. {model}</code>) : <span className="muted">后端默认模型</span>}</div>{managementEnabled && <IconButton icon="edit" label={`编辑${title}`} disabled={disabled || !settings} onClick={() => setEditing({ key, title })}/>}</div>;
    })}</div>
    {editing && <AdapterEditor capability={editing.key} title={editing.title} entry={settings.capacityAdapter?.[editing.key]} choices={choices} onClose={() => setEditing(null)} onSaved={onSaved}/>}
  </section>;
}

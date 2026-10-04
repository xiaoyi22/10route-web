import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { ConfirmDelete, CopyButton, ErrorBlock, IconButton, Modal, PageHeading, managementEnabled, useResource } from '../components/Controls.jsx';
import { requestJson } from '../api/client.js';
import { modelCatalog } from '../api/data.js';

function ComboEditor({ combo, choices, settings, onClose, onSaved }) {
  const [name, setName] = useState(combo?.name || '');
  const [models, setModels] = useState(combo?.models || []);
  const [selected, setSelected] = useState('');
  const [strategy, setStrategy] = useState(settings.comboStrategies?.[combo?.name]?.fallbackStrategy || settings.comboStrategy || 'fallback');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState('');
  const move = (index, offset) => setModels(previous => { const next = [...previous]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; return next; });
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    let persisted = saved;
    try {
      if (!models.length || models.includes(name.trim())) throw new Error('请选择至少一个模型，组合不能包含自身。');
      if (!persisted) {
        persisted = await requestJson(combo?.id ? `/api/combos/${encodeURIComponent(combo.id)}` : '/api/combos', { method: combo?.id ? 'PUT' : 'POST', body: JSON.stringify({ name: name.trim(), models, kind: combo?.kind || null }) });
        setSaved(persisted);
      }
      const latest = await requestJson('/api/settings');
      const strategies = { ...latest.comboStrategies };
      const previous = strategies[combo?.name] || strategies[name.trim()] || {};
      if (combo?.name && combo.name !== name.trim()) delete strategies[combo.name];
      strategies[name.trim()] = { ...previous, fallbackStrategy: strategy };
      await requestJson('/api/settings', { method: 'PATCH', body: JSON.stringify({ comboStrategies: strategies }) });
      onSaved(); onClose();
    } catch (failure) { setError(failure.message); if (persisted) onSaved(); }
    finally { setBusy(false); }
  }
  return <Modal title={combo ? '编辑组合模型' : '创建组合模型'} busy={busy} onClose={onClose}><form className="editor-form" onSubmit={save}>
    <fieldset disabled={busy || !!saved} className="plain-fieldset">
    <label>下游模型名称<input required pattern="[a-zA-Z0-9_.\-]+" value={name} onChange={event => setName(event.target.value)} placeholder="例如 my-assistant"/></label>
    <label>调度方式<select aria-label="调度方式" value={strategy} onChange={event => setStrategy(event.target.value)}><option value="fallback">顺序回退：前一个失败再用下一个</option><option value="round-robin">轮询：轮流选择起始模型</option>{!['fallback', 'round-robin'].includes(strategy) && <option value={strategy}>保留当前策略：{strategy}</option>}</select></label>
    <div className="form-columns"><label>选择成员模型<select aria-label="选择成员模型" value={selected} onChange={event => setSelected(event.target.value)}><option value="">选择模型</option>{choices.filter(model => !models.includes(model.id)).map(model => <option key={model.id} value={model.id}>{model.name} · {model.id}</option>)}</select></label><button className="button" type="button" disabled={!selected} onClick={() => { setModels(previous => [...previous, selected]); setSelected(''); }}>添加成员</button></div>
    <ol className="combo-members">{models.map((model, index) => <li key={model}><code>{model}</code><div className="row-actions"><IconButton icon="back" label={`上移 ${model}`} disabled={!index} onClick={() => move(index, -1)}/><IconButton icon="arrow" label={`下移 ${model}`} disabled={index === models.length - 1} onClick={() => move(index, 1)}/><IconButton icon="trash" label={`移除成员 ${model}`} onClick={() => setModels(previous => previous.filter(item => item !== model))}/></div></li>)}</ol>
    </fieldset>
    <p className="inline-note">下游 /v1/models 会列出此名称。仅包含一个成员时，可作为自定义调用名称使用。</p>
    {saved && !busy && <p role="status">组合名称和成员已保存，调度方式尚未保存。重试将只保存调度方式；关闭窗口不会撤销已保存的更改。</p>}
    {error && <ErrorBlock message={error}/>}<div className="dialog-actions"><button type="button" className="button" disabled={busy} onClick={onClose}>{saved ? '关闭' : '取消'}</button><button type="submit" className="button primary" disabled={busy || !models.length}>{busy ? '正在保存…' : saved ? '重试保存调度方式' : '保存组合模型'}</button></div>
  </form></Modal>;
}

export function CombosPage() {
  const resource = useResource('/api/combos');
  const builtIn = useResource('/api/models');
  const custom = useResource('/api/models/custom');
  const providers = useResource('/api/providers');
  const nodes = useResource('/api/provider-nodes');
  const settings = useResource('/api/settings');
  const [editor, setEditor] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [query, setQuery] = useState('');
  const resources = [resource, builtIn, custom, providers, nodes, settings];
  const refresh = () => resources.forEach(item => item.refresh());
  const ready = resources.every(item => item.data && !item.loading && !item.error);
  const choices = modelCatalog(builtIn.data?.models, custom.data?.models, providers.data?.connections, nodes.data?.nodes).filter(model => model.enabled && model.connected);
  const combos = (resource.data?.combos || []).filter(combo => `${combo.name} ${combo.models.join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  return <><PageHeading title="组合模型" subtitle="自定义下游名称 / 多模型回退"><button className="button" onClick={refresh}>刷新</button>{managementEnabled && <button className="button primary" disabled={!ready} onClick={() => setEditor({})}><Icon name="plus"/>创建组合模型</button>}</PageHeading>
    {resources.map((item, index) => item.error && <ErrorBlock key={index} message={item.error} onRetry={item.refresh}/>)}
    <div className="filter-search"><Icon name="search"/><input aria-label="搜索组合模型" placeholder="搜索名称或成员模型…" value={query} onChange={event => setQuery(event.target.value)}/></div>
    <div className="table-shell"><table><thead><tr><th>下游模型名称</th><th>成员顺序</th><th>调度方式</th><th>操作</th></tr></thead><tbody>{combos.map(combo => <tr key={combo.id}><td><strong>{combo.name}</strong></td><td className="combo-model-list">{combo.models.map((model, index) => <div key={index}>{index + 1}. <code>{model}</code></div>)}</td><td>{({ fallback: '顺序回退', 'round-robin': '轮询', fusion: '融合' })[settings.data?.comboStrategies?.[combo.name]?.fallbackStrategy || settings.data?.comboStrategy || 'fallback'] || '自定义'}</td><td><div className="row-actions"><CopyButton value={combo.name} label={`复制组合 ${combo.name}`}/>{managementEnabled && <><IconButton icon="edit" label={`编辑组合 ${combo.name}`} disabled={!ready} onClick={() => setEditor(combo)}/><IconButton icon="trash" label={`删除组合 ${combo.name}`} onClick={() => setRemoving(combo)}/></>}</div></td></tr>)}{!combos.length && <tr><td colSpan="4" className="table-empty">{resource.loading ? '正在读取…' : '暂无匹配的组合模型'}</td></tr>}</tbody></table></div>
    {editor && <ComboEditor combo={editor.id ? editor : null} choices={choices} settings={settings.data} onClose={() => setEditor(null)} onSaved={refresh}/>}
    {removing && <ConfirmDelete title="删除组合模型" name={removing.name} url={`/api/combos/${encodeURIComponent(removing.id)}`} onClose={() => setRemoving(null)} onDeleted={refresh}/>}
  </>;
}

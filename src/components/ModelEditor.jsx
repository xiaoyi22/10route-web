import { useState } from 'react';
import { ErrorBlock, Modal } from './Controls.jsx';
import { requestJson } from '../api/client.js';

export default function ModelEditor({ model, suppliers, onClose, onSaved }) {
  const [form, setForm] = useState({ provider: model?.provider || suppliers[0]?.id || '', id: model?.upstreamId || '', name: model?.name || '', contextWindow: model?.caps.contextWindow || '', maxOutput: model?.caps.maxOutput || '', vision: model?.caps.vision || false, reasoning: model?.caps.reasoning || false, enabled: model?.enabled !== false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (!model || model.custom) await requestJson('/api/models/custom', { method: 'POST', body: JSON.stringify({ providerAlias: form.provider, id: form.id.trim(), type: model?.type || 'llm', name: form.name.trim() || form.id.trim(), contextWindow: Number(form.contextWindow) || null, maxOutput: Number(form.maxOutput) || null, vision: form.vision, reasoning: form.reasoning, enabled: form.enabled }) });
      if (model) await requestJson('/api/models/caps', { method: 'PUT', body: JSON.stringify({ provider: form.provider, modelId: form.id, contextWindow: Number(form.contextWindow) || null, maxOutput: Number(form.maxOutput) || null }) });
      onSaved(); onClose();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <Modal title={model ? '编辑模型' : '添加自定义模型'} busy={busy} onClose={onClose}><form className="editor-form model-editor" onSubmit={save}>
    <label>模型供应商<select aria-label="模型供应商" required disabled={!!model} value={form.provider} onChange={event => set('provider', event.target.value)}><option value="">选择供应商</option>{model && !suppliers.some(item => item.id === model.provider) && <option value={model.provider}>{model.supplier.name}</option>}{suppliers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>上游模型 ID<input required disabled={!!model} value={form.id} onChange={event => set('id', event.target.value)} placeholder="上游实际支持的模型名称"/></label>
    {(!model || model.custom) && <><label>显示名称<input value={form.name} onChange={event => set('name', event.target.value)} placeholder="留空使用模型 ID"/></label><label className="checkbox-filter"><input type="checkbox" checked={form.enabled} onChange={event => set('enabled', event.target.checked)}/>向下游发布模型</label></>}
    <div className="form-columns"><label>上下文 Token<input type="number" min="1" step="1" value={form.contextWindow} onChange={event => set('contextWindow', event.target.value)} placeholder="使用默认值"/></label><label>最大输出 Token<input type="number" min="1" step="1" value={form.maxOutput} onChange={event => set('maxOutput', event.target.value)} placeholder="使用默认值"/></label></div>
    {(!model || model.custom) && <div className="row-actions"><label className="checkbox-filter"><input type="checkbox" checked={form.vision} onChange={event => set('vision', event.target.checked)}/>视觉</label><label className="checkbox-filter"><input type="checkbox" checked={form.reasoning} onChange={event => set('reasoning', event.target.checked)}/>推理</label></div>}
    <p className="inline-note">已启用模型会出现在下游 /v1/models。上下文设置是网关声明与限制，不能扩大上游模型本身的能力；如需自定义下游调用名称，可创建同名组合模型。</p>
    {error && <ErrorBlock message={error}/>}<div className="dialog-actions"><button className="button" type="button" disabled={busy} onClick={onClose}>取消</button><button className="button primary" type="submit" disabled={busy || !form.provider}>{busy ? '正在保存…' : '保存模型'}</button></div>
  </form></Modal>;
}

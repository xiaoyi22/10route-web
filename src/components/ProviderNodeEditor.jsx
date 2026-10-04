import { useState } from 'react';
import { ErrorBlock, Modal } from './Controls.jsx';
import { requestJson } from '../api/client.js';

export default function ProviderNodeEditor({ node, onClose, onSaved }) {
  const [form, setForm] = useState({ name: node?.name || '', prefix: node?.prefix || '', type: node?.type || 'openai-compatible', apiType: node?.apiType || 'chat', baseUrl: node?.baseUrl || '', apiKey: '', connectionName: '' });
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  async function save(event) {
    event.preventDefault(); setError('');
    let url;
    try { url = new URL(form.baseUrl.trim()); } catch { setError('请输入完整的 HTTP 或 HTTPS 接口地址。'); return; }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) { setError('接口地址不能包含认证信息、查询参数或片段。'); return; }
    const body = { name: form.name.trim(), prefix: form.prefix.trim().toLowerCase(), type: form.type, apiType: form.apiType, baseUrl: url.href.replace(/\/$/, '').replace(/\/(chat\/completions|responses|messages)$/, '') };
    setBusy(true);
    try {
      let saved = node || created;
      if (!saved) { saved = (await requestJson('/api/provider-nodes', { method: 'POST', body: JSON.stringify(body) })).node; setCreated(saved); }
      else if (node) saved = (await requestJson(`/api/provider-nodes/${encodeURIComponent(node.id)}`, { method: 'PUT', body: JSON.stringify(body) })).node;
      if (!node) await requestJson('/api/providers', { method: 'POST', body: JSON.stringify({ provider: saved.id, apiKey: form.apiKey.trim(), name: form.connectionName.trim() || form.name.trim(), priority: 1 }) });
      onSaved(saved.id); onClose();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <Modal title={node ? '编辑供应商' : '添加供应商'} busy={busy} onClose={onClose}><form className="editor-form" onSubmit={save}>
    <fieldset disabled={busy || !!created} className="plain-fieldset">
      <label>协议<select aria-label="供应商协议" value={form.type} disabled={!!node} onChange={event => set('type', event.target.value)}><option value="openai-compatible">OpenAI 兼容</option><option value="anthropic-compatible">Anthropic 兼容</option></select></label>
      {form.type === 'openai-compatible' && <label>OpenAI 接口<select aria-label="OpenAI 接口" value={form.apiType} onChange={event => set('apiType', event.target.value)}><option value="chat">Chat Completions</option><option value="responses">Responses</option></select></label>}
      <label>供应商名称<input required maxLength="100" value={form.name} onChange={event => set('name', event.target.value)}/></label>
      <label>路由前缀<input required pattern="[a-zA-Z0-9_-]+" maxLength="64" value={form.prefix} onChange={event => set('prefix', event.target.value)} placeholder="例如 my-provider"/></label>
      <label>接口地址<input required type="url" value={form.baseUrl} onChange={event => set('baseUrl', event.target.value)} placeholder="https://api.example.com/v1"/></label>
    </fieldset>
    {!node && <><label>账号名称<input value={form.connectionName} onChange={event => set('connectionName', event.target.value)} placeholder="留空使用供应商名称"/></label><label>上游 API Key<input required type="password" autoComplete="new-password" value={form.apiKey} onChange={event => set('apiKey', event.target.value)}/></label></>}
    {created && <p role="status">供应商已创建，正在补充账号；重试不会重复创建供应商。</p>}
    {error && <ErrorBlock message={error}/>}<p className="inline-note">保存后可在模型页登记上游模型，并设置对下游展示的名称和上下文。</p><div className="dialog-actions"><button className="button" type="button" disabled={busy} onClick={onClose}>取消</button><button className="button primary" disabled={busy} type="submit">{busy ? '正在保存…' : '保存供应商'}</button></div>
  </form></Modal>;
}

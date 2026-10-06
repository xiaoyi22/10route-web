import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { CopyButton, ErrorBlock, IconButton, Modal, PageHeading, managementEnabled, useResource } from '../components/Controls.jsx';
import { useGatewayModels } from '../components/useGatewayModels.js';
import { consumeChatResponse, openApiResponse } from '../api/stream-client.js';

const storageKey = '10router.web.chat.sessions.v1';
const fresh = () => ({ id: crypto.randomUUID(), title: '新对话', messages: [], model: '' });
function initialSessions() {
  try { const data = JSON.parse(localStorage.getItem(storageKey)); if (Array.isArray(data) && data.length && data.every(session => session.id && Array.isArray(session.messages))) return data; } catch {}
  return [fresh()];
}

export function ChatPage() {
  const catalog = useGatewayModels();
  const keys = useResource('/api/keys');
  const [sessions, setSessions] = useState(initialSessions);
  const [selected, setSelected] = useState(null);
  const session = sessions.find(item => item.id === selected) || sessions[0];
  const [keyId, setKeyId] = useState('');
  const [draft, setDraft] = useState('');
  const [images, setImages] = useState([]);
  const [system, setSystem] = useState('');
  const [stream, setStream] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [removing, setRemoving] = useState(null);
  const controller = useRef(null);
  const end = useRef(null);
  const file = useRef(null);
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(sessions)); setStorageError(''); } catch { setStorageError('浏览器空间不足，对话尚未保存。请删除不需要的对话或减少图片。'); } }, [sessions]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (busy) end.current?.scrollIntoView({ block: 'nearest' }); }, [busy, session.messages]);
  function update(id, action) { setSessions(previous => previous.map(item => item.id === id ? action(item) : item)); }
  function updateMessage(sessionId, messageId, action) { update(sessionId, current => ({ ...current, messages: current.messages.map(message => message.id === messageId ? action(message) : message) })); }
  function newSession() { const next = fresh(); setSessions(previous => [next, ...previous]); setSelected(next.id); setDraft(''); setImages([]); setError(''); }
  async function attach(event) {
    setError('');
    try {
      const added = await Promise.all([...event.target.files].map(image => {
        if (!image.type.startsWith('image/')) throw new Error('请选择图片文件');
        return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve({ id: crypto.randomUUID(), name: image.name, url: reader.result }); reader.onerror = () => reject(new Error('图片读取失败')); reader.readAsDataURL(image); });
      }));
      setImages(previous => [...previous, ...added]);
    } catch (failure) { setError(failure.message); }
    finally { event.target.value = ''; }
  }
  async function send(event) {
    event.preventDefault();
    const key = keys.data?.keys?.find(item => item.id === keyId && item.isActive !== false);
    if (!key || !session.model || (!draft.trim() && !images.length) || busy) return;
    const sessionId = session.id; const assistantId = crypto.randomUUID();
    const user = { id: crypto.randomUUID(), role: 'user', content: draft.trim(), images, status: 'complete' };
    const messages = [...session.messages.filter(message => message.status === 'complete'), user].map(message => ({ role: message.role, content: message.images?.length ? [{ type: 'text', text: message.content }, ...message.images.map(image => ({ type: 'image_url', image_url: { url: image.url } }))] : message.content }));
    if (system.trim()) messages.unshift({ role: 'system', content: system.trim() });
    update(sessionId, current => ({ ...current, title: current.title === '新对话' ? (user.content || images[0].name).slice(0, 32) : current.title, messages: [...current.messages, user, { id: assistantId, role: 'assistant', content: '', reasoning: '', model: session.model, status: 'streaming' }] }));
    setDraft(''); setImages([]); setBusy(true); setError(''); controller.current = new AbortController();
    const started = performance.now();
    try {
      const response = await openApiResponse('/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${key.key}` }, body: JSON.stringify({ model: session.model, messages, stream, ...(stream ? { stream_options: { include_usage: true } } : {}) }), signal: controller.current.signal });
      await consumeChatResponse(response, chunk => updateMessage(sessionId, assistantId, message => ({ ...message, content: message.content + chunk.text, reasoning: message.reasoning + chunk.reasoning, ...(chunk.usage ? { usage: chunk.usage } : {}), ...(chunk.tools ? { toolCalls: [...message.toolCalls || [], ...chunk.tools] } : {}) })));
      updateMessage(sessionId, assistantId, message => ({ ...message, status: 'complete', durationMs: Math.round(performance.now() - started) }));
    } catch (failure) {
      const stopped = failure.name === 'AbortError';
      updateMessage(sessionId, assistantId, message => ({ ...message, status: stopped ? 'stopped' : 'error', error: stopped ? '已停止生成' : failure.message }));
      if (!stopped) setError(failure.message);
    } finally { setBusy(false); controller.current = null; }
  }
  return <>
    <PageHeading title="在线聊天" subtitle="使用网关已发布的真实模型对话"><button className="button" disabled={busy} onClick={newSession}><Icon name="plus"/>新对话</button></PageHeading>
    {[catalog.error, keys.error, error, storageError].filter(Boolean).map((message, index) => <ErrorBlock key={index} message={message}/>)}
    <div className="chat-workspace"><aside className="chat-sessions" aria-label="对话列表"><p className="admin-eyebrow">本机对话</p>{sessions.map(item => <div className={`chat-session ${item.id === session.id ? 'selected' : ''}`} key={item.id}><button className="chat-session-name" disabled={busy} onClick={() => { setSelected(item.id); setError(''); }}>{item.title}</button><IconButton icon="trash" label={`删除对话 ${item.title}`} disabled={busy} onClick={() => setRemoving(item)}/></div>)}<p className="admin-hint">对话保存在当前浏览器。</p></aside>
      <section className="chat-main"><div className="chat-config"><label>模型<select aria-label="聊天模型" disabled={busy || catalog.loading} value={session.model} onChange={event => update(session.id, current => ({ ...current, model: event.target.value }))}><option value="">选择模型</option>{session.model && !catalog.models.some(model => model.id === session.model) && <option value={session.model}>{session.model}（历史选择）</option>}{catalog.models.map(model => <option key={model.id} value={model.id}>{model.id}</option>)}</select></label><label>调用密钥<select aria-label="聊天调用密钥" disabled={busy} value={keyId} onChange={event => setKeyId(event.target.value)}><option value="">选择已启用密钥</option>{(keys.data?.keys || []).filter(key => key.isActive !== false).map(key => <option key={key.id} value={key.id}>{key.name}</option>)}</select></label><label className="checkbox-filter"><input type="checkbox" disabled={busy} checked={stream} onChange={event => setStream(event.target.checked)}/>流式输出</label></div>
        <details className="chat-system"><summary>系统提示词</summary><textarea aria-label="系统提示词" value={system} disabled={busy} onChange={event => setSystem(event.target.value)} placeholder="可选：设置本次对话的回复风格或任务要求"/></details>
        <div className="chat-messages" aria-label="聊天消息">{!session.messages.length && <div className="chat-welcome"><span className="admin-card-icon"><Icon name="radio"/></span><h2>开始一段对话</h2><p>选择模型和密钥，发送文字或图片。</p></div>}{session.messages.map(message => <article className={`chat-message ${message.role}`} key={message.id} aria-label={message.role === 'user' ? '我的消息' : '模型回复'}><div className="chat-message-heading"><strong>{message.role === 'user' ? '你' : message.model}</strong>{message.role === 'assistant' && <CopyButton value={message.content} label="复制回复"/>}</div>{message.reasoning && <details><summary>思考过程</summary><p className="chat-reasoning">{message.reasoning}</p></details>}<div className="chat-message-text">{message.content || (message.status === 'streaming' ? '正在思考…' : '')}</div>{message.images?.length > 0 && <div className="chat-images">{message.images.map(image => <a href={image.url} target="_blank" rel="noopener noreferrer" key={image.id}><img src={image.url} alt={image.name}/></a>)}</div>}{message.toolCalls?.length > 0 && <details><summary>模型返回的工具调用</summary><pre>{JSON.stringify(message.toolCalls, null, 2)}</pre></details>}{message.error && <p className="error-message">{message.error}</p>}{message.usage && <p className="chat-message-meta">输入 {message.usage.prompt_tokens ?? '—'} · 输出 {message.usage.completion_tokens ?? '—'} Token{message.durationMs ? ` · ${(message.durationMs / 1000).toFixed(1)} 秒` : ''}</p>}</article>)}<div ref={end}/></div>
        <form className="chat-composer" onSubmit={send}>{images.length > 0 && <div className="chat-attachments">{images.map(image => <span key={image.id}>{image.name}<IconButton icon="close" label={`移除图片 ${image.name}`} onClick={() => setImages(previous => previous.filter(item => item.id !== image.id))}/></span>)}</div>}<textarea aria-label="聊天输入" disabled={!managementEnabled || busy} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form.requestSubmit(); } }} placeholder="输入消息，Enter 发送，Shift + Enter 换行"/><div className="chat-composer-actions"><input ref={file} type="file" accept="image/*" multiple hidden onChange={attach}/><button type="button" className="button" disabled={busy || !managementEnabled} onClick={() => file.current.click()}><Icon name="plus"/>图片</button>{busy ? <button className="button" type="button" onClick={() => controller.current?.abort()}>停止生成</button> : <button className="button primary" disabled={!managementEnabled || !session.model || !keyId || (!draft.trim() && !images.length)}><Icon name="arrow"/>发送</button>}</div></form>
      </section>
    </div>
    {removing && <Modal title="删除本机对话" onClose={() => setRemoving(null)}><p className="delete-message">删除“{removing.title}”及其消息？</p><div className="dialog-actions"><button className="button" onClick={() => setRemoving(null)}>取消</button><button className="button danger" onClick={() => { setSessions(previous => { const next = previous.filter(item => item.id !== removing.id); return next.length ? next : [fresh()]; }); setRemoving(null); }}>确认删除</button></div></Modal>}
  </>;
}

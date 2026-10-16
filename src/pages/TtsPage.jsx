import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConfirmDelete, CopyButton, ErrorBlock, IconButton, Modal, PageHeading, managementEnabled, useResource } from '../components/Controls.jsx';
import Icon from '../components/Icon.jsx';
import ProviderIcon from '../components/ProviderIcon.jsx';
import { ProviderEditor } from './ProvidersPage.jsx';
import { requestJson } from '../api/client.js';
import { providerId } from '../api/data.js';
import { isSpeechPublished, normalizeVoices, publishSpeechRoute, speechBlob, ttsCatalog, ttsRoute, ttsVoices } from '../api/media.js';
import './media.css';

function SpeechWorkbench({ provider, connected, keys, distribution, onPublished }) {
  const [model, setModel] = useState(provider.models[0]?.id || '');
  const [voice, setVoice] = useState(provider.defaultVoice || ttsVoices(provider, provider.models[0]?.id)[0]?.id || '');
  const [voices, setVoices] = useState(null);
  const [keyId, setKeyId] = useState(keys[0]?.id || '');
  const [input, setInput] = useState('你好，这是一段语音合成测试。');
  const [language, setLanguage] = useState('');
  const [style, setStyle] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [error, setError] = useState('');
  const [audio, setAudio] = useState(null);
  const [latency, setLatency] = useState(null);
  const [publish, setPublish] = useState(null);
  const pending = useRef(null);
  const voiceRequest = useRef(null);
  useEffect(() => () => { pending.current?.abort(); voiceRequest.current?.abort(); }, []);
  useEffect(() => () => { if (audio) URL.revokeObjectURL(audio.url); }, [audio]);
  const options = voices || ttsVoices(provider, model);
  const route = ttsRoute(provider, model, voice);
  const published = isSpeechPublished(distribution, route, provider);
  const key = keys.find(item => item.id === keyId);
  async function publishModel() {
    setPublish({ busy: true, error: '' });
    try { await publishSpeechRoute(route); onPublished(); setPublish(null); }
    catch (failure) { setPublish({ busy: false, error: failure.message }); }
  }
  async function loadVoices() {
    const controller = new AbortController();
    voiceRequest.current?.abort(); voiceRequest.current = controller;
    setLoadingVoices(true); setError('');
    try {
      const data = await requestJson(provider.voicesUrl, { signal: controller.signal });
      const loaded = normalizeVoices(data);
      setVoices(loaded);
      if (!loaded.length) throw new Error('该供应商未返回可用音色。');
    } catch (failure) { if (!controller.signal.aborted) setError(failure.message); }
    finally { if (!controller.signal.aborted) setLoadingVoices(false); }
  }
  async function synthesize(event) {
    event.preventDefault();
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setError(''); setAudio(null); setLatency(null);
    const started = performance.now();
    try {
      const data = await requestJson('/api/v1/audio/speech?response_format=json', {
        method: 'POST', signal: controller.signal, headers: { Authorization: `Bearer ${key.key}` },
        body: JSON.stringify({ model: route, input: input.trim(), ...(provider.languageHint && language ? { language } : {}), ...(provider.style && style.trim() ? { style: style.trim() } : {}) })
      });
      const blob = speechBlob(data);
      setAudio({ url: URL.createObjectURL(blob), format: data.format || 'mp3', size: blob.size });
      setLatency(Math.round(performance.now() - started));
    } catch (failure) { if (!controller.signal.aborted) setError(failure.message); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <div className="tts-workbench"><h2>语音合成</h2>
    <form onSubmit={synthesize}>
      <fieldset className="plain-fieldset" disabled={busy || !managementEnabled}>
        {provider.models.length > 0 && <label>语音模型<select value={model} onChange={event => { const next = event.target.value; setModel(next); setVoices(null); setVoice(provider.defaultVoice || ttsVoices(provider, next)[0]?.id || ''); }}>{provider.models.map(item => <option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}</select></label>}
        <div className="tts-voice-field"><label>音色 / Voice ID<input required={!provider.models.length} list="tts-voice-options" value={voice} onChange={event => setVoice(event.target.value)} placeholder="供应商默认音色"/></label>{provider.voicesUrl && <IconButton icon="refresh" label="读取音色列表" disabled={loadingVoices || !connected} onClick={loadVoices}/>}</div>
        <datalist id="tts-voice-options">{options.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</datalist>
        {loadingVoices && <p className="muted" role="status">正在读取音色…</p>}
        <label>试听文本<textarea aria-label="试听文本" required maxLength={5000} value={input} onChange={event => setInput(event.target.value)}/></label>
        <div className="form-columns">
          <label>网关调用密钥<select value={keyId} required onChange={event => setKeyId(event.target.value)}><option value="">选择密钥</option>{keys.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          {provider.languageHint && <label>语言<select value={language} onChange={event => setLanguage(event.target.value)}><option value="">自动</option><option value="Chinese">中文</option><option value="English">英语</option></select></label>}
        </div>
        {provider.style && <label>声音风格<textarea aria-label="声音风格" value={style} onChange={event => setStyle(event.target.value)} maxLength={1000}/></label>}
      </fieldset>
      <div className="tts-route"><code>{route}</code><CopyButton value={route} label="复制 TTS 模型路由"/></div>
      {!published && <div className="tts-actions"><span className="status disabled">当前语音路由未发布到下游</span>{managementEnabled && <button type="button" className="button" disabled={busy || (!provider.models.length && !voice.trim())} onClick={() => setPublish({ busy: false, error: '' })}><Icon name="plus"/>发布当前路由</button>}<Link to="/dashboard/distribution">下游分发</Link></div>}
      {error && <ErrorBlock message={error}/>}
      {!keys.length && <p className="muted">未配置网关调用密钥 · <Link to="/dashboard/endpoint">密钥管理</Link></p>}
      <div className="tts-actions"><button type="submit" className="button primary" disabled={busy || !managementEnabled || !connected || !published || !key || !input.trim() || (!provider.models.length && !voice.trim())}><Icon name="play"/>{busy ? '正在合成…' : '生成试听'}</button>{busy && <button type="button" className="button" onClick={() => { pending.current?.abort(); setBusy(false); }}><Icon name="close"/>取消</button>}{latency !== null && <span className="muted" role="status">已生成 · {(latency / 1000).toFixed(2)} 秒 · {audio?.size.toLocaleString()} 字节</span>}</div>
    </form>
    {audio && <div className="tts-player"><audio controls src={audio.url} aria-label="语音试听"/><a className="button" href={audio.url} download={`speech.${audio.format}`}><Icon name="download"/>下载音频</a></div>}
    {publish && <Modal title="发布语音模型" busy={publish.busy} onClose={() => setPublish(null)}><p>将此路由加入下游白名单，保留其他模型及当前分发模式。</p><div className="tts-route"><code>{route}</code></div>{publish.error && <ErrorBlock message={publish.error}/>}<div className="dialog-actions"><button type="button" className="button" disabled={publish.busy} onClick={() => setPublish(null)}>取消</button><button type="button" className="button primary" disabled={publish.busy} onClick={publishModel}><Icon name="check"/>{publish.busy ? '正在发布…' : '确认发布'}</button></div></Modal>}
  </div>;
}

export default function TtsPage() {
  const { provider: selectedId } = useParams();
  const navigate = useNavigate();
  const connections = useResource('/api/providers');
  const keys = useResource(managementEnabled ? '/api/keys' : null);
  const distribution = useResource('/api/models/distribution');
  const [editor, setEditor] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const provider = ttsCatalog.find(item => item.id === selectedId) || (!selectedId ? ttsCatalog.find(item => item.id === 'edge-tts') : null);
  const accounts = (connections.data?.connections || []).filter(connection => provider && providerId(connection.provider) === provider.id);
  const active = accounts.filter(account => account.isActive !== false);
  const connected = !!provider && (provider.noAuth || active.length > 0);
  async function toggle(account) {
    setBusy(account.id); setError('');
    try { await requestJson(`/api/providers/${encodeURIComponent(account.id)}`, { method: 'PUT', body: JSON.stringify({ isActive: account.isActive === false }) }); connections.refresh(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(''); }
  }
  return <><PageHeading title="语音合成" subtitle="TTS 供应商与模型"><button className="button" onClick={() => { connections.refresh(); keys.refresh(); distribution.refresh(); }}><Icon name="refresh"/>刷新</button></PageHeading>
    {connections.error && <ErrorBlock message={connections.error} onRetry={connections.refresh}/>}{keys.error && <ErrorBlock message={keys.error} onRetry={keys.refresh}/>}{distribution.error && <ErrorBlock message={distribution.error} onRetry={distribution.refresh}/>}
    <div className="section-toolbar"><label className="checkbox-filter">语音供应商<select className="tts-provider-select" aria-label="语音供应商" value={provider?.id || ''} onChange={event => navigate(`/dashboard/media-providers/tts/${event.target.value}`)}><option value="" disabled>选择供应商</option>{ttsCatalog.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
    {!provider ? <ErrorBlock message="该语音供应商未登记。"/> : <>
      <div className="tts-provider-status"><ProviderIcon provider={provider.id}/><strong>{provider.name}</strong><span className={`status ${connected ? 'healthy' : 'disabled'}`}><span className="dot"/>{provider.noAuth ? '无需上游密钥' : connections.loading ? '正在读取账号' : active.length ? `${active.length} 个已启用账号` : '尚无已启用账号'}</span></div>
      <div className="tts-layout">
        {!connections.loading && !connections.error && distribution.data && (!managementEnabled || keys.data) ? <SpeechWorkbench key={provider.id} provider={provider} connected={connected} keys={(keys.data?.keys || []).filter(item => item.isActive !== false)} distribution={distribution.data} onPublished={distribution.refresh}/> : <p className="muted" role="status">{connections.error || keys.error || distribution.error ? '试听配置未完整读取' : '正在读取试听配置…'}</p>}
        <section className="tts-connections" aria-label="语音供应商账号"><h2>供应商账号</h2>{error && <ErrorBlock message={error}/>}
          {provider.noAuth ? <p className="muted">无需配置上游 API Key</p> : <>
            {accounts.map(account => <div className="tts-connection" key={account.id}><div><strong>{account.name}</strong><small>{account.isActive === false ? '已停用' : '已启用'} · 优先级 {account.priority || 1}</small>{account.lastError && <span className="status error">连接异常</span>}</div><div className="row-actions">{managementEnabled && <><IconButton icon="edit" label={`编辑语音账号 ${account.name}`} onClick={() => setEditor(account)}/><label className="checkbox-filter"><input type="checkbox" aria-label={`启用语音账号 ${account.name}`} checked={account.isActive !== false} disabled={!!busy} onChange={() => toggle(account)}/></label><IconButton icon="trash" label={`删除语音账号 ${account.name}`} onClick={() => setRemoving(account)}/></>}</div></div>)}
            {!accounts.length && !connections.loading && <p className="muted">暂无账号</p>}
            {managementEnabled && <button type="button" className="button" disabled={connections.loading || !!connections.error} onClick={() => setEditor({})}><Icon name="plus"/>添加语音账号</button>}
          </>}
        </section>
      </div>
    </>}
    {editor && <ProviderEditor connection={editor.id ? editor : null} initialProvider={provider.id} providerOptions={[[provider.id, provider.name]]} includeCustomProviders={false} onClose={() => setEditor(null)} onSaved={connections.refresh}/>}
    {removing && <ConfirmDelete title="删除语音账号" name={removing.name} url={`/api/providers/${encodeURIComponent(removing.id)}`} onClose={() => setRemoving(null)} onDeleted={connections.refresh}/>}
  </>;
}

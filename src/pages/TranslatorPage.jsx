import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { CopyButton, ErrorBlock, PageHeading, managementEnabled } from '../components/Controls.jsx';
import { useGatewayModels } from '../components/useGatewayModels.js';
import { requestJson } from '../api/client.js';
import { openApiResponse } from '../api/stream-client.js';

const files = [['1_req_client.json', '客户端请求'], ['2_req_source.json', '识别后的请求'], ['3_req_openai.json', 'OpenAI 中间格式'], ['4_req_target.json', '上游请求'], ['5_res_provider.txt', '上游原始响应'], ['6_res_openai.txt', 'OpenAI 中间响应'], ['7_res_client.txt', '客户端流式响应'], ['7_res_client.json', '客户端 JSON 响应']];
function redact(value, key = '') {
  if (/authorization|cookie|token|secret|password|api.?key/i.test(key)) return '[已隐藏]';
  if (Array.isArray(value)) return value.map(item => redact(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redact(item, name)]));
  if (typeof value === 'string' && /^https?:\/\//.test(value)) {
    try { const url = new URL(value); url.username = ''; url.password = ''; for (const name of url.searchParams.keys()) if (/key|token|secret|password/i.test(name)) url.searchParams.set(name, '[已隐藏]'); return url.href; } catch {}
  }
  return value;
}

export function TranslatorPage() {
  const catalog = useGatewayModels();
  const [model, setModel] = useState('');
  const [draft, setDraft] = useState('');
  const [file, setFile] = useState(files[0][0]);
  const [stages, setStages] = useState(null);
  const [view, setView] = useState('target');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const target = useRef(null);
  const controller = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);
  function changeDraft(value) { setDraft(value); setStages(null); target.current = null; setMessage(''); }
  function body() {
    const parsed = JSON.parse(draft);
    const result = parsed.body || parsed;
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('请求必须是 JSON 对象');
    if (model) result.model = model;
    if (!result.model) throw new Error('请选择模型或在请求中填写模型 ID');
    return result;
  }
  async function convert() {
    setBusy('convert'); setError(''); setMessage(''); setOutput(''); setStages(null); target.current = null;
    try {
      const input = body();
      const detected = await requestJson('/api/translator/translate', { method: 'POST', body: JSON.stringify({ step: 1, body: input }) });
      if (!detected.success) throw new Error(detected.error || '协议识别失败');
      const intermediate = await requestJson('/api/translator/translate', { method: 'POST', body: JSON.stringify({ step: 2, body: input }) });
      if (!intermediate.success) throw new Error(intermediate.error || '中间格式转换失败');
      const translated = await requestJson('/api/translator/translate', { method: 'POST', body: JSON.stringify({ step: 3, body: { ...intermediate.result, provider: detected.result.provider, model: detected.result.model } }) });
      if (!translated.success) throw new Error(translated.error || '上游格式转换失败');
      target.current = { provider: detected.result.provider, model: detected.result.model, body: translated.result.body };
      setStages({ detected: redact(detected.result), intermediate: redact(intermediate.result), target: redact(translated.result) });
      setMessage('真实网关协议转换完成');
    } catch (failure) { setError(failure.message); }
    finally { setBusy(''); }
  }
  async function load() {
    setBusy('load'); setError(''); setMessage('');
    try {
      const result = await requestJson(`/api/translator/load?file=${encodeURIComponent(file)}`);
      if (!result.success) throw new Error(result.error || '调试记录读取失败');
      if (/^[1-4]_/.test(file)) changeDraft(JSON.stringify(redact(JSON.parse(result.content)), null, 2));
      else setOutput(result.content);
      setMessage('已读取网关实际调试文件');
    } catch (failure) { setError(failure.message); }
    finally { setBusy(''); }
  }
  async function save() {
    setBusy('save'); setError(''); setMessage('');
    try { const input = body(); await requestJson('/api/translator/save', { method: 'POST', body: JSON.stringify({ file: '1_req_client.json', content: JSON.stringify(input, null, 2) }) }); setMessage('当前请求已保存为客户端调试文件'); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(''); }
  }
  async function send() {
    setBusy('send'); setError(''); setOutput(''); setMessage(''); controller.current = new AbortController();
    try {
      const response = await openApiResponse('/api/translator/send', { method: 'POST', body: JSON.stringify(target.current), signal: controller.current.signal });
      const reader = response.body.getReader(); const decoder = new TextDecoder();
      try { while (true) { const { done, value } = await reader.read(); const text = decoder.decode(value || new Uint8Array(), { stream: !done }); if (text) setOutput(previous => previous + text); if (done) break; } }
      finally { reader.releaseLock(); }
      setMessage('真实上游响应已接收');
    } catch (failure) { if (failure.name === 'AbortError') setMessage('已停止接收，保留已收到的响应'); else setError(failure.message); }
    finally { setBusy(''); controller.current = null; }
  }
  return <>
    <PageHeading title="协议调试" subtitle="查看真实请求的协议转换与上游响应"/>
    {catalog.error && <ErrorBlock message={catalog.error}/>}{error && <ErrorBlock message={error}/>} {message && <p className="admin-success" role="status">{message}</p>}
    <div className="translator-toolbar"><label>目标模型<select aria-label="调试模型" value={model} disabled={!!busy} onChange={event => { setModel(event.target.value); setStages(null); target.current = null; }}><option value="">使用请求中的模型</option>{catalog.models.filter(model => !model.combo).map(model => <option key={model.id} value={model.id}>{model.id}</option>)}</select></label><label>网关调试文件<select aria-label="网关调试文件" value={file} disabled={!!busy} onChange={event => setFile(event.target.value)}>{files.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="button" disabled={!!busy} onClick={load}><Icon name="download"/>载入记录</button></div>
    <div className="translator-grid"><section className="translator-panel"><div className="admin-section-heading"><h2>客户端请求</h2><p>输入真实请求的 JSON。可使用 OpenAI 或 Anthropic 消息格式。</p></div><textarea className="translator-editor" aria-label="请求 JSON" spellCheck={false} disabled={!!busy || !managementEnabled} value={draft} onChange={event => changeDraft(event.target.value)} placeholder="粘贴要调试的 JSON 请求"/><div className="admin-toolbar"><button className="button" disabled={!managementEnabled || !!busy || !draft.trim()} onClick={save}>保存当前请求</button><button className="button primary" disabled={!managementEnabled || !!busy || !draft.trim()} onClick={convert}><Icon name="arrow"/>{busy === 'convert' ? '正在转换…' : '转换请求'}</button></div></section>
      <section className="translator-panel"><div className="admin-section-heading"><h2>转换结果</h2><p>认证信息已隐藏，转换使用当前真实账号配置。</p></div><nav className="admin-tabs" aria-label="转换阶段">{[['detected', '协议识别'], ['intermediate', 'OpenAI 格式'], ['target', '上游格式']].map(([id, label]) => <button type="button" key={id} aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}>{label}</button>)}</nav>{stages ? <><pre className="translator-result">{JSON.stringify(stages[view], null, 2)}</pre><div className="admin-toolbar"><CopyButton value={JSON.stringify(stages[view], null, 2)} label="复制脱敏转换结果"/>{busy === 'send' ? <button className="button" onClick={() => controller.current?.abort()}>停止接收</button> : <button className="button primary" disabled={!managementEnabled || !!busy} onClick={send}><Icon name="play"/>发送到真实上游</button>}</div></> : <div className="empty-state">转换后显示真实协议和请求结构</div>}</section></div>
    <section className="translator-panel translator-response"><div className="admin-card-heading"><div><h2>上游原始响应</h2><span className="admin-hint">保留上游的 JSON 或流式事件，便于核对协议。</span></div><CopyButton value={output} label="复制上游响应"/></div>{output ? <pre className="translator-result">{output}</pre> : <p className="empty-state">尚未接收响应</p>}</section>
  </>;
}

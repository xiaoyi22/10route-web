import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { CopyButton, ErrorBlock, Modal } from './Controls.jsx';
import { requestJson } from '../api/client.js';
import { deviceProviders, mimoProviders, proxyProviders } from '../api/oauth-catalog.js';
import { providerInfo } from '../api/providers.js';

export default function OAuthFlow({ provider, onClose, onSaved }) {
  const [flow, setFlow] = useState(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [meta, setMeta] = useState({ baseUrl: '', clientId: '', clientSecret: '', startUrl: '', region: '' });
  const active = useRef(true);
  const startedProxy = useRef(false);
  const device = deviceProviders.has(provider);
  const mimo = mimoProviders.has(provider);
  const proxy = proxyProviders.has(provider);
  const path = `/api/oauth/${encodeURIComponent(provider)}`;
  function completed() { if (!active.current) return; setDone(true); setFlow(null); setInput(''); onSaved(); }
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; if (startedProxy.current) requestJson(`${path}/stop-proxy`).catch(() => {}); };
  }, [path]);
  useEffect(() => {
    if (!flow || done || (!device && !proxy)) return;
    const controller = new AbortController();
    let interval = Math.max(1, Number(flow.interval) || (device ? 5 : 2));
    const deadline = Date.now() + (Number(flow.expires_in) || 600) * 1000;
    let timer;
    async function poll() {
      if (controller.signal.aborted) return;
      if (Date.now() >= deadline) { setError('本次授权已过期，请重新开始。'); setFlow(null); return; }
      try {
        const extraData = Object.fromEntries(Object.entries(flow).filter(([key]) => key.startsWith('_')));
        if (provider === 'qoder' || provider === 'qoder-cn') extraData._qoderVerifier = flow.codeVerifier;
        const result = await requestJson(device ? `${path}/poll` : `${path}/poll-status?state=${encodeURIComponent(flow.state)}`, device ? { method: 'POST', body: JSON.stringify({ deviceCode: flow.device_code, codeVerifier: flow.codeVerifier, extraData }), signal: controller.signal } : { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (result.success || result.status === 'done') return completed();
        if (result.status === 'error' || (device && !result.pending)) throw new Error(result.errorDescription || result.error || '授权未完成');
        if (result.error === 'slow_down') interval = Math.min(interval + 5, 30);
        timer = setTimeout(poll, interval * 1000);
      } catch (failure) { if (!controller.signal.aborted) { setError(failure.message); setFlow(null); } }
    }
    timer = setTimeout(poll, interval * 1000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [flow, done, device, proxy, provider, path]);
  async function start(event) {
    event?.preventDefault(); setBusy(true); setError(''); setInput('');
    try {
      let result;
      if (device) {
        const params = new URLSearchParams();
        if (provider === 'kiro' && meta.startUrl) { params.set('start_url', meta.startUrl); params.set('auth_method', 'idc'); if (meta.region) params.set('region', meta.region); }
        result = await requestJson(`${path}/device-code?${params}`);
      } else if (mimo) {
        result = await requestJson(`${path}/authorize?state=${crypto.randomUUID()}`); startedProxy.current = true;
      } else {
        let redirectUri = provider === 'codex' ? 'http://localhost:1455/auth/callback' : provider === 'xai' ? 'http://127.0.0.1:56121/callback' : `http://localhost:${location.port || (location.protocol === 'https:' ? '443' : '80')}/callback`;
        if (proxy) {
          const started = await requestJson(`${path}/start-proxy`);
          if (!started.success || !started.callbackUrl) throw new Error(started.reason || '回调监听启动失败');
          startedProxy.current = true; redirectUri = started.callbackUrl;
        }
        const params = new URLSearchParams({ redirect_uri: redirectUri });
        if (provider === 'gitlab') for (const key of ['baseUrl', 'clientId']) if (meta[key]) params.set(key, meta[key]);
        result = await requestJson(`${path}/authorize?${params}`);
        if (proxy) {
          const registered = await requestJson(`${path}/register-session`, { method: 'POST', body: JSON.stringify({ state: result.state, codeVerifier: result.codeVerifier }) });
          if (!registered.success) throw new Error('授权会话注册失败');
        }
      }
      if (!active.current) return;
      const url = result.verification_uri_complete || result.verification_uri || result.manualUrl || result.authorizeUrl || result.authUrl;
      if (!url || !['http:', 'https:'].includes(new URL(url).protocol)) throw new Error('上游未提供可用的授权地址');
      setFlow({ ...result, url });
    } catch (failure) { if (active.current) setError(failure.message); }
    finally { if (active.current) setBusy(false); }
  }
  async function exchange(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      let result;
      if (mimo) {
        const accepted = await requestJson(`${path}/submit-code`, { method: 'POST', body: JSON.stringify({ code: input.trim() }) });
        result = await requestJson(`${path}/exchange`, { method: 'POST', body: JSON.stringify({ state: accepted.state }) });
      } else {
        let code = input.trim(); let state = flow.state;
        if (code.includes('://')) {
          const callback = new URL(code);
          if (callback.searchParams.get('error')) throw new Error(callback.searchParams.get('error_description') || callback.searchParams.get('error'));
          const returnedState = callback.searchParams.get('state');
          if (returnedState && flow.state && returnedState !== flow.state) throw new Error('回调不属于本次授权，请使用刚刚打开的授权页面。');
          if (!proxy) code = callback.searchParams.get('code') || callback.searchParams.get('token') || '';
          state = returnedState || state;
        } else if (provider === 'claude' && code.includes('#')) { [code, state] = code.split('#'); if (flow.state && state !== flow.state) throw new Error('授权状态不匹配'); }
        if (!code) throw new Error('回调中没有授权码');
        result = await requestJson(`${path}/exchange`, { method: 'POST', body: JSON.stringify({ code, state, redirectUri: flow.redirectUri, codeVerifier: flow.codeVerifier, ...(provider === 'gitlab' ? { meta: { baseUrl: meta.baseUrl, clientId: meta.clientId, clientSecret: meta.clientSecret } } : {}) }) });
      }
      if (!result.success) throw new Error(result.error || '账号未保存');
      completed();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <Modal title={`连接 ${providerInfo(provider).name}`} onClose={onClose} busy={busy} className="oauth-dialog">
    {done ? <div className="oauth-complete"><span className="admin-card-icon"><Icon name="check"/></span><h3>账号已接入</h3><p>返回供应商页面可查看账号和测试连接。</p><button className="button primary" onClick={onClose}>完成</button></div> : !flow ? <form className="editor-form" onSubmit={start}><p className="admin-hint">{device ? '向真实供应商申请设备授权，随后在供应商页面登录并确认。' : '打开供应商授权页面，完成后将回调地址或授权码粘贴回来。'}</p>{provider === 'gitlab' && [['baseUrl', 'GitLab 地址'], ['clientId', 'OAuth 客户端 ID'], ['clientSecret', 'OAuth 客户端密钥']].map(([key, label]) => <label key={key}>{label}<input type={key === 'clientSecret' ? 'password' : 'text'} required={key !== 'clientSecret'} value={meta[key]} onChange={event => setMeta(previous => ({ ...previous, [key]: event.target.value }))}/></label>)}{provider === 'kiro' && <><label>IAM Identity Center 起始地址（可选）<input value={meta.startUrl} onChange={event => setMeta(previous => ({ ...previous, startUrl: event.target.value }))}/></label><label>区域（可选）<input value={meta.region} onChange={event => setMeta(previous => ({ ...previous, region: event.target.value }))}/></label></>}{error && <ErrorBlock message={error}/>}<div className="dialog-actions"><button className="button" type="button" onClick={onClose}>取消</button><button className="button primary" disabled={busy}>{busy ? '正在申请授权…' : '开始授权'}</button></div></form> : <div className="editor-form">
      <ol className="oauth-steps"><li>打开供应商页面并登录</li><li>{device ? '确认下方设备码，允许授权' : '复制授权码或浏览器的回调地址'}</li><li>{device ? '此窗口自动确认授权结果' : '粘贴到此窗口完成接入'}</li></ol>
      {flow.user_code && <div className="oauth-device-code"><span>设备授权码</span><strong>{flow.user_code}</strong><CopyButton value={flow.user_code} label="复制设备授权码"/></div>}
      <a className="button primary" href={flow.url} target="_blank" rel="noopener noreferrer"><Icon name="globe"/>打开供应商授权页面</a>
      {device ? <p className="admin-hint" role="status">正在等待供应商授权。关闭此窗口会停止检查。</p> : <form className="editor-form" onSubmit={exchange}><label>{mimo ? '授权码' : '回调地址或授权码'}<input required type="password" autoComplete="off" value={input} onChange={event => setInput(event.target.value)}/></label><p className="admin-hint">回调页面无法打开时，可直接复制地址栏中的完整地址。</p>{error && <ErrorBlock message={error}/>}<button className="button primary" disabled={busy || !input.trim()}>{busy ? '正在保存账号…' : '完成授权'}</button></form>}
      <div className="dialog-actions"><button className="button" disabled={busy} onClick={onClose}>取消授权</button></div>
    </div>}
  </Modal>;
}

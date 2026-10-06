import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import ProviderIcon from '../components/ProviderIcon.jsx';
import OAuthFlow from '../components/OAuthFlow.jsx';
import { ErrorBlock, Modal, PageHeading, managementEnabled, useResource } from '../components/Controls.jsx';
import { requestJson } from '../api/client.js';
import { providerInfo } from '../api/providers.js';
import { deviceProviders, oauthProviders, tokenImports } from '../api/oauth-catalog.js';

function AccountImport({ provider, mode, onClose, onSaved }) {
  const config = tokenImports[provider];
  const [form, setForm] = useState({});
  const [json, setJson] = useState('');
  const [filename, setFilename] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);
  const [passphrase, setPassphrase] = useState('');
  const [password, setPassword] = useState('');
  const title = { token: '导入账号令牌', bulk: '批量导入账号', transfer: '导入加密账号', export: '导出加密账号' }[mode];
  async function readServerLogin() {
    setBusy(true); setError('');
    try {
      const data = await requestJson(`/api/oauth/${provider === 'mimo-desktop' ? 'xiaomi-mimo' : provider}/auto-import`);
      if (!data.found) throw new Error(data.error || data.message || '网关所在机器未发现可用的客户端登录');
      setForm(Object.fromEntries(config.fields.map(([key]) => [key, data[key] == null ? '' : String(data[key])])));
      setFilename('已读取服务器登录，请确认后导入');
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function selectFile(event) {
    setError('');
    const file = event.target.files?.[0];
    if (!file) return;
    try { const text = await file.text(); JSON.parse(text); setJson(text); setFilename(file.name); }
    catch { setError('文件不是有效的 JSON'); }
  }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      let result;
      if (mode === 'export') {
        result = await requestJson('/api/oauth/transfer/export', { method: 'POST', headers: { 'x-10r-password': password }, body: JSON.stringify({ provider, passphrase }) });
        const url = URL.createObjectURL(new Blob([JSON.stringify(result.blob, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = `${provider}-accounts-${new Date().toISOString().slice(0, 10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        setSummary({ exported: result.count });
      } else if (mode === 'transfer') {
        const parsed = JSON.parse(json);
        result = await requestJson('/api/oauth/transfer/import', { method: 'POST', body: JSON.stringify({ provider, passphrase, blob: parsed.blob || parsed }) });
        setSummary(result); onSaved();
      } else if (mode === 'bulk') {
        const body = JSON.parse(json);
        if (!Array.isArray(body) && !Array.isArray(body.accounts) && typeof body !== 'object') throw new Error('请提供账号对象或账号数组');
        result = await requestJson(`/api/oauth/${provider}/bulk-import`, { method: 'POST', ...(provider === 'codebuddy-cn' ? { headers: { 'x-10r-password': password } } : {}), body: JSON.stringify(body) });
        setSummary(result); onSaved();
      } else {
        const body = Object.fromEntries(Object.entries(form).filter(([, value]) => value.trim()).map(([key, value]) => [key, value.trim()]));
        if (provider === 'mimo-desktop') body.provider = provider;
        result = await requestJson(`/api/oauth/${config.provider || provider}/${config.action}`, { method: 'POST', body: JSON.stringify(body) });
        if (result.success === false) throw new Error(result.error || '导入失败');
        setSummary({ imported: 1 }); onSaved();
      }
      setPassword(''); setPassphrase(''); setForm({}); setJson('');
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  const counts = summary ? [['imported', '新增'], ['updated', '更新'], ['skipped', '跳过'], ['failed', '失败'], ['exported', '导出'], ['success', '成功']].filter(([key]) => typeof summary[key] === 'number') : [];
  return <Modal title={`${title} · ${providerInfo(provider).name}`} onClose={onClose} busy={busy} className="oauth-dialog"><form className="editor-form" onSubmit={submit}>
    {summary ? <><div className="oauth-import-summary">{counts.map(([key, label]) => <div key={key}><strong>{summary[key]}</strong><span>{label}</span></div>)}</div>{(summary.results || []).filter(item => item.error || item.status === 'failed').map((item, index) => <ErrorBlock key={index} message={`${item.name || item.email || `第 ${index + 1} 项`}：${item.error || item.status}`}/>)}<p className="admin-hint">{mode === 'export' ? '加密文件已下载。请单独保管文件密码。' : '已按后端返回结果处理。账号保存后，请在供应商详情中检测真实连接。'}</p><div className="dialog-actions"><button className="button primary" type="button" onClick={onClose}>完成</button></div></> : <>
      {mode === 'token' && <><p className="admin-hint">使用已有账号的真实凭据。凭据仅提交到网关，不保存在浏览器偏好中。</p>{['cursor', 'zed', 'kiro', 'xiaomi-mimo', 'mimo-desktop'].includes(provider) && <><button className="button" type="button" disabled={busy} onClick={readServerLogin}>读取服务器客户端登录</button><p className="admin-hint">读取网关所在机器的客户端登录，确认后才会导入。{filename}</p></>}{config.fields.map(([key, label, secret, required]) => <label key={key}>{label}<input aria-label={label} required={required} type={secret ? 'password' : 'text'} autoComplete={secret ? 'new-password' : undefined} value={form[key] || ''} onChange={event => setForm(previous => ({ ...previous, [key]: event.target.value }))}/></label>)}</>}
      {['transfer', 'bulk'].includes(mode) && <><label>账号文件<input type="file" accept=".json,application/json" onChange={selectFile}/></label>{filename && <p className="admin-hint">已读取 {filename}</p>}{mode === 'bulk' ? <label>账号 JSON<textarea aria-label="账号 JSON" rows={7} required value={json} onChange={event => setJson(event.target.value)} placeholder="粘贴已有账号导出文件的 JSON"/></label> : <p className="admin-hint">选择由网关“导出加密账号”生成的文件，并填写当时设置的文件密码。</p>}</>}
      {['transfer', 'export'].includes(mode) && <label>文件密码<input required minLength={4} type="password" autoComplete="new-password" value={passphrase} onChange={event => setPassphrase(event.target.value)}/></label>}
      {(mode === 'export' || (mode === 'bulk' && provider === 'codebuddy-cn')) && <label>管理员密码<input required type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)}/></label>}
      {error && <ErrorBlock message={error}/>}<div className="dialog-actions"><button className="button" type="button" disabled={busy} onClick={onClose}>取消</button><button className="button primary" disabled={busy || (mode === 'transfer' && !json)}>{busy ? '正在处理…' : mode === 'export' ? '加密并下载' : '导入账号'}</button></div>
    </>}
  </form></Modal>;
}

export function AuthorizationPage() {
  const resource = useResource('/api/providers');
  const [query, setQuery] = useState('');
  const [flow, setFlow] = useState(null);
  const [importing, setImporting] = useState(null);
  const connections = resource.data?.connections || [];
  const providers = oauthProviders.filter(id => `${id} ${providerInfo(id).name}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <PageHeading title="账号授权" subtitle="连接供应商账号，导入或迁移已有授权"><button className="button" disabled={resource.loading} onClick={resource.refresh}><Icon name="refresh"/>刷新账号</button></PageHeading>
    <div className="admin-toolbar"><div className="filter-search"><Icon name="search"/><input type="search" aria-label="搜索授权供应商" placeholder="搜索供应商…" value={query} onChange={event => setQuery(event.target.value)}/></div><span className="muted">{connections.filter(connection => connection.authType === 'oauth' || connection.authType === 'access_token').length} 个已保存授权账号</span></div>
    {resource.error && <ErrorBlock message={resource.error} onRetry={resource.refresh}/>}
    <div className="oauth-provider-grid">{providers.map(id => {
      const info = providerInfo(id); const accounts = connections.filter(connection => connection.provider === id);
      return <article className="oauth-provider-card" key={id} aria-label={`授权供应商 ${info.name}`}><div className="admin-card-heading"><ProviderIcon provider={id}/><div><h2>{info.name}</h2><span className="muted">{id}</span></div><span className="badge subdued">{accounts.length} 个账号</span></div><p className="admin-hint">{id === 'cursor' ? '使用现有访问令牌导入账号' : deviceProviders.has(id) ? '通过供应商设备码完成授权' : '浏览器授权与已有账号迁移'}</p><div className="oauth-card-actions">
        {managementEnabled && <>{id !== 'cursor' && <button className="button primary" onClick={() => setFlow(id)}><Icon name="link"/>授权连接</button>}{tokenImports[id] && <button className="button" onClick={() => setImporting({ provider: id, mode: 'token' })}>导入令牌</button>}{['codex', 'codebuddy-cn'].includes(id) && <button className="button" onClick={() => setImporting({ provider: id, mode: 'bulk' })}>批量导入</button>}</>}
        {accounts.length > 0 && <Link className="text-button" to={`/dashboard/providers/${encodeURIComponent(id)}`}>管理账号<Icon name="arrow"/></Link>}
      </div>{managementEnabled && <div className="oauth-transfer-actions"><button className="text-button" onClick={() => setImporting({ provider: id, mode: 'transfer' })}>导入加密账号</button><button className="text-button" disabled={!accounts.length} onClick={() => setImporting({ provider: id, mode: 'export' })}>导出加密账号</button></div>}</article>;
    })}</div>
    {!providers.length && <p className="empty-state">暂无匹配的授权供应商</p>}
    {flow && <OAuthFlow provider={flow} onClose={() => { setFlow(null); resource.refresh(); }} onSaved={resource.refresh}/>}
    {importing && <AccountImport {...importing} onClose={() => setImporting(null)} onSaved={resource.refresh}/>}
  </>;
}

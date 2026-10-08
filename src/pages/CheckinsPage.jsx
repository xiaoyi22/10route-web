import { useEffect, useState } from 'react';
import { requestJson } from '../api/client.js';
import Icon from '../components/Icon.jsx';
import { ConfirmDelete, ErrorBlock, IconButton, Modal, PageHeading, formatDate, formatNumber, managementEnabled, useResource } from '../components/Controls.jsx';
import './checkins.css';

const labels = { success: '成功', already: '已签到', expired: '登录过期', verification: '需人工验证', unsupported: '不兼容', error: '失败', interrupted: '结果未确认', running: '执行中', partial: '部分失败', failed: '全部失败' };
const positive = result => ['success', 'already'].includes(result?.status);

function Status({ result }) {
  return <span className={'status ' + (!result ? 'unknown' : positive(result) ? 'healthy' : result.status === 'running' ? 'unknown' : 'error')}><span className="dot"/>{result ? labels[result.status] || '未知' : '未执行'}</span>;
}

function AccountEditor({ account, onClose, onSaved }) {
  const [values, setValues] = useState({ site: account?.site || '', name: account?.name || '', baseUrl: account?.baseUrl || '', protocol: account?.protocol || 'newapi', checkinPath: account?.checkinPath || '/api/user/checkin', authMode: account?.authMode || 'cookie', userId: account?.userId || '', enabled: account?.enabled !== false, cookie: '', token: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const update = (field, value) => setValues(previous => ({ ...previous, [field]: value }));
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await requestJson('/api/checkins/accounts' + (account ? '/' + account.id : ''), { method: account ? 'PATCH' : 'POST', body: JSON.stringify(values) });
      setValues(previous => ({ ...previous, cookie: '', token: '' }));
      onSaved();
      onClose();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <Modal title={account ? '编辑签到账号' : '添加签到账号'} onClose={onClose} busy={busy}>
    <form className="editor-form" onSubmit={save} autoComplete="off">
      <div className="admin-form-grid"><label>站点名称<input required maxLength={100} value={values.site} onChange={event => update('site', event.target.value)} placeholder="例如 AnyRouter"/></label><label>账号名称<input required maxLength={100} value={values.name} onChange={event => update('name', event.target.value)} placeholder="便于识别，不必填写真实邮箱"/></label></div>
      <label>站点地址<input type="url" required value={values.baseUrl} onChange={event => update('baseUrl', event.target.value)} placeholder="https://example.com"/></label>
      <div className="admin-form-grid"><label>签到协议<select value={values.protocol} onChange={event => setValues(previous => ({ ...previous, protocol: event.target.value, checkinPath: event.target.value === 'newapi' ? '/api/user/checkin' : '/api/user/sign_in' }))}><option value="newapi">New API</option><option value="legacy">旧版 Sign In（AnyRouter 等）</option></select></label><label>签到接口<input required value={values.checkinPath} onChange={event => update('checkinPath', event.target.value)} placeholder="/api/user/checkin"/></label></div>
      <div className="admin-form-grid"><label>登录凭据类型<select value={values.authMode} onChange={event => setValues(previous => ({ ...previous, authMode: event.target.value, cookie: '', token: '' }))}><option value="cookie">Cookie + 用户 ID</option><option value="bearer">网站登录 Bearer 令牌</option></select></label><label>用户 ID<input required={values.authMode === 'cookie'} inputMode="numeric" pattern="[0-9]*" value={values.userId} onChange={event => update('userId', event.target.value)} placeholder="站点个人资料中的数字 ID"/></label></div>
      <label>{values.authMode === 'cookie' ? 'Cookie' : '网站登录令牌'}<input type="password" autoComplete="new-password" maxLength={16384} required={!account} value={values[values.authMode === 'cookie' ? 'cookie' : 'token']} onChange={event => update(values.authMode === 'cookie' ? 'cookie' : 'token', event.target.value)} placeholder={account ? '留空保留原凭据；更换站点或身份须重新填写' : values.authMode === 'cookie' ? '完整 Cookie 请求头，不含 Cookie: 前缀' : '不含 Bearer 前缀，不是 sk- 模型 Key'}/></label>
      <p className="admin-hint">只填写你自己的账号凭据。凭据仅加密保存在服务端，不回显、不放入浏览器存储。登录过期后需到原站点重新登录并更新；不自动刷新、不绕过验证码。</p>
      <label className="checkbox-filter"><input type="checkbox" checked={values.enabled} onChange={event => update('enabled', event.target.checked)}/>启用此账号</label>
      {error && <ErrorBlock message={error}/>}
      <div className="dialog-actions"><button type="button" className="button" disabled={busy} onClick={onClose}>取消</button><button className="button primary" disabled={busy}><Icon name="check"/>{busy ? '保存中…' : '保存账号'}</button></div>
    </form>
  </Modal>;
}

export default function CheckinsPage() {
  const resource = useResource('/api/checkins');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('accounts');
  const [editor, setEditor] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const accounts = resource.data?.accounts || [];
  const job = resource.data?.job;
  const running = job?.status === 'running';
  const writable = managementEnabled && resource.data?.configured && !busy && !running;
  const enabled = accounts.filter(account => account.enabled);
  const retries = enabled.filter(account => account.lastResult && !positive(account.lastResult));
  const visible = accounts.filter(account => (account.site + ' ' + account.name + ' ' + account.baseUrl).toLowerCase().includes(query.toLowerCase()));
  const history = (resource.data?.history || []).filter(result => (result.site + ' ' + result.name).toLowerCase().includes(query.toLowerCase()));
  useEffect(() => {
    if (!running || tab !== 'accounts' && tab !== 'history') return;
    const timer = setInterval(resource.refresh, 2000);
    return () => clearInterval(timer);
  }, [running, tab, resource.refresh]);
  async function run() {
    setBusy(true);
    setError('');
    try { await requestJson('/api/checkins/jobs', { method: 'POST', body: JSON.stringify(confirming.body) }); setConfirming(null); resource.refresh(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function toggle(account) {
    setBusy(true);
    setError('');
    try { await requestJson('/api/checkins/accounts/' + account.id, { method: 'PATCH', body: JSON.stringify({ enabled: !account.enabled }) }); resource.refresh(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <div className="checkins-page">
    <PageHeading title="每日签到" subtitle="多站点、多账号独立管理；不使用模型 Key，不影响网关模型请求。">
      <button className="button" disabled={!writable || !retries.length} onClick={() => setConfirming({ body: { mode: 'retry' }, count: retries.length, label: '重试失败账号' })}>重试失败</button>
      <button className="button" disabled={!writable || !enabled.length} onClick={() => setConfirming({ body: {}, count: enabled.length, label: '批量签到' })}><Icon name="play"/>批量签到</button>
      <button className="button primary" disabled={!writable} onClick={() => setEditor({})}><Icon name="plus"/>添加账号</button>
    </PageHeading>
    {resource.error && <ErrorBlock message={resource.error} onRetry={resource.refresh}/>}
    {error && !confirming && <ErrorBlock message={error}/>}
    {resource.data?.configured === false && <ErrorBlock message="签到存储尚未启用。请在服务端配置 TENROUTER_CHECKIN_DIR 并授予独立数据目录写权限；当前不会发送任何签到请求。"/>}
    {!managementEnabled && <p className="inline-note">当前为只读访问，不能保存凭据或执行签到。</p>}
    <div className="checkin-summary"><div><span>账号总数</span><strong>{accounts.length}</strong></div><div><span>已启用</span><strong>{enabled.length}</strong></div><div><span>最近成功 / 已签到</span><strong>{accounts.filter(account => positive(account.lastResult)).length}</strong></div><div><span>待处理</span><strong>{retries.length}</strong></div></div>
    {job && <div className="checkin-job" role="status"><Status result={job}/><span>{job.completed.length} / {job.ids.length} 个账号 · 成功或已签到 {job.successes} · 失败 {job.failures}</span><small>{formatDate(job.startedAt)}</small></div>}
    <div className="checkin-toolbar"><div className="period-tabs" aria-label="签到视图">{[['accounts', '签到账号'], ['history', '执行记录']].map(([value, name]) => <button key={value} type="button" className={tab === value ? 'selected' : ''} aria-pressed={tab === value} onClick={() => setTab(value)}>{name}</button>)}</div><div className="checkin-search"><Icon name="search"/><input aria-label="搜索签到账号" placeholder="搜索站点或账号…" value={query} onChange={event => setQuery(event.target.value)}/></div><button className="button" disabled={resource.loading} onClick={resource.refresh}><Icon name="refresh"/>刷新</button></div>
    <p className="inline-note">仅手动执行，串行签到防止站点限流；验证码需人工处理，登录过期不自动重试。奖励保留站点原始额度，不换算成美元。站点支持情况须逐个验证。</p>
    {resource.loading && !resource.data && <p className="muted">正在读取签到配置…</p>}
    {tab === 'accounts' ? <div className="checkin-accounts" aria-busy={resource.loading}>{visible.map(account => <section className="checkin-account" key={account.id}>
      <div className="checkin-account-top"><div><h2>{account.site}</h2><span className="muted">{account.name}</span></div><Status result={account.lastResult}/></div>
      <a className="checkin-site" href={account.baseUrl} target="_blank" rel="noopener noreferrer">{account.baseUrl}<Icon name="arrow"/></a>
      <dl><div><dt>协议</dt><dd>{account.protocol === 'newapi' ? 'New API' : '旧版 Sign In'}</dd></div><div><dt>接口</dt><dd>{account.checkinPath}</dd></div><div><dt>凭据</dt><dd>{account.authMode === 'cookie' ? 'Cookie' : '登录令牌'} · 已加密保存</dd></div><div><dt>最近执行</dt><dd>{formatDate(account.lastResult?.timestamp)}</dd></div></dl>
      {account.lastResult && <p className="checkin-result">{account.lastResult.message}{account.lastResult.httpStatus ? '（HTTP ' + account.lastResult.httpStatus + '）' : ''}{typeof account.lastResult.reward === 'number' ? ' · 奖励 ' + formatNumber(account.lastResult.reward) + ' 原始额度' : ''}</p>}
      <div className="checkin-account-actions"><label className="checkbox-filter"><input type="checkbox" aria-label={'启用签到 ' + account.name} checked={account.enabled} disabled={!writable} onChange={() => toggle(account)}/>启用</label><button className="button" disabled={!writable || !account.enabled} onClick={() => setConfirming({ body: { ids: [account.id] }, count: 1, label: account.site + ' · ' + account.name })}><Icon name="play"/>签到</button><IconButton icon="edit" label={'编辑签到 ' + account.name} disabled={!writable} onClick={() => setEditor(account)}/><IconButton icon="trash" label={'删除签到 ' + account.name} disabled={!writable} onClick={() => setDeleting(account)}/></div>
    </section>)}{!visible.length && resource.data && <p className="empty-state">{query ? '没有匹配的签到账号。' : '还没有签到账号。添加站点与登录凭据后，可单独或批量执行。'}</p>}</div> : <div className="checkin-history">{history.map(result => <div className="checkin-history-row" key={result.id}><div><strong>{result.site} · {result.name}</strong><small>{formatDate(result.timestamp)}</small></div><Status result={result}/><p>{result.message}{result.httpStatus ? '（HTTP ' + result.httpStatus + '）' : ''}{typeof result.reward === 'number' ? ' · ' + formatNumber(result.reward) + ' 原始额度' : ''}</p></div>)}{!history.length && <p className="empty-state">暂无执行记录。</p>}</div>}
    {editor && <AccountEditor account={editor.id ? editor : null} onClose={() => setEditor(null)} onSaved={resource.refresh}/>}
    {deleting && <ConfirmDelete title="删除签到账号" name={deleting.site + ' · ' + deleting.name} url={'/api/checkins/accounts/' + deleting.id} onClose={() => setDeleting(null)} onDeleted={resource.refresh}/>}
    {confirming && <Modal title="确认执行签到" busy={busy} onClose={() => { setConfirming(null); setError(''); }}><p>将执行 <strong>{confirming.label}</strong>，共 {confirming.count} 个启用账号。此操作会向对应站点发送签到请求。</p><p className="admin-hint">遇到验证码或登录过期时只记录结果，不绕过验证、不重复登录。</p>{error && <ErrorBlock message={error}/>}<div className="dialog-actions"><button className="button" disabled={busy} onClick={() => { setConfirming(null); setError(''); }}>取消</button><button className="button primary" disabled={busy} onClick={run}>{busy ? '创建任务…' : '确认签到'}</button></div></Modal>}
  </div>;
}

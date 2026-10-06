import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { safeProxyUrl } from '../api/providers.js';
import { requestJson } from '../api/client.js';
import { ConfirmDelete, ErrorBlock, IconButton, Modal, PageHeading, formatDate, managementEnabled, useResource } from '../components/Controls.jsx';

const types = { http: 'HTTP / SOCKS', vercel: 'Vercel 中继', cloudflare: 'Cloudflare 中继', deno: 'Deno 中继' };

function PoolEditor({ pool, onClose, onSaved }) {
  const [form, setForm] = useState({ name: pool?.name || '', proxyUrl: '', noProxy: pool?.noProxy || '', type: pool?.type || 'http', strictProxy: pool?.strictProxy === true, isActive: pool?.isActive !== false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const body = { ...form, name: form.name.trim(), proxyUrl: form.proxyUrl.trim(), noProxy: form.noProxy.trim() };
      if (pool && !body.proxyUrl) delete body.proxyUrl;
      // Existing Deno pools retain their type: the backend update route currently accepts only the other three types.
      if (pool && body.type === pool.type) delete body.type;
      await requestJson(pool ? `/api/proxy-pools/${encodeURIComponent(pool.id)}` : '/api/proxy-pools', { method: pool ? 'PUT' : 'POST', body: JSON.stringify(body) });
      onSaved(pool ? '代理池已更新' : '代理池已创建'); onClose();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <Modal title={pool ? '编辑代理池' : '新增代理池'} onClose={onClose} busy={busy}><form className="editor-form" onSubmit={save}>
    <label>代理池名称<input required maxLength="120" value={form.name} onChange={event => set('name', event.target.value)} autoFocus/></label>
    <label>代理类型<select value={form.type} disabled={!!pool} onChange={event => set('type', event.target.value)}>{Object.entries(types).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {pool && <p className="admin-hint">当前地址：{safeProxyUrl(pool.proxyUrl)}</p>}
    <label>{pool ? '替换代理地址' : '代理地址'}<input type="password" autoComplete="new-password" required={!pool} value={form.proxyUrl} onChange={event => set('proxyUrl', event.target.value)} placeholder={pool ? '留空保留当前地址' : 'http://host:port 或 socks5://host:port'}/></label>
    <label>绕过代理<input value={form.noProxy} onChange={event => set('noProxy', event.target.value)} placeholder="localhost,127.0.0.1,.example.com"/></label>
    <div className="admin-switch-row"><div><strong>启用代理池</strong><p>账号可使用此池作为出口</p></div><input type="checkbox" role="switch" aria-label="启用代理池" checked={form.isActive} onChange={event => set('isActive', event.target.checked)}/></div>
    <div className="admin-switch-row"><div><strong>强制代理</strong><p>代理失败时阻止回退直连</p></div><input type="checkbox" role="switch" aria-label="强制代理" checked={form.strictProxy} onChange={event => set('strictProxy', event.target.checked)}/></div>
    {error && <ErrorBlock message={error}/>}<div className="dialog-actions"><button type="button" className="button" disabled={busy} onClick={onClose}>取消</button><button className="button primary" disabled={busy}><Icon name="check"/>{busy ? '正在保存…' : '保存代理池'}</button></div>
  </form></Modal>;
}

export function ProxyPoolsPage() {
  const resource = useResource('/api/proxy-pools?includeUsage=true');
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [testing, setTesting] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [results, setResults] = useState({});
  const pools = resource.data?.proxyPools || [];
  const visible = pools.filter(pool => `${pool.name} ${safeProxyUrl(pool.proxyUrl)}`.toLowerCase().includes(query.toLowerCase()));
  function saved(text) { setMessage(text); setError(''); resource.refresh(); }
  async function toggle(pool) {
    setBusy(pool.id); setError('');
    try { await requestJson(`/api/proxy-pools/${encodeURIComponent(pool.id)}`, { method: 'PUT', body: JSON.stringify({ isActive: !pool.isActive }) }); saved(pool.isActive ? '代理池已停用' : '代理池已启用'); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(''); }
  }
  async function test() {
    setBusy(testing.id); setError(''); setMessage('');
    try {
      const result = await requestJson(`/api/proxy-pools/${encodeURIComponent(testing.id)}/test`, { method: 'POST' });
      setResults(previous => ({ ...previous, [testing.id]: result }));
      if (result.ok) setMessage(`${testing.name} 检测通过 · ${result.elapsedMs} ms`);
      else setError(`${testing.name} 检测失败：${result.error || `HTTP ${result.status}`}。后端已停用该代理池。`);
      setTesting(null); resource.refresh();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(''); }
  }
  return <>
    <PageHeading title="代理池" subtitle="为供应商账号管理固定出口与中继"><button className="button" disabled={resource.loading || !!busy} onClick={resource.refresh}><Icon name="refresh"/>刷新</button>{managementEnabled && <button className="button primary" onClick={() => setEditor({})}><Icon name="plus"/>新增代理池</button>}</PageHeading>
    <div className="admin-summary"><div><span className="admin-eyebrow">代理池</span><strong>{resource.data ? pools.length : '—'}</strong></div><div><span className="admin-eyebrow">已启用</span><strong>{resource.data ? pools.filter(pool => pool.isActive).length : '—'}</strong></div><p>统一管理账号出口<br/><span>在供应商账号详情中绑定代理池。</span></p></div>
    {resource.error && <ErrorBlock message={resource.error} onRetry={resource.refresh}/>}{error && <ErrorBlock message={error}/>}{message && <p className="admin-success" role="status"><Icon name="check"/>{message}</p>}
    <div className="admin-toolbar"><div className="filter-search"><Icon name="search"/><input type="search" aria-label="搜索代理池" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索名称或地址…"/></div><span className="muted">{visible.length} 个代理池</span></div>
    <div className="admin-pool-grid">{visible.map(pool => <article className="admin-pool-card" key={pool.id} aria-label={`代理池 ${pool.name}`}>
      <div className="admin-card-heading"><span className="admin-card-icon"><Icon name="globe"/></span><div><h2>{pool.name}</h2><span className="muted">{types[pool.type] || pool.type}</span></div><span className={`status ${pool.isActive ? 'healthy' : 'disabled'}`}><span className="dot"/>{pool.isActive ? '已启用' : '已停用'}</span></div>
      <p className="admin-pool-address mono">{safeProxyUrl(pool.proxyUrl)}</p>
      <dl className="admin-facts"><div><dt>绑定账号</dt><dd>{pool.boundConnectionCount ?? '—'}</dd></div><div><dt>失败处理</dt><dd>{pool.strictProxy ? '阻止直连' : '允许回退'}</dd></div><div><dt>最近检测</dt><dd>{formatDate(pool.lastTestedAt)}</dd></div><div><dt>绕过规则</dt><dd>{pool.noProxy || '未配置'}</dd></div></dl>
      {pool.lastError && <p className="error-message">{pool.lastError}</p>}{results[pool.id]?.ok && <p className="admin-success">检测通过 · {results[pool.id].elapsedMs} ms</p>}
      {managementEnabled && <div className="admin-card-actions"><button className="button" disabled={!!busy} onClick={() => { setError(''); setTesting(pool); }}><Icon name="activity"/>检测</button><button className="button" disabled={!!busy} onClick={() => setEditor(pool)}><Icon name="edit"/>编辑</button><IconButton icon={pool.isActive ? 'hide' : 'eye'} label={`${pool.isActive ? '停用' : '启用'}代理池 ${pool.name}`} disabled={!!busy} onClick={() => toggle(pool)}/><IconButton icon="trash" label={`删除代理池 ${pool.name}`} disabled={!!busy || pool.boundConnectionCount > 0} onClick={() => setRemoving(pool)}/></div>}
    </article>)}</div>
    {!visible.length && <p className="empty-state">{resource.loading ? '正在读取代理池…' : resource.error ? '代理池读取失败' : '暂无匹配的代理池'}</p>}
    {editor && <PoolEditor pool={editor.id ? editor : null} onClose={() => setEditor(null)} onSaved={saved}/>}
    {removing && <ConfirmDelete title="删除代理池" name={removing.name} url={`/api/proxy-pools/${encodeURIComponent(removing.id)}`} onClose={() => setRemoving(null)} onDeleted={() => saved('代理池已删除')}/>}
    {testing && <Modal title="检测代理池" onClose={() => setTesting(null)} busy={!!busy}><p className="delete-message">检测 <strong>{testing.name}</strong> 的真实连通性。检测成功会启用该池，失败会停用；当前绑定 {testing.boundConnectionCount || 0} 个账号。</p>{error && <ErrorBlock message={error}/>}<div className="dialog-actions"><button className="button" disabled={!!busy} onClick={() => setTesting(null)}>取消</button><button className="button primary" disabled={!!busy} onClick={test}>{busy ? '正在检测…' : '开始检测'}</button></div></Modal>}
  </>;
}

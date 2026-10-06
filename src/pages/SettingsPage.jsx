import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import SettingsPanel from '../components/SettingsPanel.jsx';
import { CopyButton, ErrorBlock, Modal, PageHeading, managementEnabled, useResource } from '../components/Controls.jsx';
import { safeProxyUrl } from '../api/providers.js';
import { requestJson } from '../api/client.js';

const routingFields = [
  { key: 'fallbackStrategy', label: '全局账号调度', default: 'fill-first', options: [['fill-first', '按优先级使用'], ['round-robin', '轮询账号']] },
  { key: 'stickyRoundRobinLimit', label: '账号粘滞请求次数', type: 'number', min: 1, step: 1, required: true, default: 3, hint: '同一账号连续处理的请求数。供应商单独配置优先于全局。' },
  { key: 'comboStrategy', label: '全局组合调度', default: 'fallback', options: [['fallback', '顺序回退'], ['round-robin', '轮询成员']] },
  { key: 'comboStickyRoundRobinLimit', label: '组合粘滞请求次数', type: 'number', min: 1, step: 1, required: true, default: 1 },
  { key: 'comboRetryOnEmpty', label: '空响应自动重试', type: 'checkbox', hint: '组合调用收到空响应时重试。' },
  { key: 'comboRetryOnEmptyLimit', label: '空响应重试上限', type: 'number', min: 1, step: 1, required: true, default: 3 },
];
const accessFields = [
  { key: 'requireLogin', label: '管理页面需要登录', type: 'checkbox', default: true, hint: '使用管理员密码或已配置的统一登录。' },
  { key: 'requireApiKey', label: '模型调用需要 API 密钥', type: 'checkbox', default: true, hint: '下游客户端使用网关签发的密钥。' },
  { key: 'autoUpdateCheck', label: '自动检查版本更新', type: 'checkbox', default: true, hint: '检查可用更新，不会自动安装。' },
];
const ssoFields = [
  { key: 'authMode', label: '登录方式', default: 'password', options: [['password', '管理员密码'], ['both', '密码与统一登录'], ['sso', '仅统一登录']] },
  { key: 'ssoType', label: '统一登录协议', default: 'oidc', options: [['oidc', 'OIDC'], ['saml', 'SAML']] },
];
const oidcFields = [
  { key: 'oidcIssuerUrl', label: 'OIDC 身份服务地址', type: 'url', placeholder: 'https://identity.example.com' },
  { key: 'oidcClientId', label: 'OIDC 客户端 ID' },
  { key: 'oidcClientSecret', label: 'OIDC 客户端密钥', secret: true },
  { key: 'oidcScopes', label: 'OIDC 授权范围', default: 'openid profile email' },
  { key: 'oidcLoginLabel', label: 'OIDC 登录按钮文字', default: '使用统一账号登录' },
];
const samlFields = [
  { key: 'samlEntryPoint', label: 'SAML 登录服务地址', type: 'url' },
  { key: 'samlIssuer', label: 'SAML 服务实体 ID', default: 'urn:10router:sp' },
  { key: 'samlCert', label: '身份平台 X.509 证书', type: 'textarea', rows: 6 },
  { key: 'samlLoginLabel', label: 'SAML 登录按钮文字', default: '使用统一账号登录' },
  { key: 'samlAttributeEmail', label: '邮箱属性', default: 'email' },
  { key: 'samlAttributeName', label: '姓名属性', default: 'name' },
];

function PasswordSettings() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function save(event) {
    event.preventDefault(); setError(''); setMessage('');
    if (!form.newPassword.trim() || form.newPassword !== form.confirm) return setError('新密码不能为空，且两次输入必须一致。');
    setBusy(true);
    try { await requestJson('/api/settings', { method: 'PATCH', body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }) }); setForm({ currentPassword: '', newPassword: '', confirm: '' }); setMessage('管理员密码已更新'); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <section className="admin-settings-panel"><div className="admin-section-heading"><h2>管理员密码</h2><p>修改后使用新密码登录网关。</p></div><form className="editor-form" aria-label="管理员密码" onSubmit={save}><fieldset className="admin-fieldset" disabled={!managementEnabled || busy}>{[['currentPassword', '当前密码'], ['newPassword', '新密码'], ['confirm', '确认新密码']].map(([key, label]) => <label key={key}>{label}<input required type="password" autoComplete={key === 'currentPassword' ? 'current-password' : 'new-password'} value={form[key]} onChange={event => setForm(previous => ({ ...previous, [key]: event.target.value }))}/></label>)}{managementEnabled && <div className="admin-panel-footer"><button className="button primary" disabled={busy || !form.newPassword}>{busy ? '正在更新…' : '更新密码'}</button></div>}</fieldset></form>{error && <ErrorBlock message={error}/>} {message && <p className="admin-success" role="status">{message}</p>}</section>;
}

function download(data, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DatabaseSettings() {
  const [action, setAction] = useState('');
  const [password, setPassword] = useState('');
  const [file, setFile] = useState(null);
  const [payload, setPayload] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function selectFile(event) {
    setError(''); setPayload(null); const selected = event.target.files?.[0]; setFile(selected || null);
    if (!selected) return;
    try {
      const data = JSON.parse(await selected.text());
      if (!data.settings || ['providerConnections', 'providerNodes', 'proxyPools', 'apiKeys', 'combos', 'customModels'].some(key => !Array.isArray(data[key])) || ['pricing', 'modelAliases', 'mitmAlias'].some(key => !data[key] || typeof data[key] !== 'object')) throw new Error('请使用完整的网关备份文件，不能使用局部配置。');
      setPayload(data);
    } catch (failure) { setError(failure.message); }
  }
  function close() { setAction(''); setPassword(''); setFile(null); setPayload(null); }
  async function execute(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const current = await requestJson('/api/settings/database', { headers: { 'x-10r-password': password } });
      download(current, `10router${action === 'import' ? '.bak' : '-backup'}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
      if (action === 'import') {
        await requestJson('/api/settings/database', { method: 'POST', body: JSON.stringify({ ...payload, password }) });
        setMessage('当前配置已导出备份，所选备份已恢复。若备份的管理员密码不同，请使用备份中的密码重新登录。');
      } else setMessage('网关备份已下载');
      close();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <section className="admin-settings-panel"><div className="admin-section-heading"><h2>备份与恢复</h2><p>包含账号、供应商、代理池、密钥、模型及设置。备份含登录凭据，请保存在可信位置。</p></div><div className="admin-toolbar"><button className="button" disabled={!managementEnabled} onClick={() => { setAction('export'); setError(''); }}><Icon name="download"/>导出备份</button><button className="button" disabled={!managementEnabled} onClick={() => { setAction('import'); setError(''); }}><Icon name="refresh"/>恢复备份</button></div>{message && <p className="admin-success" role="status">{message}</p>}
    {action && <Modal title={action === 'import' ? '恢复网关备份' : '导出网关备份'} onClose={close} busy={busy}><form className="editor-form" onSubmit={execute}>{action === 'import' && <><p className="admin-hint">恢复会替换现有配置。操作前先下载一次当前配置备份。</p><label>备份文件<input type="file" accept=".json,application/json" required onChange={selectFile}/></label>{payload && <p className="admin-hint">{file.name} · {payload.providerConnections.length} 个账号 · {payload.apiKeys.length} 个密钥 · {payload.proxyPools.length} 个代理池</p>}</>}<label>确认管理员密码<input type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)}/></label>{error && <ErrorBlock message={error}/>}<div className="dialog-actions"><button className="button" type="button" disabled={busy} onClick={close}>取消</button><button className="button primary" disabled={busy || (action === 'import' && !payload)}>{busy ? '正在处理…' : action === 'import' ? '备份并恢复配置' : '下载备份'}</button></div></form></Modal>}
  </section>;
}

export function SettingsPage() {
  const resource = useResource('/api/settings');
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'routing';
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const settings = resource.data;
  const tabs = [['routing', '调度'], ['proxy', '出站代理'], ['security', '登录与安全'], ['sso', '统一登录'], ['database', '备份与恢复']];
  async function test(kind) {
    setBusy(true); setError(''); setResult('');
    try {
      const data = await requestJson(kind === 'proxy' ? '/api/settings/proxy-test' : `/api/auth/${kind}/test`, { method: 'POST', body: JSON.stringify(kind === 'proxy' ? { proxyUrl: settings.outboundProxyUrl } : {}) });
      if (!data.ok) throw new Error(data.error || '检测失败');
      setResult(kind === 'proxy' ? `真实代理检测通过 · ${data.elapsedMs ?? '—'} ms` : kind === 'saml' ? 'SAML 配置格式检查通过；请继续验证身份平台登录。' : 'OIDC 服务检测通过；请继续验证完整登录。');
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <>
    <PageHeading title="系统设置" subtitle="调度、访问方式与网关数据"><button className="button" disabled={resource.loading} onClick={resource.refresh}><Icon name="refresh"/>刷新设置</button></PageHeading>
    <nav className="admin-tabs" aria-label="设置分类">{tabs.map(([id, label]) => <button key={id} type="button" aria-current={tab === id ? 'page' : undefined} onClick={() => { setParams({ tab: id }); setError(''); setResult(''); }}>{label}</button>)}</nav>
    {resource.error && <ErrorBlock message={resource.error} onRetry={resource.refresh}/>}{error && <ErrorBlock message={error}/>} {result && <p className="admin-success" role="status">{result}</p>}
    {!settings ? <p className="empty-state">{resource.loading ? '正在读取真实网关设置…' : '设置尚未读取'}</p> : <div className="admin-settings-content">
      {tab === 'routing' && <SettingsPanel key="routing" title="全局调度" description="为未设置独立规则的供应商和组合提供默认策略。" settings={settings} fields={routingFields} onSaved={resource.refresh}/>}
      {tab === 'proxy' && <><SettingsPanel key="proxy" title="全局出站代理" description="没有绑定代理池或专用代理的账号继承此配置。" settings={settings} onSaved={resource.refresh} fields={[{ key: 'outboundProxyEnabled', label: '启用全局代理', type: 'checkbox', hint: '保存后立即应用到网关出站请求。' }, { key: 'outboundProxyUrl', label: '代理地址', secret: true, hint: `当前：${safeProxyUrl(settings.outboundProxyUrl) || '未配置'}` }, { key: 'outboundNoProxy', label: '绕过代理规则', placeholder: 'localhost,127.0.0.1,.example.com' }]}/><div className="admin-toolbar"><span className="muted">检测网关已保存的代理地址</span><button className="button" disabled={!managementEnabled || busy || !settings.outboundProxyUrl} onClick={() => test('proxy')}><Icon name="activity"/>{busy ? '正在检测…' : '检测已保存的代理'}</button></div></>}
      {tab === 'security' && <><SettingsPanel key="access" title="访问保护" description="管理页面和模型接口分别控制访问权限。" settings={settings} fields={accessFields} onSaved={resource.refresh}/><PasswordSettings/></>}
      {tab === 'sso' && <><p className="admin-hint admin-note">普通管理使用管理员密码即可。企业身份平台配置完成后，可选择增加统一登录。</p><SettingsPanel key="sso" title="登录入口" description="选择密码登录或身份平台登录。" settings={settings} fields={ssoFields} onSaved={resource.refresh}/><SettingsPanel key="oidc" title="OIDC 身份服务" description={settings.oidcConfigured ? '已配置身份服务；密钥不回显。' : '尚未配置身份服务。'} settings={settings} fields={oidcFields} onSaved={resource.refresh}/><div className="admin-callback"><span>OIDC 回调地址</span><code>{location.origin}/api/auth/oidc/callback</code><CopyButton value={`${location.origin}/api/auth/oidc/callback`}/><button className="button" disabled={!managementEnabled || busy || !settings.oidcConfigured} onClick={() => test('oidc')}>检测 OIDC</button></div><SettingsPanel key="saml" title="SAML 身份服务" description="填写身份平台的登录地址和签名证书。" settings={settings} fields={samlFields} onSaved={resource.refresh}/><div className="admin-callback"><span>SAML 回调地址</span><code>{location.origin}/api/auth/saml/acs</code><CopyButton value={`${location.origin}/api/auth/saml/acs`}/><button className="button" disabled={!managementEnabled || busy || !settings.samlEntryPoint || !settings.samlCert} onClick={() => test('saml')}>检查 SAML 配置</button></div></>}
      {tab === 'database' && <DatabaseSettings/>}
    </div>}
  </>;
}

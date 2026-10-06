import { useState } from 'react';
import Icon from './Icon.jsx';
import { ErrorBlock, Modal, managementEnabled } from './Controls.jsx';
import { requestJson } from '../api/client.js';

export default function SettingsPanel({ title, description, fields, settings, onSaved, children }) {
  const [changes, setChanges] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState(false);
  const dirty = Object.keys(changes).length > 0;
  function change(key, value) { setChanges(previous => ({ ...previous, [key]: value })); setMessage(''); setError(''); }
  async function save() {
    setBusy(true); setError('');
    try {
      const updates = Object.fromEntries(Object.entries(changes).filter(([key, value]) => !(fields.find(field => field.key === key)?.secret && value === '')));
      if (Object.keys(updates).length) await requestJson('/api/settings', { method: 'PATCH', body: JSON.stringify(updates) });
      setChanges({}); setConfirm(false); onSaved(); setMessage('设置已保存');
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  function submit(event) {
    event.preventDefault();
    if (changes.authMode && changes.authMode !== 'password') {
      const protocol = changes.ssoType || settings.ssoType || 'oidc';
      const configured = protocol === 'saml' ? settings.samlEntryPoint && settings.samlCert && settings.samlIssuer : settings.oidcConfigured;
      if (!configured) return setError('请先保存完整的身份服务配置，再开启统一登录。');
    }
    if (changes.requireLogin === false || changes.requireApiKey === false || ['sso', 'oidc', 'saml'].includes(changes.authMode)) setConfirm(true);
    else save();
  }
  return <section className="admin-settings-panel">
    <div className="admin-section-heading"><h2>{title}</h2><p>{description}</p></div>
    <form className="editor-form" aria-label={title} onSubmit={submit}>
      <fieldset className="admin-fieldset" disabled={!managementEnabled || busy}>
        {fields.map(field => {
          const value = changes[field.key] ?? (field.secret ? '' : settings[field.key] ?? field.default ?? (field.type === 'checkbox' ? false : ''));
          if (field.type === 'checkbox') return <div key={field.key} className="admin-switch-row"><div><strong>{field.label}</strong><p>{field.hint}</p></div><label className="toggle-control"><input role="switch" type="checkbox" aria-label={field.label} checked={!!value} onChange={event => change(field.key, event.target.checked)}/><span className="toggle-track" aria-hidden="true"/></label></div>;
          return <label key={field.key}>{field.label}{field.options ? <select aria-label={field.label} value={value} onChange={event => change(field.key, event.target.value)}>{field.options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select> : field.type === 'textarea' ? <textarea aria-label={field.label} rows={field.rows || 4} value={value} onChange={event => change(field.key, event.target.value)} placeholder={field.placeholder}/> : <input aria-label={field.label} type={field.secret ? 'password' : field.type || 'text'} autoComplete={field.secret ? 'new-password' : undefined} min={field.min} max={field.max} step={field.step} required={field.required} value={value} onChange={event => change(field.key, field.type === 'number' ? event.target.value === '' ? '' : Number(event.target.value) : event.target.value)} placeholder={field.secret ? '留空保留现有值' : field.placeholder}/>} {field.hint && <small className="admin-hint">{field.hint}</small>}</label>;
        })}
        {children}
        <div className="admin-panel-footer"><span className="muted">{dirty ? '有未保存更改' : '已与网关同步'}</span>{managementEnabled && <div><button type="button" className="button" disabled={!dirty || busy} onClick={() => { setChanges({}); setError(''); }}>放弃更改</button><button className="button primary" disabled={!dirty || busy}><Icon name="check"/>{busy ? '正在保存…' : '保存设置'}</button></div>}</div>
      </fieldset>
    </form>
    {error && <ErrorBlock message={error}/>}{message && <p className="admin-success" role="status">{message}</p>}
    {confirm && <Modal title="确认修改访问方式" busy={busy} onClose={() => setConfirm(false)}><p className="delete-message">{changes.requireLogin === false ? '关闭管理登录后，能够访问网关的人可直接进入管理页。' : ''}{changes.requireApiKey === false ? '关闭密钥验证后，模型接口将允许无密钥调用。' : ''}{['sso', 'oidc', 'saml'].includes(changes.authMode) ? '仅使用统一登录后，管理员密码入口将隐藏。请先完成身份平台的真实登录验证。' : ''}</p>{error && <ErrorBlock message={error}/>}<div className="dialog-actions"><button className="button" disabled={busy} onClick={() => setConfirm(false)}>取消</button><button className="button primary" disabled={busy} onClick={save}>确认保存</button></div></Modal>}
  </section>;
}

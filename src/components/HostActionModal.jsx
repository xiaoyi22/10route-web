import { useState } from 'react';
import { ErrorBlock, Modal } from './Controls.jsx';
import { requestJson } from '../api/client.js';

export default function HostActionModal({ title, operation, payload, onSuccess, onClose }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await requestJson('/api/host-management', { method: 'POST', headers: { 'x-10r-password': password }, body: JSON.stringify({ operation, payload }) });
      setPassword(''); onSuccess(result); onClose();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <Modal title={title} busy={busy} onClose={onClose}><form className="editor-form" onSubmit={submit}><p className="admin-hint">此操作在网关服务器执行。请输入当前管理员密码再次验证。</p><label>管理员密码<input aria-label="管理员密码" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)}/></label>{error && <ErrorBlock message={error}/>}<div className="dialog-actions"><button className="button" type="button" disabled={busy} onClick={onClose}>取消</button><button className="button primary" disabled={busy || !password}>{busy ? '正在执行…' : '验证并执行'}</button></div></form></Modal>;
}

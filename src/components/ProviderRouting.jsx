import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { ErrorBlock, managementEnabled } from './Controls.jsx';
import { requestJson } from '../api/client.js';

export default function ProviderRouting({ provider, settings, onSaved }) {
  const override = settings.providerStrategies?.[provider] || {};
  const [enabled, setEnabled] = useState(override.fallbackStrategy === 'round-robin');
  const [limit, setLimit] = useState(String(override.stickyRoundRobinLimit ?? (override.fallbackStrategy === 'round-robin' ? settings.stickyRoundRobinLimit ?? 3 : 1)));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (dirty || busy) return;
    const current = settings.providerStrategies?.[provider] || {};
    setEnabled(current.fallbackStrategy === 'round-robin');
    setLimit(String(current.stickyRoundRobinLimit ?? (current.fallbackStrategy === 'round-robin' ? settings.stickyRoundRobinLimit ?? 3 : 1)));
  }, [settings, provider]);
  const strategy = override.fallbackStrategy || settings.fallbackStrategy || 'fill-first';
  const strategyName = strategy === 'round-robin' ? `轮询 · 粘滞 ${override.stickyRoundRobinLimit || settings.stickyRoundRobinLimit || 3} 次` : strategy === 'fill-first' ? '优先级' : strategy;
  function edit() { setDirty(true); setError(''); setMessage(''); }
  async function save(event) {
    event.preventDefault();
    const count = Number(limit);
    if (enabled && (!Number.isSafeInteger(count) || count < 1)) { setError('粘滞请求次数必须为正整数。'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const latest = await requestJson('/api/settings');
      const strategies = { ...latest.providerStrategies };
      const current = { ...strategies[provider] };
      if (enabled) Object.assign(current, { fallbackStrategy: 'round-robin', stickyRoundRobinLimit: count });
      else { delete current.fallbackStrategy; delete current.stickyRoundRobinLimit; }
      if (Object.keys(current).length) strategies[provider] = current;
      else delete strategies[provider];
      await requestJson('/api/settings', { method: 'PATCH', body: JSON.stringify({ providerStrategies: strategies }) });
      setDirty(false); setMessage('已保存账号调度'); onSaved();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <form className="provider-routing" aria-label="账号调度" onSubmit={save}>
    <fieldset disabled={!managementEnabled || busy} className="plain-fieldset">
      <strong>账号调度</strong>
      <div className="provider-routing-toggle"><span>轮询</span><label className="toggle-control"><input type="checkbox" role="switch" aria-label="供应商轮询" checked={enabled} onChange={event => { setEnabled(event.target.checked); edit(); }}/><span aria-hidden="true" className="toggle-track"/></label></div>
      {enabled && <label className="provider-sticky">粘滞请求次数<input aria-label="粘滞请求次数" title="同一账号连续处理的请求次数，1 表示每次请求切换账号" type="number" min="1" step="1" required value={limit} onChange={event => { setLimit(event.target.value); edit(); }}/></label>}
      <span className="muted">{dirty ? '有未保存更改' : `${override.fallbackStrategy ? '当前策略' : '继承全局'}：${strategyName}`}</span>
      {managementEnabled && <button type="submit" className="button" disabled={!dirty || busy}><Icon name="check"/>{busy ? '正在保存…' : '保存调度'}</button>}
    </fieldset>
    {error && <ErrorBlock message={error}/>} {message && <p className="success-message" role="status">{message}</p>}
  </form>;
}

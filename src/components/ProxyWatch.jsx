import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { ErrorBlock, Modal, formatDate, managementEnabled, useResource } from './Controls.jsx';
import ProxyOperationResult from './ProxyOperationResult.jsx';
import { requestJson } from '../api/client.js';

const actions = { 'probe-ok': '节点探测正常', 'probe-fail-1': '节点首次探测失败，已记录', 'would-switch': '观察模式已生成切换建议', 'would-switch-slow': '观察模式已生成慢节点切换建议', 'switched': '已切换节点', 'switched-slow': '已切换慢节点', 'adopt-manual': '已确认手动选择的节点', 'reset-to-pool-head': '已恢复池内节点' };

export default function ProxyWatch({ group, revision, onChanged }) {
  const resource = useResource(`/api/hermes/proxy/failover?group=${encodeURIComponent(group)}`);
  const previousRevision = useRef(revision);
  useEffect(() => {
    if (previousRevision.current === revision) return;
    previousRevision.current = revision; resource.refresh();
  }, [revision, resource.refresh]);
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const data = resource.data;
  const alert = data?.pending_alert;
  async function execute(action = confirmation) {
    setBusy(true); setFeedback(null);
    try {
      let result;
      if (action.type === 'select') result = await requestJson('/api/hermes/proxy/select', { method: 'POST', body: JSON.stringify({ group, name: action.name }) });
      else result = await requestJson(`/api/hermes/proxy/failover/${action.type}`, { method: 'POST', body: JSON.stringify({ group, ...(action.type === 'observe' ? { observe_only: action.observeOnly } : {}) }) });
      const message = action.type === 'observe' ? `${group}：已切换为${result.observe_only ? '观察模式' : '自动切换'}` : action.type === 'ack' ? '告警已确认' : action.type === 'select' ? `已切换到 ${result.now}` : `${actions[result.action] || '看护检查已完成'}${result.to ? ` → ${result.to}` : ''}`;
      const warning = result.verify_ok === false ? '已切换，但新节点探测失败，请检查当前出口' : result.slow ? `节点可达但延迟偏高，连续慢计数 ${result.slow_strikes || 0}` : result.warning;
      setFeedback({ message, warning }); setConfirmation(null);
    } catch (failure) { setFeedback({ ...failure.details, error: failure.message }); }
    finally { setBusy(false); onChanged(); }
  }
  function confirm(action) { setFeedback(null); setConfirmation(action); }
  return <div className="proxy-watch"><div className="panel-heading"><h3>{group}</h3><span className="badge subdued">{data ? data.observe_only ? '观察模式' : '自动切换' : '—'}</span></div>
    {resource.error && <ErrorBlock message={resource.error} onRetry={resource.refresh}/>}
    {managementEnabled && <div className="proxy-watch-controls"><div className="checkbox-filter"><span>自动切换</span><label className="toggle-control"><input type="checkbox" role="switch" aria-label={`自动切换 ${group}`} checked={data?.observe_only === false} disabled={!data || busy || resource.loading || !!resource.error} onChange={event => confirm({ type: 'observe', observeOnly: !event.target.checked })}/><span aria-hidden="true" className="toggle-track"/></label></div><button className="button" disabled={!data || busy || resource.loading || !!resource.error} onClick={() => confirm({ type: 'tick' })}><Icon name="activity"/>检查当前节点</button></div>}
    <dl className="proxy-watch-fields"><div><dt>当前节点</dt><dd>{data?.current || '—'}</dd></div><div><dt>连续失败</dt><dd>{data?.consecutive_failures ?? '—'}</dd></div><div><dt>最近探测</dt><dd>{formatDate(data?.last_probe?.time)}{data?.last_probe && <small className="cell-note">{data.last_probe.ok === true ? '探测正常' : data.last_probe.ok === false ? '探测失败' : '未检测'}{data.last_probe.detail ? ` · ${data.last_probe.detail}` : ''}</small>}</dd></div><div><dt>最近切换</dt><dd>{data?.last_switch?.to || '—'}<small className="cell-note">{formatDate(data?.last_switch?.time)}</small></dd></div>{data?.slow_threshold_ms && <div><dt>慢节点判定</dt><dd>{data.slow_threshold_ms} ms · 连续 {data.slow_strikes_required} 次<small className="cell-note">当前慢计数 {data.consecutive_slow || 0}</small></dd></div>}</dl>
    {data?.all_dead && <ErrorBlock message="看护未找到健康候选节点"/>}
    {alert?.kind && <div className="proxy-watch-alert"><p className="error-message">{alert.kind === 'switch-failed' ? '自动切换失败' : '节点故障告警'}</p><p>{alert.detail || alert.kind}</p>{alert.to && <p>建议节点：{alert.to}</p>}<small className="cell-note">{formatDate(alert.time)}</small>{managementEnabled && <div className="dialog-actions">{alert.to && <button className="button" disabled={busy || resource.loading} onClick={() => confirm({ type: 'select', name: alert.to })}><Icon name="check"/>采用建议</button>}<button className="button" disabled={busy || resource.loading} onClick={() => execute({ type: 'ack' })}><Icon name="check"/>确认告警</button></div>}</div>}
    {!confirmation && <ProxyOperationResult result={feedback}/>}
    {confirmation && <Modal title={confirmation.type === 'observe' ? '切换看护模式' : confirmation.type === 'select' ? '采用建议节点' : '检查当前节点'} onClose={() => setConfirmation(null)} busy={busy}>
      <dl className="request-details"><div><dt>代理组</dt><dd>{group}</dd></div><div><dt>当前节点</dt><dd>{data?.current || '—'}</dd></div>{confirmation.type === 'observe' && <div><dt>目标模式</dt><dd>{confirmation.observeOnly ? '观察模式' : '自动切换'}</dd></div>}{confirmation.name && <div><dt>目标节点</dt><dd>{confirmation.name}</dd></div>}</dl>
      <p className="proxy-note">{confirmation.type === 'observe' ? confirmation.observeOnly ? '看护会继续检测并记录告警，停止自动切换节点。' : '节点故障达到阈值时，看护将自动选择其他节点，相关连接的出口可能变化。' : confirmation.type === 'tick' ? data?.observe_only ? '立即执行一次看护检查，按观察模式记录结果和建议。' : '立即执行一次看护检查，达到故障或慢节点阈值时可能切换出口。' : '使用该代理组的连接将采用建议节点。'}</p>
      <ProxyOperationResult result={feedback}/><div className="dialog-actions"><button className="button" disabled={busy} onClick={() => setConfirmation(null)}>取消</button><button className="button primary" disabled={busy} onClick={() => execute()}><Icon name="check"/>{busy ? '正在处理…' : '确认操作'}</button></div>
    </Modal>}
  </div>;
}

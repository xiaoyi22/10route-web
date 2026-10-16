import { useEffect, useState } from 'react';
import { requestJson } from '../api/client.js';
import { providerId } from '../api/data.js';
import { CREDIT_MAX_AGE, creditWindow, isQoder, modelCreditStatus } from '../api/model-credits.js';
import './model-credits.css';

function useQoderCatalog(connection, revision) {
  const [snapshot, setSnapshot] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const id = connection?.id;
  const account = connection?.name || connection?.displayName || '未命名账号';
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    let timer;
    setSnapshot(previous => ({ ...(previous?.connectionId === id ? previous : {}), connectionId: id, account, loading: true, error: '' }));
    requestJson(`/api/providers/${encodeURIComponent(id)}/models`, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) })
      .then(data => {
        if (controller.signal.aborted) return;
        if (data.warning || !Array.isArray(data.models) || !data.models.length) throw new Error(data.warning || '账号未返回模型积分信息');
        const updatedAt = Date.now();
        setSnapshot({ connectionId: id, account, models: data.models, updatedAt, loading: false, error: '' });
        const delay = Math.min(CREDIT_MAX_AGE, ...data.models.map(model => creditWindow(model.promotion, updatedAt)?.refreshIn || CREDIT_MAX_AGE));
        timer = setTimeout(() => setRefresh(value => value + 1), delay);
      })
      .catch(error => {
        if (!controller.signal.aborted) setSnapshot(previous => ({ ...previous, connectionId: id, account, loading: false, error: error.name === 'TimeoutError' ? '积分查询超时，请刷新重试' : error.message }));
      });
    const resume = () => { if (document.visibilityState === 'visible') setRefresh(value => value + 1); };
    document.addEventListener('visibilitychange', resume);
    return () => { controller.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', resume); };
  }, [id, account, revision, refresh]);
  return id && snapshot?.connectionId === id ? snapshot : id ? { connectionId: id, account, loading: true } : null;
}

export function useModelCredits(connections, revision, provider = '') {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const account = name => (!provider || providerId(provider) === name) ? connections.find(connection => connection.provider === name && connection.isActive !== false) : null;
  const qoder = useQoderCatalog(account('qoder'), revision);
  const qoderCn = useQoderCatalog(account('qoder-cn'), revision);
  return { now, qoder, qoderCn };
}

export default function ModelCredits({ model, pricing, unavailable }) {
  const live = isQoder(model.provider) ? providerId(model.provider) === 'qoder' ? pricing.qoder : pricing.qoderCn : undefined;
  const status = modelCreditStatus(model, { now: Math.max(pricing.now, live?.updatedAt || 0), live, unavailable });
  if (!status) return null;
  return <div className="model-credit" aria-label={`模型积分 ${model.id}`}>
    <span className={`badge${status.free ? ' model-credit-free' : ''}`}>{status.label}</span>
    {status.detail && <small>{status.detail}</small>}
    {status.source && <small>{status.source}；网关可能选择其他账号</small>}
  </div>;
}

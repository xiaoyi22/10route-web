import { requestLatencyPresentation } from '../api/request-latency.js';

export default function RequestLatency({ entry, speed }) {
  const latency = requestLatencyPresentation(entry);
  const hasSpeed = Number.isFinite(speed?.tps) && speed.tps >= 0;
  return <div className={`log-latency log-latency-${latency.firstTone}`}>
    <span>首字</span><b className={`latency-${latency.firstTone}`}>{latency.first}</b>
    <span>生成速度</span><b title={hasSpeed ? speed.basis : '未记录生成速度'}>{hasSpeed ? `${speed.tps.toFixed(1)} tok/s` : '—'}</b>
    <span>总耗时</span><b className={`latency-${latency.totalTone}`}>{latency.total}</b>
  </div>;
}

export function RequestTime({ timestamp }) {
  const date = timestamp ? new Date(timestamp) : null;
  if (!date || !Number.isFinite(date.getTime())) return '—';
  return <time className="log-time" dateTime={date.toISOString()} title={date.toLocaleString('zh-CN', { hour12: false })}>
    <span>{date.toLocaleDateString('zh-CN')}</span>
    <span>{date.toLocaleTimeString('zh-CN', { hour12: false })}</span>
  </time>;
}

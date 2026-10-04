import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cacheRate } from '../api/data.js';
import { formatNumber } from './Controls.jsx';

const series = [
  { key: 'promptTokens', name: '输入', color: '#f29b73' },
  { key: 'completionTokens', name: '输出', color: '#78aeda' },
  { key: 'cachedTokens', name: '缓存读取', color: '#50bfad' },
  { key: 'cacheCreationTokens', name: '缓存创建', color: '#b69bd4' },
];
const rateLabel = rate => rate === null ? '—' : `${rate.toFixed(1)}%`;
const compact = value => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

function TokenTooltip({ active, payload, label, visibleSeries }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return <div className="token-tooltip" role="status">
    <strong>{label}</strong>
    {visibleSeries.map(item => <div key={item.key}><span><i style={{ background: item.color }}/>{item.name}</span><b>{formatNumber(point[item.key])}</b></div>)}
    <div className="tooltip-cache-rate"><span>缓存率</span><b>{rateLabel(cacheRate(point.cachedTokens, point.promptTokens))}</b></div>
  </div>;
}

export default function TokenCacheChart({ chart, stats, loading, periodTitle }) {
  const [selectedSeries, setSelectedSeries] = useState(null);
  const visibleSeries = selectedSeries ? series.filter(item => item.key === selectedSeries) : series;
  const rate = loading ? null : cacheRate(stats?.totalCachedTokens, stats?.totalPromptTokens);
  return <section className="chart-section token-cache-chart" aria-label="Token 与缓存趋势">
    <div className="panel-heading"><div><h2>Token 与缓存</h2><p>{periodTitle}</p></div><span className="chart-cache-rate">缓存率 <strong data-testid="chart-cache-rate">{rateLabel(rate)}</strong></span></div>
    <div className="token-series-legend" role="group" aria-label="图表指标">{series.map(item => <button key={item.key} type="button" aria-pressed={!selectedSeries || selectedSeries === item.key} title={selectedSeries === item.key ? '恢复全部曲线' : `仅查看${item.name}`} className={selectedSeries === item.key ? 'selected' : ''} onClick={() => setSelectedSeries(previous => previous === item.key ? null : item.key)}><i style={{ background: item.color }}/>{item.name}</button>)}</div>
    <div className="traffic-chart" aria-label="输入、输出、缓存读取、缓存创建时间趋势图">
      {!loading && chart.length ? <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chart} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <defs>{series.map(item => <linearGradient key={item.key} id={`token-fill-${item.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={item.color} stopOpacity={.16}/><stop offset="100%" stopColor={item.color} stopOpacity={.015}/></linearGradient>)}</defs>
          <CartesianGrid vertical={false} stroke="var(--border)"/>
          <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={35} tick={{ fill: 'var(--muted)', fontSize: 11 }}/>
          <YAxis width={48} tickFormatter={compact} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }}/>
          <Tooltip content={<TokenTooltip visibleSeries={visibleSeries}/>} filterNull={false} cursor={{ stroke: 'var(--muted)', strokeDasharray: '3 4' }}/>
          {visibleSeries.map(item => <Area key={item.key} type="linear" dataKey={item.key} name={item.name} stroke={item.color} strokeWidth={2} fill={`url(#token-fill-${item.key})`} connectNulls={false} isAnimationActive={false} activeDot={{ r: 3, strokeWidth: 0 }}/>) }
        </AreaChart>
      </ResponsiveContainer> : <div className="empty-state">{loading ? '正在加载图表…' : '该周期暂无流量记录'}</div>}
    </div>
  </section>;
}

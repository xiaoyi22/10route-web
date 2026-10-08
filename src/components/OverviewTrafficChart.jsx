import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatNumber } from './Controls.jsx';

export default function OverviewTrafficChart({ chart, loading }) {
  return <section className="chart-section" aria-label="请求量趋势">
    <div className="panel-heading"><div><h2>请求趋势</h2><p>最近 10 分钟 · 每分钟请求数 · 不受统计周期影响</p></div></div>
    <div className="traffic-chart">
      {!loading && chart?.length ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={chart} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
        <defs><linearGradient id="overview-request-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity={.2}/><stop offset="100%" stopColor="var(--accent)" stopOpacity={.01}/></linearGradient></defs>
        <CartesianGrid vertical={false} stroke="var(--border)"/>
        <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={35} tick={{ fill: 'var(--muted)', fontSize: 11 }}/>
        <YAxis width={48} allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }}/>
        <Tooltip formatter={value => [formatNumber(value), '请求量']} contentStyle={{ background: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)', borderRadius: 5 }} labelStyle={{ color: 'var(--muted)' }}/>
        <Area type="linear" dataKey="requests" stroke="var(--accent)" strokeWidth={2} fill="url(#overview-request-fill)" connectNulls={false} isAnimationActive={false}/>
      </AreaChart></ResponsiveContainer> : <div className="empty-state">{loading ? '正在加载趋势…' : '后端未提供每分钟请求计数'}</div>}
    </div>
  </section>;
}

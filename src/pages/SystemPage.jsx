import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { ErrorBlock, PageHeading, formatNumber, formatDate } from '../components/Controls.jsx';
import { useOverviewResource } from '../components/useOverviewResource.js';
import { formatBytes, formatUptime } from '../api/overview.js';
import './overview.css';

const percent = value => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) + '%' : '—';
const formatRate = value => typeof value === 'number' && Number.isFinite(value) ? formatBytes(value) + '/s' : '—';
const formatPressure = value => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) + '%' : '—';

function Freshness({ resource, enabled }) {
  return <span className="last-updated">{resource.error ? resource.data ? '上次数据 · 已过期 · ' : '获取失败' : !resource.updated ? '等待数据' : !enabled ? '已暂停 · ' : '更新于 '}{resource.updated && formatDate(resource.data?.sampledAt || resource.updated)}</span>;
}

function ResourceError({ resource, label }) {
  return resource.error && <ErrorBlock message={label + '：' + resource.error + (resource.data ? ' · 保留上次数据，可能已过期' : '')} onRetry={resource.refresh}/>;
}

function State({ type = 'unknown', children }) {
  return <span className={'status ' + type}><span className="dot"/>{children}</span>;
}

function ResourceMeter({ title, value, note, testId }) {
  const known = typeof value === 'number' && Number.isFinite(value);
  return <div className="overview-resource-meter"><div><span>{title}</span><strong data-testid={testId}>{percent(value)}</strong></div><div className="overview-meter-track" role={known ? 'meter' : undefined} aria-label={title} aria-valuemin={known ? 0 : undefined} aria-valuemax={known ? 100 : undefined} aria-valuenow={known ? value : undefined}><span className={known && value >= 90 ? 'critical' : known && value >= 75 ? 'warning' : ''} style={{ width: known ? Math.max(0, Math.min(100, value)) + '%' : '0%' }}/></div><small>{note}</small></div>;
}

function SystemPanel({ resource, enabled }) {
  const data = resource.data;
  const service = data?.gatewayProcess;
  const swapOff = data?.swap?.totalBytes === 0;
  return <section className="overview-panel overview-system" aria-label="KN10 主机状态" aria-busy={resource.loading}>
    <div className="panel-heading"><div><h2>KN10 系统信息</h2><p>{data ? data.scope === 'container' ? '容器运行环境 · 非物理宿主机指标' : 'KN10 Linux 运行环境 · 非本机 Windows' : '只读采集主机与资源状态'}</p></div><Freshness resource={resource} enabled={enabled}/></div>
    <ResourceError resource={resource} label="主机采集"/>
    <dl className="overview-host-facts">
      <div><dt>主机名</dt><dd data-testid="system-hostname">{data?.hostname || '—'}</dd></div>
      <div><dt>操作系统</dt><dd>{data?.operatingSystem || '—'}</dd></div>
      <div><dt>内核 / 架构</dt><dd>{data ? data.kernel + ' / ' + data.architecture : '—'}</dd></div>
      <div><dt>主机运行时间</dt><dd>{formatUptime(data?.uptimeSeconds)}</dd></div>
    </dl>
    <div className="overview-cpu-identity"><Icon name="server"/><strong>{data?.cpu?.model || 'CPU 信息待获取'}</strong><span>{data?.cpu ? formatNumber(data.cpu.logicalCores) + ' 逻辑核心' : '—'}</span></div>
    <div className="overview-resource-grid">
      <ResourceMeter title="CPU" value={data?.cpu?.usagePercent} testId="system-cpu" note={data?.cpu ? data.cpu.sampleMilliseconds + ' ms 区间采样' : '等待采样'}/>
      <ResourceMeter title="内存" value={data?.memory?.usagePercent} note={formatBytes(data?.memory?.usedBytes) + ' / ' + formatBytes(data?.memory?.totalBytes) + ' · 已用 / 总量'}/>
      <ResourceMeter title="Swap" value={data?.swap?.usagePercent} note={swapOff ? '未启用 Swap' : formatBytes(data?.swap?.usedBytes) + ' / ' + formatBytes(data?.swap?.totalBytes) + ' · 已用 / 总量'}/>
      <ResourceMeter title="磁盘 /" value={data?.disk?.usagePercent} note={formatBytes(data?.disk?.usedBytes) + ' / ' + formatBytes(data?.disk?.totalBytes) + ' · 已用 / 总量'}/>
    </div>
    <div className="overview-system-foot"><span>系统负载 1 / 5 / 15 分钟 <b>{data?.cpu?.loadAverage?.map(value => value.toFixed(2)).join(' / ') || '—'}</b></span><span>磁盘可用 <b>{formatBytes(data?.disk?.availableBytes)}</b></span><span>网关服务 <State type={resource.error ? 'unknown' : service?.state === 'active' ? 'healthy' : service ? 'error' : 'unknown'}>{service?.state === 'active' ? resource.error || !enabled ? '上次采集运行中' : '运行中' : service?.state || '未取得'}</State>{service?.pid && <small>PID {service.pid} · 主进程 RSS {formatBytes(service.rssBytes)}</small>}</span></div>
    <div className="overview-detail-grid">
      <div className="overview-detail">
        <h3>运行环境</h3>
        <dl>
          <div><dt>开机时间</dt><dd data-testid="system-booted">{formatDate(data?.bootedAt)}</dd></div>
          <div><dt>硬件平台</dt><dd>{data?.hardware || '—'}{data?.virtualMachine ? ' · 虚拟机' : ''}</dd></div>
          <div><dt>内存明细</dt><dd>Buffers {formatBytes(data?.memoryDetail?.buffersBytes)} · Cached {formatBytes(data?.memoryDetail?.cachedBytes)} · Slab {formatBytes(data?.memoryDetail?.slabBytes)}</dd></div>
          <div><dt>匿名页 / 脏页</dt><dd>{formatBytes(data?.memoryDetail?.anonymousBytes)} · {formatBytes(data?.memoryDetail?.dirtyBytes)}</dd></div>
        </dl>
      </div>
      <div className="overview-detail">
        <h3>压力与 I/O</h3>
        <dl>
          <div><dt>CPU 压力 some</dt><dd data-testid="system-pressure-cpu">{formatPressure(data?.pressure?.cpu?.some)}</dd></div>
          <div><dt>I/O 压力 some / full</dt><dd>{formatPressure(data?.pressure?.io?.some)} / {formatPressure(data?.pressure?.io?.full)}</dd></div>
          <div><dt>内存压力 some / full</dt><dd>{formatPressure(data?.pressure?.memory?.some)} / {formatPressure(data?.pressure?.memory?.full)}</dd></div>
          <div><dt>磁盘读 / 写</dt><dd data-testid="system-disk-rate">{data?.diskActivity?.rates ? formatBytes(data.diskActivity.rates.reduce((sum, device) => sum + device.readBytes, 0)) + '/s / ' + formatBytes(data.diskActivity.rates.reduce((sum, device) => sum + device.writtenBytes, 0)) + '/s' : '需要两次采样'}</dd></div>
          <div><dt>磁盘繁忙度</dt><dd>{percent(data?.diskActivity?.busyPercent)}</dd></div>
        </dl>
      </div>
      <div className="overview-detail">
        <h3>网络接口</h3>
        <dl>
          {data?.network?.length ? data.network.map(link => <div key={link.name}><dt className="mono">{link.name}</dt><dd data-testid={'system-network-' + link.name}>↓ {formatRate(link.rate?.receivedBytes)} · ↑ {formatRate(link.rate?.transmittedBytes)}</dd></div>) : <div><dt>接口</dt><dd>—</dd></div>}
        </dl>
      </div>
      <div className="overview-detail">
        <h3>网关进程</h3>
        <dl>
          <div><dt>启动时间</dt><dd>{formatDate(service?.startedAt)}</dd></div>
          <div><dt>重启次数 / 任务</dt><dd>{formatNumber(service?.restarts)} 次 / {formatNumber(service?.tasks)}</dd></div>
          <div><dt>Cgroup 内存</dt><dd>{formatBytes(service?.memoryBytes)}</dd></div>
          <div><dt>打开文件</dt><dd>{formatNumber(service?.openFiles)}</dd></div>
          <div><dt>TCP 套接字</dt><dd data-testid="system-sockets">{service?.sockets ? service.sockets.total + ' 个 · 已建立 ' + service.sockets.established + ' · 监听 ' + service.sockets.listening : '不可读'}</dd></div>
        </dl>
      </div>
    </div>
    <div className="overview-detail">
      <h3>文件系统</h3>
      <dl>
        {data?.filesystems?.length ? data.filesystems.map(entry => <div key={entry.mount}><dt className="mono">{entry.mount}</dt><dd>{percent(entry.usagePercent)} · 可用 {formatBytes(entry.availableBytes)} / 共 {formatBytes(entry.totalBytes)}</dd></div>) : <div><dt>挂载点</dt><dd>—</dd></div>}
      </dl>
    </div>
    <div className="overview-detail" data-testid="system-failed-units">
      <h3>失败单元</h3>
      {data?.failedUnits?.length ? <ul className="overview-failed-units">{data.failedUnits.map(unit => <li key={unit.scope + unit.name}><State type="warning">{unit.scope === 'user' ? '用户级' : '系统级'}</State><code>{unit.name}</code></li>)}</ul> : data ? <p className="overview-clean">没有处于失败状态的 systemd 单元</p> : <p className="overview-clean">—</p>}
    </div>
    <p className="overview-footnote">{!data ? '系统信息尚未取得；' : data.transport === 'ssh' ? '通过服务端 SSH 只读采集 KN10；' : '由 KN10 服务端本地只读采集；'}内存使用量按 MemAvailable 计算，磁盘范围为根文件系统，主进程 RSS 不包含全部子进程。压力值为 /proc/pressure 的 10 秒平均阻塞比例，磁盘与网络速率是相邻两次采集的差值，首次采集后才有值。{resource.error && data ? '当前展示的是旧快照。' : ''}</p>
  </section>;
}

export default function SystemPage() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const system = useOverviewResource('/api/system/info', 10000, autoRefresh);
  return <div className="system-information-page">
    <PageHeading title="系统信息" subtitle="当前网关所在的 KN10 主机与资源状态">
      <label className="checkbox-filter"><input type="checkbox" checked={autoRefresh} onChange={event => setAutoRefresh(event.target.checked)} aria-label="自动更新系统信息"/>自动更新</label>
      <button className="button refresh-button" aria-label="刷新" aria-busy={system.loading} disabled={system.loading} onClick={system.refresh}><Icon name="refresh"/>{system.loading ? '更新中…' : '刷新'}</button>
    </PageHeading>
    <div className="section-toolbar"><span className="section-kicker">CURRENT SYSTEM</span><span className="last-updated">每 10 秒采集 · 隐藏页面暂停更新</span></div>
    <SystemPanel resource={system} enabled={autoRefresh}/>
  </div>;
}

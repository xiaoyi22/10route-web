import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import SettingsPanel from '../components/SettingsPanel.jsx';
import { ErrorBlock, Modal, PageHeading, formatDate, formatNumber, managementEnabled, useResource } from '../components/Controls.jsx';
import { requestJson } from '../api/client.js';

const levels = [['lite', '轻量'], ['full', '标准'], ['ultra', '强力']];
const groups = [
  ['基础压缩', '在网关处理工具输出和长上下文。', [
    { key: 'rtkEnabled', label: '压缩工具输出', type: 'checkbox', default: true, hint: '使用 RTK 减少重复的工具结果。' },
    { key: 'autoCompactEnabled', label: '自动压缩长上下文', type: 'checkbox', default: true, hint: '接近上下文上限时进行压缩。' },
    { key: 'autoCompactRatio', label: '上下文触发比例', type: 'number', min: 0.1, max: 1, step: 0.01, default: 0.9, required: true },
    { key: 'autoCompactKeepMessages', label: '保留最近消息数', type: 'number', min: 1, step: 1, default: 6, required: true },
  ]],
  ['回复与代码风格', '调整模型回复方式；节省效果取决于实际请求。', [
    { key: 'cavemanEnabled', label: '精简回复', type: 'checkbox', hint: '减少冗余表达。' },
    { key: 'cavemanLevel', label: '回复精简程度', default: 'full', options: [...levels, ['wenyan-lite', '文言 · 轻量'], ['wenyan', '文言 · 标准'], ['wenyan-ultra', '文言 · 强力']] },
    { key: 'ponytailEnabled', label: '精简代码', type: 'checkbox', hint: '优先简单实现，减少不必要的代码。' },
    { key: 'ponytailLevel', label: '代码精简程度', default: 'full', options: levels },
  ]],
  ['Headroom', '连接已部署的 Headroom 压缩服务。', [
    { key: 'headroomEnabled', label: '启用 Headroom', type: 'checkbox', hint: '启用前请在运行状态中确认服务可用。' },
    { key: 'headroomUrl', label: 'Headroom 服务地址', type: 'url', default: 'http://localhost:8787' },
    { key: 'headroomCompressUserMessages', label: '压缩用户消息', type: 'checkbox', hint: '将用户消息纳入压缩范围。' },
    { key: 'headroomCodeAware', label: '代码感知压缩', type: 'checkbox', hint: '需要安装代码压缩扩展。' },
    { key: 'headroomKompress', label: 'Kompress 压缩', type: 'checkbox', default: true, hint: '使用服务支持的压缩模式。' },
  ]],
  ['PXPIPE', '对较长文本应用网关已有的压缩模块。', [
    { key: 'pxpipeEnabled', label: '启用 PXPIPE', type: 'checkbox', hint: '仅在达到字符阈值时处理。' },
    { key: 'pxpipeAutoInstall', label: '缺少模块时自动安装', type: 'checkbox', hint: '启用后，启动模块可能下载运行依赖。' },
    { key: 'pxpipeMinChars', label: '最小字符数', type: 'number', min: 1, step: 1, default: 25000, required: true },
    { key: 'pxpipeTimeoutMs', label: '压缩超时（毫秒）', type: 'number', min: 1, step: 1, default: 30000, required: true },
  ]],
];

function RuntimeCard({ name, title }) {
  const resource = useResource(`/api/${name}/status`);
  const extras = useResource(name === 'headroom' ? '/api/headroom/extras' : null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [log, setLog] = useState('');
  const status = resource.data;
  const labels = { start: name === 'pxpipe' ? '加载模块' : '启动服务', stop: '停止', restart: '重新加载', install: '安装 / 修复', health: '检查运行环境', 'install-extra': '安装扩展', 'remove-extra': '卸载扩展' };
  async function act() {
    setBusy(true); setError(''); setResult(null);
    try {
      const extra = confirm.extra;
      const response = await requestJson(extra ? '/api/headroom/extras' : `/api/${name}/${confirm.action}`, { method: confirm.action === 'remove-extra' ? 'DELETE' : 'POST', ...(extra ? { body: JSON.stringify({ extras: [extra] }) } : {}) });
      setResult(response); setConfirm(null); resource.refresh(); extras.refresh();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function logs() {
    setError('');
    try { const data = await requestJson(name === 'headroom' ? '/api/headroom/extras?log=1' : '/api/pxpipe/logs'); setLog(typeof data.log === 'string' ? data.log : JSON.stringify(data, null, 2)); }
    catch (failure) { setError(failure.message); }
  }
  return <section className="admin-settings-panel"><div className="admin-card-heading"><span className="admin-card-icon"><Icon name="activity"/></span><div><h2>{title}</h2><p className="admin-hint">{status?.version ? `版本 ${status.version}` : '读取服务器实际状态'}</p></div><span className={`status ${status?.running ? 'healthy' : 'unknown'}`}><span className="dot"/>{resource.loading ? '读取中' : status?.running ? '运行中' : status?.installed ? '已安装' : status ? '未安装' : '状态未知'}</span></div>
    {(resource.error || extras.error || error) && <ErrorBlock message={error || resource.error || extras.error}/>}
    <dl className="admin-facts"><div><dt>服务地址</dt><dd>{status?.url || '进程内模块'}</dd></div><div><dt>运行进程</dt><dd>{status?.managedPid || status?.pid || '—'}</dd></div></dl>
    <div className="admin-toolbar cli-runtime-actions"><button className="button" disabled={busy} onClick={resource.refresh}><Icon name="refresh"/>刷新状态</button>{managementEnabled && ['start', 'stop', 'restart', ...(name === 'pxpipe' ? ['install', 'health'] : [])].map(action => <button key={action} className="button" disabled={busy || (name === 'headroom' && action !== 'stop' && !status?.canStart)} onClick={() => { setError(''); setConfirm({ action }); }}>{labels[action]}</button>)}<button className="button" disabled={busy} onClick={logs}>查看操作日志</button></div>
    {name === 'headroom' && extras.data && <div className="cli-profile-list">{(extras.data.available || []).map(extra => <div className="cli-profile" key={extra}><div><strong>{extra === 'code' ? '代码压缩扩展' : extra === 'ml' ? '机器学习压缩扩展' : extra}</strong><small>{extras.data.extras?.[extra] ? '已安装' : '未安装'}</small></div>{managementEnabled && <button className="button" disabled={busy} onClick={() => setConfirm({ action: extras.data.extras?.[extra] ? 'remove-extra' : 'install-extra', extra })}>{extras.data.extras?.[extra] ? '卸载' : '安装'}</button>}</div>)}</div>}
    {result && <div className="runtime-result"><p className="admin-hint">操作已返回，当前状态以上方回读为准。</p>{result.healthy !== undefined && <p className={`status ${result.healthy ? 'healthy' : 'error'}`}>{result.healthy ? '环境检查通过' : '环境检查未通过'}</p>}{result.error && <ErrorBlock message={result.error}/>} {(result.checks || []).map((item, index) => <p key={index}>{item.name || item.label}：{item.ok ? '通过' : '未通过'} {item.detail || item.error || ''}</p>)}</div>}
    {log && <pre className="translator-result">{log}</pre>}
    {confirm && <Modal title={`${labels[confirm.action]} ${title}`} busy={busy} onClose={() => setConfirm(null)}><p className="delete-message">{['install', 'install-extra'].includes(confirm.action) ? '将在网关服务器下载并安装运行组件。' : confirm.action === 'remove-extra' ? '卸载所选扩展会影响依赖该扩展的压缩功能。' : '操作将改变网关服务器上此组件的运行状态。'}{confirm.extra ? ` 扩展：${confirm.extra}` : ''}</p>{error && <ErrorBlock message={error}/>}<div className="dialog-actions"><button className="button" disabled={busy} onClick={() => setConfirm(null)}>取消</button><button className="button primary" disabled={busy} onClick={act}>{busy ? '正在执行…' : '确认执行'}</button></div></Modal>}
  </section>;
}

function CompressionRecords() {
  const resource = useResource('/api/pxpipe/stats?limit=100');
  const [period, setPeriod] = useState('today');
  const totals = resource.data?.windows?.[period];
  return <><div className="admin-toolbar"><div className="period-tabs">{[['today', '今日'], ['last7d', '7 天'], ['last30d', '30 天'], ['all', '全部']].map(([id, label]) => <button key={id} className={period === id ? 'selected' : ''} onClick={() => setPeriod(id)}>{label}</button>)}</div><button className="button" onClick={resource.refresh}>刷新记录</button></div>{resource.error && <ErrorBlock message={resource.error}/>}<div className="admin-summary"><div><span className="admin-eyebrow">处理请求</span><strong>{formatNumber(totals?.requests)}</strong></div><div><span className="admin-eyebrow">已压缩</span><strong>{formatNumber(totals?.compressed)}</strong></div><div><span className="admin-eyebrow">估算节省 Token</span><strong>{formatNumber(totals?.tokensSavedEst)}</strong></div></div><p className="admin-hint">Token 数量为压缩组件的估算值。下表为最近 100 条实际处理记录。</p><div className="table-shell"><table><caption className="sr-only">PXPIPE 实际压缩记录</caption><thead><tr><th>时间</th><th>模型</th><th>结果</th><th>估算节省</th><th>耗时</th></tr></thead><tbody>{(resource.data?.recent || []).map((item, index) => <tr key={index}><td>{formatDate(item.ts)}</td><td>{item.model || '—'}</td><td>{item.status || item.reason || '—'}</td><td>{formatNumber(item.tokensSavedEst)}</td><td>{formatNumber(item.durationMs)} ms</td></tr>)}{!resource.data?.recent?.length && <tr><td colSpan="5" className="table-empty">{resource.loading ? '正在读取…' : '暂无实际压缩记录'}</td></tr>}</tbody></table></div></>;
}

export function TokenSaverPage() {
  const settings = useResource('/api/settings');
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'settings';
  return <><PageHeading title="Token 节省" subtitle="压缩策略、运行组件与实际处理记录"><button className="button" disabled={settings.loading} onClick={settings.refresh}><Icon name="refresh"/>刷新设置</button></PageHeading><nav className="admin-tabs" aria-label="Token 节省分类">{[['settings', '压缩设置'], ['runtime', '运行状态'], ['records', '压缩记录']].map(([id, label]) => <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setParams({ tab: id })}>{label}</button>)}</nav>{settings.error && <ErrorBlock message={settings.error}/>}<div className="admin-settings-content">{tab === 'settings' && (settings.data ? groups.map(([title, description, fields]) => <SettingsPanel key={title} title={title} description={description} fields={fields} settings={settings.data} onSaved={settings.refresh}/>) : <p className="empty-state">正在读取设置…</p>)}{tab === 'runtime' && <><RuntimeCard name="headroom" title="Headroom"/><RuntimeCard name="pxpipe" title="PXPIPE"/></>}{tab === 'records' && <CompressionRecords/>}</div></>;
}

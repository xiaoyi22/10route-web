import { readFileSync, writeFileSync } from 'node:fs';
function edit(file, pairs) {
  let text = readFileSync(file, 'utf8');
  for (const [old, replacement] of pairs) {
    if (text.split(old).length !== 2) throw new Error('Nonunique context: ' + file + ' ' + old.slice(0, 90));
    text = text.replace(old, replacement);
  }
  writeFileSync(file, text);
}
edit('src/App.jsx', [
  ["const AvailabilityPage = lazy(() => import('./pages/AvailabilityPage.jsx'));", "function LegacyAvailabilityRedirect() { const location = useLocation(); const query = new URLSearchParams(location.search); query.set('workspace', 'availability'); return <Navigate to={'/dashboard/monitor?' + query} replace/>; }"],
  ["const MonitorPage = lazy(() => import('./pages/MonitorPage.jsx').then(module => ({ default: module.MonitorPage })));", "const MonitorPage = lazy(() => import('./pages/ModelMonitorPage.jsx'));"],
  ["  { path: '/dashboard/availability', title: '模型可用性', icon: 'shield', group: '监控' },\n", ''],
  ['path="availability" element={<AvailabilityPage/>}', 'path="availability" element={<LegacyAvailabilityRedirect/>}'],
]);
edit('src/api/availability.js', [["return '/dashboard/availability' + (query.size ? '?' + query : '');", "query.set('workspace', 'availability');\n  return '/dashboard/monitor?' + query;"]]);
edit('src/pages/DistributionPage.jsx', [['to="/dashboard/availability"', 'to="/dashboard/monitor?workspace=availability"']]);
edit('src/pages/MonitorPage.jsx', [
  ["import Icon from '../components/Icon.jsx';", "import Icon from '../components/Icon.jsx';\nimport { useSearchParams } from 'react-router-dom';"],
  ['function ManualTest({', 'export function ManualTest({'],
  ['function ManualTest({ target, check, routeId, thinkingLevels, initialThinkingLevel, persistedManualTests, onClose, onResult })', 'function ManualTest({ target, check, routeId, thinkingLevels, initialThinkingLevel, persistedManualTests, onClose, onResult })'],
  ["  async function run() {\n    if (check === 'iq'", "  const sending = useRef(false);\n  async function run() {\n    if (sending.current) return;\n    if (check === 'iq'"],
  ["    setBusy(true); setError('');\n    try {\n      if (check === 'iq'", "    sending.current = true; setBusy(true); setError('');\n    try {\n      if (check === 'iq'"],
  ["    finally { setBusy(false); }\n  }\n  return <Modal title={`单次", "    finally { sending.current = false; setBusy(false); }\n  }\n  return <Modal title={`单次"],
  ['monitorTarget: { provider: target.provider, model: target.model }', 'monitorTarget: { provider: target.provider, model: target.model, ...(target.connectionId && { connectionId: target.connectionId }) }'],
  ["{persistedManualTests ? '使用本供应商可用账号，遵守检测计划排除项' : '由后端路由选择可用账号'}", "{target.connectionId ? target.connectionName || target.connectionId : persistedManualTests ? '使用本供应商可用账号，遵守检测计划排除项' : '由后端路由选择可用账号'}"],
  ["{persistedManualTests ? '结果保存到检测历史并更新状态' : '结果保留在当前页面；后端升级后可保存记录'}", "{persistedManualTests ? '保存到手动检测历史，不改变业务观察或隔离状态' : '结果保留在当前页面；后端升级后可保存记录'}"],
  ['    <dl className="request-details"><div><dt>模型路由</dt><dd><code>{routeId}</code>', '    {target.blocked && <p className="inline-note">此渠道仍处于隔离中。本次仅诊断指定账号，不开放业务调度；测试通过后可另行解除隔离。</p>}<dl className="request-details"><div><dt>模型路由</dt><dd><code>{routeId}</code>'],
  ['export function MonitorPage() {', 'export function MonitorPage({ embedded = false }) {\n  const [params, setParams] = useSearchParams();'],
  ["  const [view, setView] = useState('status');", "  const view = ['status', 'history', 'config'].includes(params.get('toolView')) ? params.get('toolView') : 'status';\n  const setView = value => setParams(previous => { const next = new URLSearchParams(previous); next.set('toolView', value); return next; });"],
  ["  const [check, setCheck] = useState('availability');", "  const check = ['availability', 'iq', 'fingerprint'].includes(params.get('check')) ? params.get('check') : 'availability';\n  const setCheck = value => setParams(previous => { const next = new URLSearchParams(previous); next.set('check', value); return next; });"],
  ["  const [provider, setProvider] = useState('');", "  const [provider, setProvider] = useState(params.get('provider') || '');"],
  ["  const [query, setQuery] = useState('');\n  const [scope", "  const [query, setQuery] = useState(params.get('model') || '');\n  const [scope"],
  ['<PageHeading title="模型检测" subtitle="模型测活 / 智商检测 / 指纹检测">', '<PageHeading title={embedded ? "检测工具" : "模型检测"} subtitle="模型测活 / 智商检测 / 指纹检测" className={embedded ? "monitor-embedded-heading" : undefined}>'],
  ["['config', '自动检测配置']", "['config', '检测配置']"],
  ['  const targets = monitorTargets(config, data.catalog);', "  const targets = monitorTargets(config, data.catalog).filter(target => config.testingModes?.[target.provider] === 'scheduled');\n  const blockedPlans = config.providers.filter(item => config.testingModes?.[item.id] !== 'scheduled');"],
  ['      <section className="monitor-config-band"><div className="panel-heading"><h2>自动检测计划</h2>', `      <section className="monitor-config-band"><div className="panel-heading"><h2>中转站检测模式</h2></div><p className="inline-note">仅业务观察不发出测试；手动测试只在点击后执行。允许定时检测还需下方计划启用。此设置与可用性自动隔离独立。</p><div className="monitor-testing-modes">{data.catalog.map(provider => <label key={provider.id}><span>{provider.name}<small>{Object.hasOwn(config.testingModes || {}, provider.id) ? '按本站设置执行' : '待确认 · 当前仅业务观察'}</small></span><select aria-label={provider.name + ' 检测模式'} value={config.testingModes?.[provider.id] || 'observe'} onChange={event => edit({ testingModes: { ...config.testingModes, [provider.id]: event.target.value } })}><option value="observe">仅业务观察</option><option value="manual">手动测试</option><option value="scheduled">允许定时检测</option></select></label>)}</div><p className="inline-note">保存后影响预览：{blockedPlans.length ? blockedPlans.map(item => data.catalog.find(provider => provider.id === item.id)?.name || item.id).join('、') + ' 的旧计划保留，但不执行定时检测。' : '当前已选计划均允许定时检测。'} 未修改的站点不会自动获得测试权限。</p></section>
      <section className="monitor-config-band"><div className="panel-heading"><h2>自动检测计划</h2>`],
  ['  const data = resource.data;\n  const catalog', "  const data = resource.data;\n  const testingAllowed = id => ['manual', 'scheduled'].includes(data?.config.testingModes?.[id]);\n  const catalog"],
  ["{resource.error && <ErrorBlock message={`${resource.error}${data ? ' · 当前保留上次结果' : ''}`} onRetry={resource.refresh}/>}\n    <div", "{resource.error && <ErrorBlock message={`${resource.error}${data ? ' · 当前保留上次结果' : ''}`} onRetry={resource.refresh}/>}\n    <p className=\"monitor-mode-hint\">主动检测按中转站授权。未确认的站点仅观察业务；在「检测配置」中可改为手动测试。<button className=\"text-button\" onClick={() => setView('config')}>配置检测模式</button></p>\n    <div"],
  ['disabled={!managementEnabled} onClick={() => setManual({ target, check })}', 'disabled={!managementEnabled || !testingAllowed(target.provider)} title={testingAllowed(target.provider) ? "单次真实测试" : "此站点仅允许业务观察"} onClick={() => setManual({ target, check })}'],
]);
// Every fingerprint entry goes through the same guard before the dialog can send.
let monitor = readFileSync('src/pages/MonitorPage.jsx', 'utf8');
monitor = monitor.replaceAll('onClick={() => setFingerprint(target)}', 'onClick={() => { if (testingAllowed(target.provider)) setFingerprint(target); }}');
writeFileSync('src/pages/MonitorPage.jsx', monitor);
edit('src/pages/AvailabilityPage.jsx', [
  ["import { actionNames,", "import { ManualTest } from './MonitorPage.jsx';\nimport { resultNames, resultTone } from '../api/monitor.js';\nimport { actionNames,"],
  ['export default function AvailabilityPage() {', 'export default function AvailabilityPage({ embedded = false }) {'],
  ["  const [view, setView] = useState('channels');", "  const view = ['channels', 'rules', 'history'].includes(params.get('availabilityView')) ? params.get('availabilityView') : 'channels';\n  const setView = value => setParams(previous => { const next = new URLSearchParams(previous); next.set('availabilityView', value); return next; });\n  const [manual, setManual] = useState(null);\n  const [testResult, setTestResult] = useState(null);"],
  ['<PageHeading title="模型可用性" subtitle="监控 / 真实业务请求与渠道状态">', '<PageHeading title={embedded ? "可用性监控" : "模型可用性"} subtitle="真实业务请求与渠道状态" className={embedded ? "monitor-embedded-heading" : undefined}>'],
  ['<Link to="/dashboard/monitor">原有模型检测', '<Link to="/dashboard/monitor?workspace=tools&toolView=config">配置手动测试模式'],
  ['<th>业务统计</th><th>发布与调度</th>', '<th>业务统计</th><th>最近手动测试</th><th>发布与调度</th>'],
  ['</small>}</td><td><span>{row.publicationRequested', '</small>}</td><td>{row.lastManualTest ? <><span className={`status ${resultTone(row.lastManualTest.status)}`}>{resultNames[row.lastManualTest.status] || row.lastManualTest.status}</span><small>{formatDate(row.lastManualTest.at)}</small><small>{row.lastManualTest.latencyMs == null ? "" : row.lastManualTest.latencyMs + " ms"}</small></> : <span className="muted">未测试</span>}<small>{({ observe: "仅业务观察", manual: "手动测试", scheduled: "允许定时检测" })[data.testingModes?.[row.provider]] || "待确认 · 仅业务观察"}</small></td><td><span>{row.publicationRequested'],
  ['<button className="button" onClick={() => setDetail(row)}>详情</button>', '<button className="button" onClick={() => setDetail(row)}>详情</button>{managementEnabled && <button className="button" disabled={row.disabledByUser || row.model === "*" || !["manual", "scheduled"].includes(data.testingModes?.[row.provider])} title="需在检测配置中允许本站手动测试" onClick={() => setManual(row)}>单次测试</button>}'],
  ['colSpan="6" className="table-empty"', 'colSpan="7" className="table-empty"'],
  ['    {control && <ChannelControl', '    {manual && <ManualTest target={manual} routeId={manual.routeId} check="availability" persistedManualTests onClose={() => setManual(null)} onResult={row => { setManual(null); setTestResult(row); resource.refresh(); }}/>}\n    {testResult && <Modal title="手动测试结果" onClose={() => setTestResult(null)}><dl className="request-details">{[["模型", testResult.model], ["账号", testResult.connectionId || testResult.answers?.[0]?.connectionId || "未发出请求"], ["结果", resultNames[testResult.status] || testResult.status], ["HTTP 状态", testResult.answers?.[0]?.httpStatus || "—"], ["耗时", testResult.answers?.[0]?.latencyMs == null ? "—" : testResult.answers[0].latencyMs + " ms"]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><pre className="request-metadata">{testResult.answers?.[0]?.error || testResult.answers?.[0]?.content || "无文本回复"}</pre><p className="inline-note">结果仅作为手动诊断，不改变业务观察、隔离状态或发布选择。</p></Modal>}\n    {control && <ChannelControl'],
]);

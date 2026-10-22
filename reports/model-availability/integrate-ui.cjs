const fs = require('node:fs');
function edit(path, replacements) {
  let source = fs.readFileSync(path, 'utf8');
  for (const [before, after] of replacements) {
    if (source.split(before).length !== 2) throw Error('Expected unique anchor in ' + path + ': ' + before.slice(0, 60));
    source = source.replace(before, after);
  }
  fs.writeFileSync(path, source);
}
edit('src/App.jsx', [
  ["import './admin.css';", "import './admin.css';\nimport './availability.css';"],
  ["const MonitorPage = lazy", "const AvailabilityPage = lazy(() => import('./pages/AvailabilityPage.jsx'));\nconst MonitorPage = lazy"],
  ["{ path: '/dashboard/monitor', title: '模型检测', icon: 'activity', group: '监控' },", "{ path: '/dashboard/monitor', title: '模型检测', icon: 'activity', group: '监控' },\n  { path: '/dashboard/availability', title: '模型可用性', icon: 'shield', group: '监控' },"],
  ['<Route path="monitor" element={<MonitorPage/>}/>', '<Route path="monitor" element={<MonitorPage/>}/><Route path="availability" element={<AvailabilityPage/>}/>'],
]);
edit('src/api/fingerprint.js', [
  ["headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', Authorization: `Bearer ${apiKey}` }", "headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', Authorization: `Bearer ${apiKey}`, 'x-10r-observation-source': 'fingerprint' }"],
]);
edit('src/pages/ProvidersPage.jsx', [
  ["import { ModelsPage } from './CorePages.jsx';", "import { ModelsPage } from './CorePages.jsx';\nimport { availabilityLink, connectionAvailability } from '../api/availability.js';"],
  ["  const settings = useResource('/api/settings');", "  const settings = useResource('/api/settings');\n  const availability = useResource('/api/model-availability');"],
  ["          const failure = connection.lastError ? providerFailure(connection.lastError, connection.authType) : null;", "          const failure = connection.lastError ? providerFailure(connection.lastError, connection.authType) : null;\n          const health = connectionAvailability(availability.data?.rows, connection.id);"],
  ['</div></button></td><td className="provider-test-status">', '</div></button><Link className={`availability-channel-link${health?.blocked ? \' paused\' : \'\'}`} to={availabilityLink({ provider: connection.provider, connectionId: connection.id })}><Icon name="activity"/>{health?.label || \'查看模型可用性\'}</Link></td><td className="provider-test-status">'],
]);
edit('src/pages/DistributionPage.jsx', [
  ["published ? '已发布' : '未发布'}</span></td>", "published ? '已发布' : '未发布'}</span>{distribution.data?.availability?.[model.id]?.blocked && <Link className=\"distribution-availability\" to=\"/dashboard/availability\">渠道暂停 · 查看可用性原因</Link>}</td>"],
  ["<p className=\"distribution-policy\">所有下游共用这份清单。", "<p className=\"distribution-policy\">发布选择保持独立；可用性管理会暂时隐藏全部候选账号均被隔离的模型。所有下游共用这份清单。"],
]);

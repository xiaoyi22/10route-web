import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeading } from '../components/Controls.jsx';

const Availability = lazy(() => import('./AvailabilityPage.jsx'));
const Tools = lazy(() => import('./MonitorPage.jsx').then(module => ({ default: module.MonitorPage })));

export default function ModelMonitorPage() {
  const [params, navigateParams] = useSearchParams();
  const setParams = next => navigateParams({ ...Object.fromEntries(new URLSearchParams(window.location.search)), ...next });
  const workspace = params.get('workspace') === 'tools' ? 'tools' : 'availability';
  return <>
    <PageHeading title="模型检测" subtitle="业务可用性与检测工具"/>
    <div className="model-monitor-workspaces" role="tablist" aria-label="模型检测工作区">
      {[['availability', 'shield', '可用性监控', '观察真实业务 · 控制渠道'], ['tools', 'activity', '检测工具', '手动测试 · 智商与指纹 · 检测计划']].map(([value, , title, note]) => <button key={value} role="tab" id={`workspace-${value}`} aria-selected={workspace === value} aria-controls="model-monitor-content" onClick={() => setParams({ workspace: value })}><strong>{title}</strong><span>{note}</span></button>)}
    </div>
    <section id="model-monitor-content" role="tabpanel" aria-labelledby={`workspace-${workspace}`}>
      <Suspense fallback={<p className="empty-state">正在读取工作区…</p>}>{workspace === 'tools' ? <Tools embedded/> : <Availability embedded/>}</Suspense>
    </section>
  </>;
}

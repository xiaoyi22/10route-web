import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadCatalog } from './catalog.mjs';
import { probes, probeUiMatrix } from './probes.mjs';
import { scenarioProbes, isNotApplicable } from './scenarios.mjs';
import { openSession, openIsolatedSession } from './session.mjs';
import { startIsolatedEnvironment } from './isolated.mjs';
import { renderReport } from './report.mjs';
import { startLiveServer } from './live-server.mjs';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4317';
const outDir = resolve(process.env.TENROUTER_MATRIX_OUT || resolve(import.meta.dirname, '../../reports/matrix'));
const only = process.env.TENROUTER_MATRIX_ONLY ? new RegExp(process.env.TENROUTER_MATRIX_ONLY) : null;

const { cases, ui, meta } = await loadCatalog();
const selected = cases.filter(item => !only || only.test(item.id + ' ' + item.group));
const selectedUi = ui.filter(item => !only || only.test(item.id + ' ' + item.group));

const results = [];
let done = 0;
const total = selected.length + selectedUi.length;
const log = line => process.stdout.write(line + '\n');
log('矩阵：' + meta.total + ' 条用例 + ' + meta.uiTotal + ' 条 UI 矩阵；本次选择 ' + total + ' 条');
log('目标环境：' + base);
log('');

const DEMO_NOISE = /status of (502|404) \(Bad Gateway\)|status of 404 \(Not Found\)/;
// When the live dashboard is on, results.json is rewritten after every case so the page tracks progress.
const livePort = process.env.TENROUTER_MATRIX_LIVE ? Number(process.env.TENROUTER_MATRIX_LIVE) : 0;
let flush = async () => {};
if (livePort) flush = async () => { await mkdir(outDir, { recursive: true }); await writeFile(resolve(outDir, 'results.json'), JSON.stringify(buildSummary())); };
const record = (item, status, reason, extra = {}) => {
  results.push({ id: item.id, group: item.group, route: item.route, category: item.category, title: item.title, risk: item.risk, endpoint: item.endpoint, preconditions: item.preconditions, steps: item.steps, expected: item.expected, origin: item.origin, status, reason: reason || '', ...extra });
  done += 1;
  if (livePort) flush().catch(() => {});
  const mark = status === 'passed' ? 'PASS' : status === 'failed' ? 'FAIL' : 'PEND';
  log('[' + String(done).padStart(3) + '/' + total + '] ' + mark + ' ' + item.id.padEnd(14) + ' ' + item.group + ' · ' + item.category + (reason ? ' — ' + reason : ''));
};

const buildSummary = () => ({
  base,
  generatedAt: new Date().toISOString(),
  done,
  catalog: { cases: meta.total, ui: meta.uiTotal, selected: total },
  counts: {
    passed: results.filter(item => item.status === 'passed').length,
    failed: results.filter(item => item.status === 'failed').length,
    pending: results.filter(item => item.status === 'pending').length,
  },
  groups: [...new Set(results.map(item => item.group))].map(group => {
    const rows = results.filter(item => item.group === group);
    return { group, passed: rows.filter(r => r.status === 'passed').length, failed: rows.filter(r => r.status === 'failed').length, pending: rows.filter(r => r.status === 'pending').length, total: rows.length };
  }),
  results,
});


// Only read-only work runs unattended. Everything else is reported as pending by design.
const probeFor = item => probes[item.category] || scenarioProbes[item.category];
// copy is a client-side clipboard action and the navigation probes only read pages/history, so both are safe unattended.
const SAFE_CATEGORIES = new Set(['copy', 'navigation']);
const runnable = item => (item.risk === 'read-only' || SAFE_CATEGORIES.has(item.category)) && probeFor(item);

let liveServer;
if (livePort) {
  const live = await startLiveServer({ outDir, port: livePort });
  liveServer = live.server;
  log('实时看板：' + live.url);
}

let isolation;
const useIsolation = process.env.TENROUTER_MATRIX_ISOLATED === '1';
if (useIsolation) {
  isolation = await startIsolatedEnvironment({});
  log('隔离环境：' + isolation.base + '（内存 fixture，无真实数据）');
}

let session;
try {
  session = await openSession({ base });
} catch (failure) {
  log('无法建立会话：' + failure.message);
  process.exitCode = 1;
}

if (session) {
  for (const item of selected) {
    // In isolated mode the non-read-only cases are handled against the fixture below, so skip them here.
    if (isolation && item.risk !== 'read-only' && !SAFE_CATEGORIES.has(item.category) && probeFor(item)) continue;
    if (!runnable(item)) {
      const reason = item.risk !== 'read-only' ? '需要写操作或隔离后端，未授权' : '暂无对应可执行探针';
      record(item, 'pending', reason);
      continue;
    }
    try {
      await probeFor(item)(session, item);
      record(item, 'passed');
    } catch (failure) {
      if (isNotApplicable(failure.message)) { record(item, 'pending', failure.message.replace('not-applicable:', '本页不适用：').trim()); continue; }
      const noise = session.demo && DEMO_NOISE.test(failure.message);
      record(item, noise ? 'pending' : 'failed', noise ? '演示后端无上游（502/404 噪声），需真实网关复测' : failure.message);
    }
  }

  // Isolated-risk cases run against a dedicated in-memory fixture backend, never the real gateway.
  if (isolation) {
    const isolatedItems = selected.filter(item => item.risk !== 'read-only' && !SAFE_CATEGORIES.has(item.category) && probeFor(item));
    if (isolatedItems.length) {
      const isolatedSession = await openIsolatedSession({ base: isolation.base, isolated: isolation });
      try {
        for (const item of isolatedItems) {
          isolatedSession.errors.length = 0;
          isolatedSession.writes.length = 0;
          try {
            await probeFor(item)(isolatedSession, item);
            record(item, 'passed');
          } catch (failure) {
            if (isNotApplicable(failure.message)) { record(item, 'pending', failure.message.replace('not-applicable:', '隔离环境不适用：').trim()); continue; }
            record(item, 'failed', failure.message);
          }
        }
      } finally {
        await isolatedSession.browser.close();
      }
    }
  }
  // UI matrix uses its own browser context per entry so viewport and theme isolation stay honest.
  for (const entry of selectedUi) {
    try {
      await probeUiMatrix(session, entry);
      record(entry, 'passed');
    } catch (failure) {
      const noise = session.demo && DEMO_NOISE.test(failure.message);
      record(entry, noise ? 'pending' : 'failed', noise ? '演示后端无上游（502/404 噪声），需真实网关复测' : failure.message);
    }
  }

  if (session.writes.length) log('注意：检测到 ' + session.writes.length + ' 个非只读请求');
  await session.browser.close();
}

const summary = buildSummary();

await mkdir(outDir, { recursive: true });
await writeFile(resolve(outDir, 'results.json'), JSON.stringify(summary, null, 2));
await writeFile(resolve(outDir, 'report.html'), renderReport(summary));
log('');
log('已跑 ' + (summary.counts.passed + summary.counts.failed) + '/' + total + '：通过 ' + summary.counts.passed + '，失败 ' + summary.counts.failed + '，未跑 ' + summary.counts.pending);
log('报告：' + resolve(outDir, 'report.html'));
if (summary.counts.failed) process.exitCode = 1;
if (liveServer) liveServer.close();
if (isolation) await isolation.close();

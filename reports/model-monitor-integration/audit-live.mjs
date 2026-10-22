import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { request } from 'playwright';

const base = 'http://192.168.11.150:4317';
const dir = 'reports/model-monitor-integration/overall';
const env = parseEnv(await readFile('C:/Users/Administrator/.codex/credentials/10router-web.env', 'utf8'));
const context = await request.newContext({ baseURL: base, timeout: 30000 });
const http = [];
const safe = value => String(value || '').replace(/(?:Bearer\s+|sk-)[\w.\-]+/gi, '[redacted]').replace(/https?:\/\/\S+/g, '[upstream-url]').replace(/(?:api[_-]?key|token|password|authorization)\s*[:=]\s*\S+/gi, '[redacted]').slice(0, 300);
async function read(path) {
  const response = await context.get(path);
  http.push({ path, status: response.status() });
  assert.equal(response.status(), 200, path);
  return response.json();
}
try {
  assert.notEqual((await read('/api/auth/status')).demo, true);
  assert.equal((await context.post('/api/auth/login', { data: { password: env.TENROUTER_TEST_PASSWORD.trim() } })).status(), 200);
  const [availability, monitor, distribution] = await Promise.all([read('/api/model-availability'), read('/api/iq-monitor'), read('/api/models/distribution')]);
  assert.equal(availability.source, 'business-requests-only');
  const rows = availability.rows.map(row => ({ provider: row.provider, providerName: row.providerName, connectionName: row.connectionName, connectionId: row.connectionId, model: row.model, routeId: row.routeId, status: row.status, blocked: row.blocked, disabledByUser: row.disabledByUser, publicationRequested: row.publicationRequested, lastSuccess: row.lastSuccess || null, lastFailure: row.lastFailure || null, lastOutcome: row.lastOutcome || null, lastAt: row.lastAt || null, successes: row.successes || 0, failures: row.failures || 0, consecutiveFailures: row.consecutiveFailures || 0, lastRequestId: row.lastRequestId || null, lastError: row.lastError ? { code: row.lastError.code, status: row.lastError.status, message: safe(row.lastError.message) } : null, blockReason: safe(row.blockReason), testingMode: (availability.testingModes || monitor.config.testingModes || {})[row.provider] || 'observe' }));
  const counts = Object.fromEntries([...new Set(rows.map(row => row.status))].map(status => [status, rows.filter(row => row.status === status).length]));
  const byProvider = [...new Set(rows.map(row => row.provider))].map(id => {
    const list = rows.filter(row => row.provider === id);
    return { provider: id, name: list[0].providerName, channels: list.length, enabledChannels: list.filter(row => !row.disabledByUser).length, mode: list[0].testingMode, healthy: list.filter(row => row.status === 'healthy').length, anomalous: list.filter(row => ['suspect', 'network'].includes(row.status)).length, blocked: list.filter(row => row.blocked).length, unknown: list.filter(row => ['unknown', 'waiting', 'recovering'].includes(row.status)).length };
  });
  const anomalies = rows.filter(row => !row.disabledByUser && (row.blocked || ['suspect', 'network'].includes(row.status)));
  const evidence = [];
  for (const target of anomalies) {
    const query = new URLSearchParams({ provider: target.provider, connectionId: target.connectionId, model: target.model, pageSize: '100' });
    const data = await read('/api/usage/request-details?' + query);
    const detail = data.details?.find(item => item.id === target.lastRequestId);
    let structured;
    try { structured = JSON.parse(detail?.error?.message); } catch {}
    evidence.push({ requestId: target.lastRequestId, found: !!detail, ...(detail && { timestamp: detail.timestamp, status: detail.status, httpStatus: detail.error?.status ?? detail.response?.status, endpoint: detail.endpoint, upstreamEndpoint: detail.upstreamEndpoint, latencyMs: detail.latency?.total, observationSource: detail.observationSource, error: { code: detail.error?.code, message: safe(detail.error?.message), ...(structured && { upstreamCode: structured.code, primaryMessage: safe(structured.msg || structured.message || structured.error?.message), advice: safe(structured.displayTips?.en) }) } }) });
  }
  const history = [...(monitor.state?.history || [])].sort((a, b) => b.at - a.at);
  const latest = new Map();
  for (const row of history) {
    const key = JSON.stringify([row.provider, row.model, row.check || 'iq']);
    if (!latest.has(key)) latest.set(key, { provider: row.provider, model: row.model, check: row.check || 'iq', status: row.status, at: row.at, manual: !!row.manual, answers: (row.answers || []).map(answer => ({ status: answer.status, httpStatus: answer.httpStatus, connectionId: answer.connectionId, error: safe(answer.error), correct: answer.iq?.correct })) });
  }
  const report = { at: new Date().toISOString(), base, http, upstreamProbes: 0, productionWrites: 0, capabilities: monitor.capabilities, modeConfigured: Object.keys(availability.testingModes || monitor.config.testingModes || {}).length, availabilityConfig: availability.config, since: availability.since, observedRequests: availability.observedRequests, totalChannels: rows.length, statuses: counts, providers: byProvider, anomalies, evidence, latestChecks: [...latest.values()], monitorConfig: { enabled: monitor.config.enabled, intervalMinutes: monitor.config.intervalMinutes, configuredProviders: monitor.config.providers.length }, distribution: { mode: distribution.mode, selectedModels: distribution.models?.length }, rows };
  await mkdir(dir, { recursive: true });
  await writeFile(dir + '/live-audit.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, rows: undefined, latestChecks: report.latestChecks.slice(0, 20) }, null, 2));
} finally { await context.dispose(); }

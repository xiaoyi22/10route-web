import { readFileSync, writeFileSync } from 'node:fs';
function edit(f, pairs) {
 let s = readFileSync(f, 'utf8');
 for (const [a,b] of pairs) { if (s.split(a).length !== 2) throw Error(f + ': ' + a.slice(0,100)); s=s.replace(a,b); }
 writeFileSync(f,s);
}
for (const f of ['src/pages/MonitorPage.jsx','src/pages/AvailabilityPage.jsx']) edit(f, [['className={embedded ? "monitor-embedded-heading" : undefined}', 'compact={embedded}']]);
edit('src/pages/MonitorPage.jsx', [
 ['initialThinkingLevel, onResult, onClose }) {', 'initialThinkingLevel, canTest = true, onResult, onClose }) {'],
 ["    const apiKey = activeKey?.key;", "    if (!canTest) { setError('此站点仅允许业务观察，请先配置检测模式。'); return; }\n    const apiKey = activeKey?.key;"],
 ['disabled={busy || !activeKey || !route || routesLoading}', 'disabled={!canTest || busy || !activeKey || !route || routesLoading}'],
 ['<FingerprintTest target={fingerprint}', '<FingerprintTest canTest={testingAllowed(fingerprint.provider)} target={fingerprint}'],
]);
let s=readFileSync('src/pages/MonitorPage.jsx','utf8');
s=s.replaceAll('onClick={() => { if (testingAllowed(target.provider)) setFingerprint(target); }}', 'onClick={() => setFingerprint(target)}');
s=s.replace('disabled={!managementEnabled || (distribution.data?', 'disabled={!managementEnabled || !testingAllowed(target.provider) || (distribution.data?');
s=s.replace('disabled={!managementEnabled || (fingerprintAllowlist', 'disabled={!managementEnabled || !testingAllowed(provider) || (fingerprintAllowlist');
writeFileSync('src/pages/MonitorPage.jsx',s);
const base='reports/model-monitor-integration/backend/';
edit(base+'src/lib/iqMonitor/service.js', [
 ['const manualRuns = new Set();','const manualRuns = new Set();\nlet configWrite = Promise.resolve();'],
 ['export async function saveConfig(input) {','export async function saveConfig(input) {\n  const write = configWrite.then(() => persistConfig(input));\n  configWrite = write.catch(() => {});\n  return write;\n}\n\nasync function persistConfig(input) {'],
]);
edit(base+'src/lib/iqMonitor/testingPolicy.js', [
 ['export const TESTING_MODES = ["observe", "manual", "scheduled"];',`export async function testingOverview() {
  const [modes, history] = await Promise.all([testingModes(), store.get("manualHistory", [])]);
  const latest = new Map();
  for (const row of [...history].sort((a, b) => b.at - a.at)) {
    const answer = row.answers?.[0];
    const connectionId = answer?.connectionId || row.connectionId;
    if (!connectionId || (row.check || "iq") !== "availability") continue;
    const key = JSON.stringify([row.provider, connectionId, row.model]);
    if (!latest.has(key)) latest.set(key, { at: row.at, status: row.status, latencyMs: answer?.latencyMs ?? null });
  }
  return { modes, latest };
}`],
]);
edit(base+'src/lib/availability/service.js', [
 ['export async function getAvailability() {', 'export async function getAvailability() {\n  const { testingOverview } = await import("@/lib/iqMonitor/testingPolicy.js");\n  const testing = await testingOverview();'],
 ['routeId: model === "*" ? null : prefix + "/" + model,', 'routeId: model === "*" ? null : prefix + "/" + model,\n        lastManualTest: testing.latest.get(channelKey(provider, connection.id, model)) || null,'],
 ['return { config: state.config, revision: state.revision, since:', 'return { testingModes: testing.modes, config: state.config, revision: state.revision, since:'],
]);
edit(base+'deploy.sh', [['PATCH_CHECKS=(\n','PATCH_CHECKS=(\n  "src/lib/availability/service.js:lastManualTest: testing.latest:1"\n']]);
// Existing test expectations change only where the new permission gate and capability are intentional.
edit('tests/model-availability.test.mjs', [["'/dashboard/availability?provider=p&connectionId=a&model=m'", "'/dashboard/monitor?provider=p&connectionId=a&model=m&workspace=availability'"]]);

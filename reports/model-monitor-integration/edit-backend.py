from pathlib import Path

root = Path(__file__).parent / 'backend'
checks = []
def edit(name, replacements, marker):
    path = root / name
    text = path.read_text(encoding='utf-8')
    for old, new in replacements:
        assert text.count(old) == 1, (name, old[:100], text.count(old))
        text = text.replace(old, new)
    path.write_text(text, encoding='utf-8', newline='\n')
    checks.append(f'  "{name}:{marker}:1"')

checks.append('  "src/lib/iqMonitor/testingPolicy.js:export async function assertTestingAllowed:1"')
edit('src/lib/iqMonitor/core.js', [
    ('  const providers = input.providers.map(item => {', '''  const testingModes = input.testingModes || {};
  if (typeof testingModes !== "object" || Array.isArray(testingModes) || Object.keys(testingModes).length > 500 || Object.entries(testingModes).some(([id, mode]) => !id || id.length > 300 || !["observe", "manual", "scheduled"].includes(mode))) throw new Error("Invalid testing modes");
  const providers = input.providers.map(item => {'''),
    ('return { enabled: input.enabled, intervalMinutes: input.intervalMinutes, providers, questions };', 'return { enabled: input.enabled, intervalMinutes: input.intervalMinutes, providers, questions, testingModes: { ...testingModes } };')
], 'Invalid testing modes')
edit('src/lib/iqMonitor/service.js', [
    ('import { probeTarget as probeManualTarget } from "./probe";', 'import { probeTarget as probeManualTarget } from "./probe";\nimport { assertTestingAllowed } from "./testingPolicy";'),
    ('const runtime = globalThis.__iqMonitorRuntime ||= { running: false };', 'const runtime = globalThis.__iqMonitorRuntime ||= { running: false };\nconst manualRuns = new Set();'),
    ('  const config = validateConfig(input);\n  const catalog', '''  const config = validateConfig(input);
  const current = await getConfig();
  if (current.revision && input.revision !== current.revision) throw Object.assign(new Error("检测配置已被修改，请刷新后再保存"), { status: 409 });
  // Older callers must not silently erase the station testing permissions.
  if (!Object.hasOwn(input, "testingModes")) config.testingModes = current.testingModes || {};
  const catalog'''),
    ('  const saved = { ...config, revision: randomUUID() };', '  if (Object.keys(config.testingModes).some(id => !catalog.some(provider => provider.id === id))) throw new Error("Unknown testing provider");\n  const saved = { ...config, revision: randomUUID() };'),
    ('capabilities: { modelThinking: true, manualTests: true }', 'capabilities: { modelThinking: true, manualTests: true, testingModes: true, targetedTests: true }'),
    ('export async function runManualMonitorTest(target, check, thinkingLevel) {', '''export async function runManualMonitorTest(target, check, thinkingLevel) {
  if (!["iq", "availability"].includes(check)) throw new Error("Invalid test kind");
  await assertTestingAllowed(target?.provider, "manual");
  const key = JSON.stringify([target.provider, target.connectionId || "*", target.model]);
  if (manualRuns.has(key)) throw Object.assign(new Error("此渠道正在测试，请等待结果"), { status: 409 });
  manualRuns.add(key);
  try { return await executeManualTest(target, check, thinkingLevel); }
  finally { manualRuns.delete(key); }
}

async function executeManualTest(target, check, thinkingLevel) {'''),
    ('  const question = check === "iq" ? (await getSettings()).iqProbe : null;', '''  if (target.connectionId) {
    const connections = await getProviderConnections();
    const account = connections.find(item => item.id === target.connectionId && item.provider === target.provider);
    if (!account || account.isActive === false) throw new Error("指定账号不存在、已停用或不属于此供应商");
    const scope = account.providerSpecificData?.enabledModels;
    if (Array.isArray(scope) && scope.length && !scope.includes(target.model)) throw new Error("指定账号未启用此模型");
    if (selection?.excludedConnectionIds?.includes(target.connectionId)) throw new Error("指定账号已被排除检测");
  }
  const question = check === "iq" ? (await getSettings()).iqProbe : null;'''),
    ('const probeTargetInfo = { provider: target.provider, model: target.model, excludedConnectionIds:', 'const probeTargetInfo = { provider: target.provider, model: target.model, testTrigger: "manual", ...(target.connectionId && { connectionId: target.connectionId }), excludedConnectionIds:'),
    ('manual: true, persisted: true, status, score:', 'manual: true, persisted: true, ...(result.connectionId && { connectionId: result.connectionId }), status, score:'),
    ('const { probeTarget } = await import("./probe");\n    return await runTick({ config,', '''const { probeTarget } = await import("./probe");
    const permitted = { ...config, providers: config.providers.filter(item => config.testingModes[item.id] === "scheduled") };
    return await runTick({ config: permitted,''')
], 'const manualRuns = new Set')
edit('src/lib/iqMonitor/probe.js', [
    ('import * as log from "@/sse/utils/logger";', 'import * as log from "@/sse/utils/logger";\nimport { assertTestingAllowed } from "./testingPolicy";'),
    ('maxOutputTokens }, question, check = "iq") {', 'maxOutputTokens, connectionId, testTrigger = "scheduled" }, question, check = "iq") {\n  await assertTestingAllowed(provider, testTrigger);'),
    ('const credentials = await getProviderCredentials(provider, excluded.size ? excluded : null, model);', '''const credentials = connectionId
    ? await getProviderCredentials(provider, excluded.size ? excluded : null, model, { preferredConnectionId: connectionId, diagnosticConnectionId: connectionId })
    : await getProviderCredentials(provider, excluded.size ? excluded : null, model);'''),
    ('  if (excluded.has(credentials.connectionId || credentials.id))', '  if (connectionId && credentials.connectionId !== connectionId) return { ok: false, status: 503, error: "指定账号当前不可用于检测" };\n  if (excluded.has(credentials.connectionId || credentials.id))'),
    ('limitedExecutor.execute = options => executor.execute({ ...options, signal: AbortSignal.any([options.signal, deadline].filter(Boolean)) });', '''let executed = false;
  limitedExecutor.execute = async options => {
    if (executed) throw new Error("单次检测不自动重试");
    await assertTestingAllowed(provider, testTrigger);
    executed = true;
    return executor.execute({ ...options, signal: AbortSignal.any([options.signal, deadline].filter(Boolean)) });
  };'''),
    ('error: `HTTP ${response.status}`, latencyMs', 'error: `HTTP ${response.status}`, latencyMs, connectionId: credentials.connectionId'),
    ('error: String(result.error || "No response"), latencyMs', 'error: String(result.error || "No response"), latencyMs, connectionId: credentials.connectionId'),
    ('error: "Upstream returned an error", latencyMs', 'error: "Upstream returned an error", latencyMs, connectionId: credentials.connectionId')
], '单次检测不自动重试')
edit('src/sse/services/auth.js', [
    ('const connections = await getProviderConnections({ provider: providerId, isActive: true });', 'const allConnections = await getProviderConnections({ provider: providerId, isActive: true });\n    const connections = options.diagnosticConnectionId ? allConnections.filter(c => c.id === options.diagnosticConnectionId) : allConnections;'),
    ('if (passiveDecisions.get(c.id)?.blocked) return false;', 'if (passiveDecisions.get(c.id)?.blocked && c.id !== options.diagnosticConnectionId) return false;'),
    ('if (FREE_PROVIDERS[providerId]?.noAuth && !hasCdRealConnection) {', 'if (FREE_PROVIDERS[providerId]?.noAuth && !hasCdRealConnection && !options.diagnosticConnectionId) {')
], 'const connections = options.diagnosticConnectionId')
edit('src/app/api/models/test/route.js', [
    ('import { getSettings } from "@/lib/localDb";', 'import { getSettings } from "@/lib/localDb";\nimport { assertTestingAllowed } from "@/lib/iqMonitor/testingPolicy";'),
    ('    if (probe === "iq") {', '''    const { getModelInfo: resolveTestModel } = await import("@/sse/services/model");
    const testInfo = await resolveTestModel(model, { inferFallback: false });
    if (!testInfo?.provider) return NextResponse.json({ error: "Unknown model route" }, { status: 400 });
    await assertTestingAllowed(testInfo.provider, "manual");
    if (probe === "iq") {'''),
    ('{ status: 400 }); }\n    }', '{ status: error.status || 400 }); }\n    }'),
    ('maxOutputTokens: 1024 }, null, "availability"', 'maxOutputTokens: 1024, testTrigger: "manual" }, null, "availability"'),
    ('{ status: 500 });\n  }', '{ status: err.status || 500 });\n  }')
], 'resolveTestModel')
edit('src/app/api/iq-monitor/route.js', [
    ('{ status: 400 }); }', '{ status: error.status || 400 }); }')
], 'error.status || 400')
edit('src/app/api/providers/[id]/test/testUtils.js', [
    ('import { getProviderConnectionById, updateProviderConnection }', 'import { assertTestingAllowed } from "@/lib/iqMonitor/testingPolicy";\nimport { getProviderConnectionById, updateProviderConnection }'),
    ('export async function testSingleConnection(id, options = {}) {', '''export async function testSingleConnection(id, options = {}) {
  const testingAccount = await getProviderConnectionById(id);
  if (!testingAccount) return { valid: false, error: "Connection not found" };
  await assertTestingAllowed(testingAccount.provider, "manual");''')
], 'const testingAccount')
edit('src/app/api/providers/[id]/test/route.js', [
    ('    console.log("Error testing connection:", error);', '    if (error.code === "TESTING_NOT_ALLOWED") return NextResponse.json({ valid: false, error: error.message }, { status: 403 });\n    console.log("Error testing connection:", error);')
], 'TESTING_NOT_ALLOWED')
edit('src/sse/handlers/chat.js', [
    ('import { isBusinessRequest }', 'import { assertTestingAllowed } from "@/lib/iqMonitor/testingPolicy";\nimport { isBusinessRequest }'),
    ('  const { provider, model } = modelInfo;','''  const { provider, model } = modelInfo;
  const observationSource = request?.headers?.get("x-10r-observation-source") || clientRawRequest?.headers?.["x-10r-observation-source"];
  if (observationSource === "fingerprint") {
    try { await assertTestingAllowed(provider, "manual"); }
    catch (error) { return errorResponse(error.status || 403, error.message); }
  }''')
], 'observationSource ===')

path = root / 'deploy.sh'
text = path.read_text(encoding='utf-8')
text = text.replace('PATCH_CHECKS=(\n', 'PATCH_CHECKS=(\n' + '\n'.join(checks) + '\n', 1)
path.write_text(text, encoding='utf-8', newline='\n')
print('Updated', len(checks), 'backend production files and PATCH_CHECKS')

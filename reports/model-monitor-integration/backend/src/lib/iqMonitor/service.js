import { randomUUID } from "node:crypto";
import { getSettings, getProviderConnections, getProviderNodes, getCustomModels, getModelAliases } from "@/lib/localDb";
import { getDisabledModels } from "@/lib/disabledModelsDb";
import { makeKv } from "@/lib/db/helpers/kvStore";
import { getModelsByProviderId } from "@/shared/constants/models";
import { AI_PROVIDERS, getProviderAlias } from "@/shared/constants/providers";
import { getProviderCustomModelRows } from "@/shared/utils/providerCustomModels";
import { validateConfig, runTick, classifyResult } from "./core";
import { getThinkingLevels } from "open-sse/providers/thinkingLevels.js";
import { probeTarget as probeManualTarget } from "./probe";
import { assertTestingAllowed } from "./testingPolicy";

const store = makeKv("iqMonitor");
const runtime = globalThis.__iqMonitorRuntime ||= { running: false };
const manualRuns = new Set();
let configWrite = Promise.resolve();

export async function getConfig() {
  const stored = await store.get("config");
  if (stored) return stored;
  const settings = await getSettings();
  return { enabled: false, intervalMinutes: 360, providers: [], questions: [{ question: settings.iqProbe.question, answer: settings.iqProbe.answer }] };
}

export async function getCatalog() {
  const [connections, nodes, customModels, modelAliases, disabled] = await Promise.all([getProviderConnections(), getProviderNodes(), getCustomModels(), getModelAliases(), getDisabledModels()]);
  return [...new Set(connections.map(connection => connection.provider))].map(id => {
    const alias = getProviderAlias(id);
    const names = new Set([id, alias]);
    const builtIns = (getModelsByProviderId(id) || []).filter(model => (!model.kind || model.kind === "llm") && (!model.type || model.type === "llm")).map(model => model.id);
    const custom = [...names].flatMap(providerAlias => getProviderCustomModelRows({ customModels, modelAliases, providerAlias, builtInModels: [] })).filter(model => model.enabled !== false).map(model => model.id);
    const blocked = new Set([...disabled[id] || [], ...disabled[alias] || [], ...customModels.filter(model => names.has(model.providerAlias) && model.enabled === false).map(model => model.id)]);
    const active = connections.some(connection => connection.provider === id && connection.isActive !== false);
    const scoped = connections.filter(connection => connection.provider === id && connection.isActive !== false).flatMap(connection => connection.providerSpecificData?.enabledModels || []);
    const models = active ? [...new Set([...builtIns, ...custom, ...scoped])].filter(model => model && !blocked.has(model)).sort() : [];
    return { id, name: nodes.find(node => node.id === id)?.name || AI_PROVIDERS[id]?.name || id, active, connections: connections.filter(connection => connection.provider === id).map(connection => ({ id: connection.id, name: connection.displayName || connection.name || connection.email || connection.id })), models, thinkingLevels: Object.fromEntries(models.map(model => [model, getThinkingLevels(id, model) || []])) };
  }).sort((left, right) => left.name.localeCompare(right.name));
}

export async function saveConfig(input) {
  const write = configWrite.then(() => persistConfig(input));
  configWrite = write.catch(() => {});
  return write;
}

async function persistConfig(input) {
  const config = validateConfig(input);
  const current = await getConfig();
  if (current.revision && input.revision !== current.revision) throw Object.assign(new Error("检测配置已被修改，请刷新后再保存"), { status: 409 });
  // Older callers must not silently erase the station testing permissions.
  if (!Object.hasOwn(input, "testingModes")) config.testingModes = current.testingModes || {};
  const catalog = await getCatalog();
  for (const selected of config.providers) {
    const provider = catalog.find(item => item.id === selected.id);
    if (!provider) throw new Error(`Unknown provider: ${selected.id}`);
    if (config.enabled && (!provider.active || !provider.models.length)) throw new Error(`No enabled models: ${provider.name}`);
    if (selected.mode === "selected" && selected.models.some(model => !provider.models.includes(model))) throw new Error(`Unavailable model: ${provider.name}`);
    for (const [model, level] of Object.entries(selected.modelThinking || {})) {
      const levels = provider.thinkingLevels[model];
      if (!Array.isArray(levels) || !levels.includes(level)) throw new Error("Unsupported thinking level: " + selected.id + "/" + model + " (" + level + ")");
    }
  }
  if (Object.keys(config.testingModes).some(id => !catalog.some(provider => provider.id === id))) throw new Error("Unknown testing provider");
  const saved = { ...config, revision: randomUUID() };
  await store.set("config", saved);
  return saved;
}

export async function getMonitor() {
  const [config, catalog, state, manualHistory] = await Promise.all([getConfig(), getCatalog(), store.get("state", {}), store.get("manualHistory", [])]);
  const history = [...manualHistory, ...(state.history || [])].sort((a, b) => b.at - a.at).slice(0, 500);
  return { config, catalog, state: { ...state, history }, running: runtime.running, capabilities: { modelThinking: true, manualTests: true, testingModes: true, targetedTests: true } };
}

export async function runManualMonitorTest(target, check, thinkingLevel) {
  if (!["iq", "availability"].includes(check)) throw new Error("Invalid test kind");
  await assertTestingAllowed(target?.provider, "manual");
  const key = JSON.stringify([target.provider, target.connectionId || "*", target.model]);
  if (manualRuns.has(key)) throw Object.assign(new Error("此渠道正在测试，请等待结果"), { status: 409 });
  manualRuns.add(key);
  try { return await executeManualTest(target, check, thinkingLevel); }
  finally { manualRuns.delete(key); }
}

async function executeManualTest(target, check, thinkingLevel) {
  const catalog = await getCatalog();
  const provider = catalog.find(item => item.id === target?.provider);
  if (!provider?.models.includes(target?.model)) throw new Error("Unavailable monitor model");
  if (check === "iq" && thinkingLevel && !provider.thinkingLevels[target.model]?.includes(thinkingLevel)) throw new Error("Unsupported thinking level");
  const config = await getConfig();
  const selection = config.providers.find(item => item.id === target.provider);
  if (target.connectionId) {
    const connections = await getProviderConnections();
    const account = connections.find(item => item.id === target.connectionId && item.provider === target.provider);
    if (!account || account.isActive === false) throw new Error("指定账号不存在、已停用或不属于此供应商");
    const scope = account.providerSpecificData?.enabledModels;
    if (Array.isArray(scope) && scope.length && !scope.includes(target.model)) throw new Error("指定账号未启用此模型");
    if (selection?.excludedConnectionIds?.includes(target.connectionId)) throw new Error("指定账号已被排除检测");
  }
  const question = check === "iq" ? (await getSettings()).iqProbe : null;
  const probeTargetInfo = { provider: target.provider, model: target.model, testTrigger: "manual", ...(target.connectionId && { connectionId: target.connectionId }), excludedConnectionIds: selection?.excludedConnectionIds || [], ...(check === "iq" && { thinkingLevel: thinkingLevel || null }) };
  let result;
  try { result = await probeManualTarget(probeTargetInfo, question, check); }
  catch (error) { result = { ok: false, error: error.name + ": " + error.message }; }
  const status = result.ok && check === "iq" && typeof result.iq?.correct !== "boolean" ? "ungraded" : classifyResult(result, check);
  const row = { ...probeTargetInfo, check, at: Date.now(), manual: true, persisted: true, ...(result.connectionId && { connectionId: result.connectionId }), status, score: status === "correct" ? 100 : status === "incorrect" ? 0 : null, answers: [{ ...(question || {}), ...result, httpStatus: result.status, status }] };
  // Keep manual records separate so a running scheduled tick cannot overwrite them.
  const write = (runtime.manualWrite || Promise.resolve()).then(async () => {
    const history = await store.get("manualHistory", []);
    await store.set("manualHistory", [row, ...history].slice(0, 500));
  });
  runtime.manualWrite = write.catch(() => {});
  await write;
  return { ...result, monitorRow: row };
}

export async function tickMonitor() {
  if (runtime.running) return { skipped: "running" };
  runtime.running = true;
  try {
    const current = await getConfig();
    const config = validateConfig(current);
    const state = await store.get("state", {});
    if (state.revision !== current.revision) state.nextAt = 0;
    state.revision = current.revision;
    const { probeTarget } = await import("./probe");
    const permitted = { ...config, providers: config.providers.filter(item => config.testingModes[item.id] === "scheduled") };
    return await runTick({ config: permitted, catalog: await getCatalog(), state, probe: probeTarget,
      save: value => store.set("state", value), clock: Date.now,
      pause: () => new Promise(resolve => setTimeout(resolve, 2000)),
      isCurrent: async () => { const latest = await getConfig(); return latest.enabled && latest.revision === current.revision; },
    });
  } finally { runtime.running = false; }
}

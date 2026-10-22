import { randomUUID } from "node:crypto";
import { makeKv } from "@/lib/db/helpers/kvStore.js";
import { getRequestError } from "@/shared/utils/requestOutcome.js";
import { newState, recordOutcome, setConfig, controlChannel, claimRecovery, decision, channelKey, rowStatus } from "./core.js";

const store = makeKv("modelAvailability");
let loaded;
let queue = Promise.resolve();
const recoveryOwners = new Map();
function gateFor(state, provider, connectionId, model) {
  const result = decision(state, provider, connectionId, model);
  if (!result.blocked && ["*", model].some(name => {
    const key = channelKey(provider, connectionId, name);
    return recoveryOwners.has(key) && state.channels[key]?.autoBlock;
  })) return { blocked: true, state: "recovering", reason: "一笔真实业务仍在执行，等待最终结果", until: null };
  return result;
}
async function load() { return loaded ||= store.get("state").then(value => value || newState()); }
async function mutate(fn) {
  const task = queue.then(async () => {
    const state = await load();
    const next = structuredClone(state);
    const result = await fn(next);
    if (result !== false) { await store.set("state", next); loaded = Promise.resolve(next); }
    return result;
  });
  queue = task.catch(() => {});
  return task;
}
export async function availabilityState() { await queue; return load(); }

export async function observeBusinessDetail(detail) {
  if (detail.observationSource !== "business" || !["success", "error", "failed", "truncated"].includes(detail.status)) return;
  await mutate(state => {
    let released = false;
    const startedAt = Date.parse(detail.timestamp) - Math.max(0, Number(detail.latency?.total) || 0);
    for (const model of ["*", detail.model]) {
      const key = channelKey(detail.provider, detail.connectionId, model);
      const owner = recoveryOwners.get(key);
      if (owner && startedAt >= owner.at) {
        recoveryOwners.delete(key);
        // Keep the expired marker for recordOutcome to recognize a failed
        // recovery, including a request that outlived the restart lease.
        if (state.channels[key]) state.channels[key].leaseUntil = 1;
        released = true;
      }
    }
    const changed = recordOutcome(state, { ...detail, error: getRequestError(detail), id: detail.id || randomUUID() });
    return changed || released;
  });
}

export async function updateAvailabilityConfig(input) {
  await mutate(state => {
    if (input.revision !== state.revision) { const error = new Error("规则已被其他页面修改，请刷新后重试"); error.status = 409; throw error; }
    setConfig(state, input.config);
    recoveryOwners.clear();
  });
  return getAvailability();
}

export async function changeAvailability(input) {
  const { getProviderConnectionById } = await import("@/lib/localDb");
  const connection = await getProviderConnectionById(input.connectionId);
  if (!connection || connection.provider !== input.provider) throw new Error("账号不存在或不属于此供应商");
  await mutate(state => { controlChannel(state, input); });
  return { ok: true };
}

export async function availabilityDecisions(provider, connections, model, allowRecovery = false) {
  if (!model) return new Map();
  const state = await availabilityState();
  return new Map(connections.map(connection => {
    const result = gateFor(state, provider, connection.id, model);
    if (!result.blocked && !allowRecovery && ["*", model].some(name => state.channels[channelKey(provider, connection.id, name)]?.autoBlock?.until)) {
      return [connection.id, { blocked: true, state: "waiting", reason: "等待真实业务请求确认恢复", until: null }];
    }
    return [connection.id, result];
  }));
}

export async function reserveBusinessRecovery(provider, connectionId, model) {
  const state = await availabilityState();
  const needed = ["*", model].some(name => state.channels[channelKey(provider, connectionId, name)]?.autoBlock?.until);
  if (!needed) return !gateFor(state, provider, connectionId, model).blocked;
  return mutate(next => {
    if (gateFor(next, provider, connectionId, model).blocked) return false;
    const claimed = claimRecovery(next, provider, connectionId, model);
    if (claimed) for (const name of ["*", model]) {
      const key = channelKey(provider, connectionId, name);
      if (next.channels[key]?.leaseUntil) recoveryOwners.set(key, { at: Date.now() });
    }
    return claimed;
  });
}

export async function getAvailability() {
  const { getProviderConnections, getProviderNodes, getCustomModels } = await import("@/lib/localDb");
  const { getDisabledModels } = await import("@/lib/disabledModelsDb");
  const { getModelsByProviderId } = await import("@/shared/constants/models");
  const { getProviderAlias, AI_PROVIDERS } = await import("@/shared/constants/providers");
  const { getDistribution, isDistributed } = await import("@/lib/distributionDb");
  const [state, connections, nodes, custom, disabled, distribution] = await Promise.all([availabilityState(), getProviderConnections(), getProviderNodes(), getCustomModels(), getDisabledModels(), getDistribution()]);
  const now = Date.now();
  const rows = [];
  const providers = [...new Set(connections.map(connection => connection.provider))].map(id => ({ id, name: nodes.find(node => node.id === id)?.name || AI_PROVIDERS[id]?.name || id }));
  for (const connection of connections) {
    const provider = connection.provider;
    const alias = getProviderAlias(provider);
    const prefix = nodes.find(node => node.id === provider)?.prefix || connection.providerSpecificData?.prefix || alias || provider;
    const observed = Object.values(state.channels).filter(row => row.connectionId === connection.id && row.model !== "*");
    const scope = connection.providerSpecificData?.enabledModels;
    const models = new Set([
      ...(Array.isArray(scope) && scope.length ? scope : [
        ...(getModelsByProviderId(provider) || []).filter(model => (!model.kind || model.kind === "llm") && (!model.type || model.type === "llm")).map(model => model.id),
        ...custom.filter(model => [provider, alias, prefix].includes(model.providerAlias) && (!model.type || model.type === "llm")).map(model => model.id),
      ]), ...observed.map(row => row.model),
    ]);
    if (!models.size) models.add("*");
    for (const model of models) {
      const row = state.channels[channelKey(provider, connection.id, model)] || { provider, connectionId: connection.id, model, successes: 0, failures: 0, consecutiveFailures: 0 };
      const gate = gateFor(state, provider, connection.id, model);
      const disabledByUser = connection.isActive === false || [provider, alias, prefix].some(key => disabled[key]?.includes(model)) || (Array.isArray(scope) && scope.length > 0 && !scope.includes(model));
      const account = state.channels[channelKey(provider, connection.id, "*")];
      rows.push({ ...row, key: channelKey(provider, connection.id, model), providerName: providers.find(item => item.id === provider)?.name, connectionName: connection.name || connection.displayName || connection.email || connection.id,
        routeId: model === "*" ? null : prefix + "/" + model,
        status: disabledByUser ? "disabled" : gate.blocked ? gate.state : rowStatus(state, row, now), disabledByUser,
        blocked: gate.blocked, blockReason: gate.reason, until: gate.until,
        manual: !!(row.manualBlock || account?.manualBlock), accountBlocked: !!account && decision(state, provider, connection.id, "*", now).blocked,
        publicationRequested: model !== "*" && isDistributed(prefix + "/" + model, distribution),
      });
    }
  }
  return { config: state.config, revision: state.revision, since: state.since, rows, providers, events: state.events, source: "business-requests-only", observedRequests: Object.values(state.channels).reduce((sum, row) => sum + (row.successes || 0) + (row.failures || 0), 0) };
}

export async function routeAvailability(ids, connections, state = null) {
  state ||= await availabilityState();
  if (!Object.values(state.channels).some(row => row.manualBlock || row.autoBlock)) return {};
  const { getModelInfo, getComboModels } = await import("@/sse/services/model");
  const memo = new Map();
  async function blocked(id, visited = new Set()) {
    if (visited.has(id)) return false;
    if (memo.has(id)) return memo.get(id);
    const next = new Set([...visited, id]);
    const combo = await getComboModels(id);
    if (combo?.length) {
      const members = combo.map(member => typeof member === "string" ? member : member.model || member.id).filter(Boolean);
      if (!members.length) return false;
      const result = (await Promise.all(members.map(member => blocked(member, next)))).every(Boolean);
      memo.set(id, result); return result;
    }
    const info = await getModelInfo(id, { inferFallback: false });
    if (!info?.provider || !info?.model) return false;
    const candidates = connections.filter(connection => connection.provider === info.provider && connection.isActive !== false && (!connection.providerSpecificData?.enabledModels?.length || connection.providerSpecificData.enabledModels.includes(info.model)));
    const result = candidates.length > 0 && candidates.every(connection => gateFor(state, info.provider, connection.id, info.model).blocked);
    memo.set(id, result); return result;
  }
  const result = {};
  for (const id of ids) if (await blocked(id)) result[id] = { blocked: true, reason: "所有候选账号均被可用性管理暂停" };
  return result;
}

export const DEFAULT_CONFIG = { mode: "observe", providers: [], failureThreshold: 3, windowMinutes: 15, cooldownMinutes: 10, staleHours: 24 };
export const channelKey = (provider, connectionId, model) => JSON.stringify([provider, connectionId, model]);
export const automaticFor = (config, provider) => config.mode === "auto" && config.providers.includes(provider);

export function validateConfig(input) {
  if (!input || !["observe", "auto"].includes(input.mode)) throw new Error("请选择观察或自动处理模式");
  if (!Array.isArray(input.providers) || input.providers.length > 200 || input.providers.some(id => typeof id !== "string" || !id || id.length > 300)) throw new Error("供应商范围无效");
  for (const [key, min, max] of [["failureThreshold", 2, 20], ["windowMinutes", 1, 1440], ["cooldownMinutes", 1, 1440], ["staleHours", 1, 720]]) {
    if (!Number.isInteger(input[key]) || input[key] < min || input[key] > max) throw new Error("规则参数无效：" + key);
  }
  return Object.fromEntries(Object.keys(DEFAULT_CONFIG).map(key => [key, key === "providers" ? [...new Set(input.providers)] : input[key]]));
}

export function classifyOutcome(detail) {
  if (detail.observationSource !== "business" || !detail.connectionId || !detail.provider || !detail.model) return null;
  if (!["success", "error", "failed", "truncated"].includes(detail.status)) return null;
  const error = detail.error || {};
  const status = Number(error.status ?? detail.response?.status);
  const text = [error.code, error.message].filter(Boolean).join(" ");
  if (status === 499 || /client.?cancel|client.?abort|responseaborted|user.?cancel|用户取消/i.test(text)) return null;
  if (status === 429) return { kind: "limited", reason: "上游限流或额度限制", status };
  if (/proxy|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|certificate|fetch failed|代理|证书/i.test(text)) return { kind: "network", reason: "链路异常，未自动隔离", status };
  if (detail.status === "success" && !error.message && !detail.response?.incomplete && !detail.response?.parseFailures) {
    const content = detail.response?.content;
    const thinking = detail.response?.thinking;
    const usable = typeof content === "string" ? !!content.trim() && !/^\[(Empty|Streaming)/i.test(content) : !!content && typeof content === "object" && Object.keys(content).length > 0;
    if (usable || (typeof thinking === "string" && thinking.trim())) return { kind: "success" };
    // Tool-only replies can have no final text. Without terminal evidence,
    // leave them ungraded rather than manufacturing a health failure.
    return null;
  }
  if (status === 401 && /invalid|expired|revoked|unauthorized|authentication|失效|无效|过期/i.test(text)) return { kind: "account", reason: "凭据失效，需人工处理", status };
  if ((status === 402 || status === 403) && /insufficient.?balance|balance.?insufficient|余额不足|欠费/i.test(text)) return { kind: "account", reason: "余额不足，需人工处理", status };
  if ([400, 404, 410].includes(status) && /model[_ -]?(not[_ -]?found|not[_ -]?supported|unavailable)|unknown model|model.*(does not exist|not supported|not available)|模型.*(不存在|下架|不支持)/i.test(text)) return { kind: "model", reason: "上游明确拒绝此模型，需人工复核", status };
  if (status >= 500 || detail.status === "truncated" || /timeout|timed out|stream_disconnected|失联|超时/i.test(text)) return { kind: "transient", reason: "上游超时或响应未完整结束", status };
  return { kind: "unknown", reason: "调用异常，等待人工核对", status };
}

export function newState(now = Date.now()) {
  return { revision: 0, since: now, config: { ...DEFAULT_CONFIG, providers: [] }, channels: {}, events: [], seen: [] };
}

export function decision(state, provider, connectionId, model, now = Date.now()) {
  for (const key of [channelKey(provider, connectionId, "*"), channelKey(provider, connectionId, model)]) {
    const row = state.channels[key];
    const block = row?.manualBlock || (automaticFor(state.config, provider) ? row?.autoBlock : null);
    if (!block) continue;
    if (block.until && block.until <= now) {
      if (row.leaseUntil > now) return { blocked: true, state: "recovering", key, reason: "一笔真实业务正在确认恢复", until: row.leaseUntil };
      continue;
    }
    return { blocked: true, state: block.until ? "cooling" : "isolated", key, reason: block.reason, until: block.until || null };
  }
  return { blocked: false };
}

export function addEvent(state, event, now) {
  state.events.unshift({ id: `${now}-${state.revision++}`, at: now, ...event });
  state.events = state.events.slice(0, 500);
}

export function recordOutcome(state, detail, now = Date.now()) {
  const outcome = classifyOutcome(detail);
  if (!outcome) return false;
  const id = detail.id;
  if (id && state.seen.includes(id)) return false;
  if (id) { state.seen.push(id); state.seen = state.seen.slice(-5000); }
  const { provider, connectionId, model } = detail;
  const key = channelKey(provider, connectionId, model);
  const row = state.channels[key] ||= { provider, connectionId, model, successes: 0, failures: 0, consecutiveFailures: 0, failureTimes: [] };
  const startedAt = Date.parse(detail.timestamp) - Math.max(0, Number(detail.latency?.total) || 0);
  const requestStartedAt = Number.isFinite(startedAt) ? startedAt : now;
  row.lastAt = now;
  row.lastRequestId = id || null;
  row.latencyMs = Number.isFinite(detail.latency?.total) ? detail.latency.total : null;
  row.lastOutcome = outcome.kind;
  if (outcome.kind === "success") {
    row.successes++;
    row.lastSuccess = now;
    row.lastError = null;
    if (requestStartedAt >= (row.controlAt || 0)) {
      row.consecutiveFailures = 0;
      row.failureTimes = [];
      for (const target of [row, state.channels[channelKey(provider, connectionId, "*")]]) {
        if (target?.autoBlock?.until && requestStartedAt >= target.autoBlock.at) {
          delete target.autoBlock; delete target.leaseUntil;
          addEvent(state, { action: "auto_restore", provider, connectionId, model: target.model, reason: "真实业务请求已成功完成", requestId: id }, now);
        }
      }
    }
    return true;
  }
  row.failures++;
  row.lastFailure = now;
  row.lastError = { message: detail.error?.message || outcome.reason, code: detail.error?.code, status: outcome.status || null };
  if (requestStartedAt < (row.controlAt || 0)) return true;
  const actionable = ["transient", "limited", "account", "model"].includes(outcome.kind);
  if (!actionable) { row.consecutiveFailures = 0; row.failureTimes = []; return true; }
  row.consecutiveFailures++;
  row.failureTimes = [...row.failureTimes.filter(time => time >= now - state.config.windowMinutes * 60000), now].slice(-20);
  if (!automaticFor(state.config, provider) || requestStartedAt < (state.autoSince || 0)) return true;
  const recovering = row.leaseUntil || state.channels[channelKey(provider, connectionId, "*")]?.leaseUntil;
  if (outcome.kind === "transient" && !recovering && row.failureTimes.length < state.config.failureThreshold) return true;
  const target = outcome.kind === "account"
    ? state.channels[channelKey(provider, connectionId, "*")] ||= { provider, connectionId, model: "*" }
    : row;
  if (requestStartedAt < (target.controlAt || 0) || target.manualBlock) return true;
  const until = ["account", "model"].includes(outcome.kind) ? null : now + state.config.cooldownMinutes * 60000;
  target.autoBlock = { at: now, until, reason: outcome.reason };
  delete target.leaseUntil;
  addEvent(state, { action: "auto_isolate", provider, connectionId, model: target.model, reason: outcome.reason, until, requestId: id }, now);
  return true;
}

export function setConfig(state, input, now = Date.now()) {
  const config = validateConfig(input);
  state.config = config;
  state.autoSince = now;
  for (const row of Object.values(state.channels)) {
    row.failureTimes = []; row.consecutiveFailures = 0; row.controlAt = now;
    delete row.autoBlock; delete row.leaseUntil;
  }
  addEvent(state, { action: "config", reason: config.mode === "observe" ? "已切换为仅观察" : "已更新自动处理范围，新请求开始累计判定" }, now);
}

export function controlChannel(state, { provider, connectionId, model, action, reason }, now = Date.now()) {
  if (![provider, connectionId, model].every(value => typeof value === "string" && value && value.length <= 300) || !["isolate", "release"].includes(action)) throw new Error("操作参数无效");
  const row = state.channels[channelKey(provider, connectionId, model)] ||= { provider, connectionId, model, successes: 0, failures: 0, consecutiveFailures: 0, failureTimes: [] };
  if (action === "isolate") row.manualBlock = { at: now, until: null, reason: String(reason || "人工暂停此渠道").slice(0, 200) };
  else { delete row.manualBlock; delete row.autoBlock; row.releasedAt = now; }
  delete row.leaseUntil;
  row.controlAt = now;
  row.consecutiveFailures = 0; row.failureTimes = [];
  addEvent(state, { action: "manual_" + action, provider, connectionId, model, reason: action === "release" ? "已解除本模块隔离，等待真实业务确认" : row.manualBlock.reason }, now);
}

export function claimRecovery(state, provider, connectionId, model, now = Date.now()) {
  if (decision(state, provider, connectionId, model, now).blocked) return false;
  if (!automaticFor(state.config, provider)) return true;
  for (const name of ["*", model]) {
    const row = state.channels[channelKey(provider, connectionId, name)];
    if (row?.autoBlock?.until && row.autoBlock.until <= now) row.leaseUntil = now + 120000;
  }
  return true;
}

export function rowStatus(state, row, now = Date.now()) {
  const gate = decision(state, row.provider, row.connectionId, row.model, now);
  if (gate.blocked) return gate.state;
  const account = state.channels[channelKey(row.provider, row.connectionId, "*")];
  if (automaticFor(state.config, row.provider) && [row, account].some(value => value?.autoBlock?.until && value.autoBlock.until <= now)) return "waiting";
  if ((row.lastAt || 0) < Math.max(row.releasedAt || 0, account?.releasedAt || 0)) return "unknown";
  if (!row.lastAt || now - row.lastAt > state.config.staleHours * 3600000) return "unknown";
  if (row.lastOutcome === "success") return "healthy";
  if (row.lastOutcome === "network") return "network";
  return "suspect";
}

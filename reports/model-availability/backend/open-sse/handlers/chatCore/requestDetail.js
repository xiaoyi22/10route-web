import { saveRequestUsage, appendRequestLog, saveRequestDetail } from "@/lib/usageDb.js";
import { COLORS } from "../../utils/stream.js";
import { canonicalizeUsage } from "../../utils/usageTracking.js";
import { getRequestResponseMode } from "@/shared/utils/requestResponseMode.js";
import { getRequestError, getRequestUsageSource } from "@/shared/utils/requestOutcome.js";
import { isBusinessRequest } from "@/shared/utils/businessObservation.js";

const OPTIONAL_PARAMS = [
  "temperature", "top_p", "top_k",
  "max_tokens", "max_completion_tokens",
  "thinking", "reasoning", "reasoning_effort", "reasoningEffort", "output_config",
  "enable_thinking", "thinking_level", "thinkingLevel",
  "presence_penalty", "frequency_penalty",
  "seed", "stop", "tools", "tool_choice",
  "response_format", "prediction", "store", "metadata",
  "n", "logprobs", "top_logprobs", "logit_bias",
  "user", "parallel_tool_calls"
];

function extractReasoningEffort(body) {
  if (!body || typeof body !== "object") return undefined;
  const candidates = [
    body.output_config?.effort,
    body.reasoning_effort,
    body.reasoningEffort,
    body.reasoning?.effort,
    body.reasoning?.level,
    body.thinking?.effort,
    body.thinking?.level,
    body.thinking?.type,
  ];
  return candidates.find((value) => (typeof value === "string" && value.trim()) || (typeof value === "number" && Number.isFinite(value)));
}

export function extractRequestConfig(body, stream) {
  const config = { messages: body.messages || [], model: body.model, stream };
  for (const param of OPTIONAL_PARAMS) {
    if (body[param] !== undefined) config[param] = body[param];
  }
  return config;
}

export function extractUsageFromResponse(responseBody) {
  if (!responseBody || typeof responseBody !== "object") return null;

  // Claude format
  if (responseBody.usage?.input_tokens !== undefined) {
    return {
      prompt_tokens: responseBody.usage.input_tokens || 0,
      completion_tokens: responseBody.usage.output_tokens || 0,
      cache_read_input_tokens: responseBody.usage.cache_read_input_tokens,
      cache_creation_input_tokens: responseBody.usage.cache_creation_input_tokens,
      ...(responseBody.usage.input_tokens_details?.cached_tokens !== undefined
        ? { cached_tokens: responseBody.usage.input_tokens_details.cached_tokens } : {}),
      ...(responseBody.usage.output_tokens_details?.reasoning_tokens !== undefined
        ? { reasoning_tokens: responseBody.usage.output_tokens_details.reasoning_tokens } : {})
    };
  }

  // OpenAI format
  if (responseBody.usage?.prompt_tokens !== undefined) {
    return {
      prompt_tokens: responseBody.usage.prompt_tokens || 0,
      completion_tokens: responseBody.usage.completion_tokens || 0,
      cached_tokens: responseBody.usage.prompt_tokens_details?.cached_tokens,
      reasoning_tokens: responseBody.usage.completion_tokens_details?.reasoning_tokens
    };
  }

  // Gemini format. Antigravity / gemini-cli wrap the payload in { response: {...} }.
  const usageMetadata = responseBody.usageMetadata || responseBody.response?.usageMetadata;
  if (usageMetadata) {
    return {
      prompt_tokens: usageMetadata.promptTokenCount || 0,
      completion_tokens: usageMetadata.candidatesTokenCount || 0,
      cached_tokens: usageMetadata.cachedContentTokenCount || 0,
      reasoning_tokens: usageMetadata.thoughtsTokenCount || 0
    };
  }

  return null;
}

export function extractUpstreamEndpoint(providerUrl) {
  if (typeof providerUrl !== "string" || !URL.canParse(providerUrl)) return undefined;
  const url = new URL(providerUrl);
  return ["http:", "https:"].includes(url.protocol) ? url.pathname : undefined;
}

export function extractResponseModel(providerResponse, response) {
  const sources = [providerResponse, response].filter((value) => value && typeof value === "object");
  for (const source of sources) {
    const candidates = [source.model, source.response?.model, source.modelVersion, source.response?.modelVersion];
    const found = candidates.find((value) => typeof value === "string" && value.trim());
    if (found) return found.trim();
  }
  return undefined;
}

export function isModelMismatch(model, responseModel) {
  if (!model || !responseModel) return false;
  const requested = String(model).replace(/^[^/]+\//, "").trim().toLowerCase();
  const actual = String(responseModel).replace(/^[^/]+\//, "").trim().toLowerCase();
  return Boolean(requested && actual && requested !== actual);
}

export function buildRequestDetail(base, overrides = {}) {
  const rawTokens = base.tokens || { prompt_tokens: 0, completion_tokens: 0 };
  const cached = rawTokens.cached_tokens ?? rawTokens.cache_read_input_tokens ?? rawTokens.prompt_tokens_details?.cached_tokens ?? 0;
  const cacheCreation = rawTokens.cache_creation_input_tokens ?? rawTokens.prompt_tokens_details?.cache_creation_input_tokens ?? 0;
  const canonicalTokens = {
    ...rawTokens,
    ...(cached > 0 && !rawTokens.cached_tokens ? { cached_tokens: cached } : {}),
    ...(cacheCreation > 0 && !rawTokens.cache_creation_input_tokens ? { cache_creation_input_tokens: cacheCreation } : {}),
  };
  return {
    provider: base.provider || "unknown",
    model: base.model || "unknown",
    connectionId: base.connectionId || undefined,
    timestamp: new Date().toISOString(),
    latency: base.latency || { ttft: 0, total: 0 },
    tokens: canonicalTokens,
    usageSource: getRequestUsageSource(base),
    error: getRequestError(base),
    responseMode: getRequestResponseMode(base),
    reasoningEffort: base.reasoningEffort || extractReasoningEffort(base.request) || extractReasoningEffort(base.body),
    endpoint: base.endpoint || base.clientRawRequest?.endpoint,
    observationSource: isBusinessRequest(base.clientRawRequest) ? "business" : "internal",
    upstreamEndpoint: base.upstreamEndpoint || base.clientRawRequest?.upstreamEndpoint,
    clientIp: base.clientIp || base.clientRawRequest?.clientIp,
    request: base.request,
    providerRequest: base.providerRequest || null,
    providerResponse: base.providerResponse || null,
    responseModel: base.responseModel || extractResponseModel(base.providerResponse, base.response),
    modelMismatch: base.modelMismatch !== undefined ? base.modelMismatch : isModelMismatch(base.model, base.responseModel || extractResponseModel(base.providerResponse, base.response)),
    response: base.response || {},
    pxpipe: base.pxpipe || undefined,
    status: base.status || "success",
    ...overrides
  };
}

// Build the "done" summary: duration, ttft, in/out tokens with cache breakdown
export function formatDoneLine({ usage, latency }) {
  const u = usage || {};
  const inTok = u.prompt_tokens ?? u.input_tokens ?? 0;
  const outTok = u.completion_tokens ?? u.output_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? u.cached_tokens ?? u.prompt_tokens_details?.cached_tokens ?? 0;
  const cacheCreate = u.cache_creation_input_tokens ?? 0;
  let inStr = `IN ${inTok}`;
  if (cacheRead || cacheCreate) {
    const parts = [];
    if (cacheRead) parts.push(`↻${cacheRead}`);
    if (cacheCreate) parts.push(`+${cacheCreate}`);
    inStr += ` (CACHE ${parts.join(" ")})`;
  }
  const ttftStr = latency?.ttft ? ` · TTFT ${latency.ttft}ms` : "";
  return `DONE ${latency?.total ?? 0}ms${ttftStr} · ${inStr} · OUT ${outTok}`;
}

export function saveUsageStats({ provider, model, tokens, connectionId, apiKey, endpoint, latency = null, usageKey = undefined, requestId = undefined, status = "ok", label = "USAGE", silent = false }) {
  if (!tokens || typeof tokens !== "object") return;

  const inTokens = tokens.input_tokens ?? tokens.prompt_tokens ?? 0;
  const outTokens = tokens.output_tokens ?? tokens.completion_tokens ?? 0;

  if (inTokens === 0 && outTokens === 0) return;

  if (!silent) {
    const time = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const accountSuffix = connectionId ? ` | account=${connectionId.slice(0, 8)}...` : "";
    console.log(`${COLORS.green}[${time}] 📊 [${label}] ${provider.toUpperCase()} | in=${inTokens} | out=${outTokens}${accountSuffix}${COLORS.reset}`);
  }

  // Canonicalize to one storage convention (prompt_tokens cache-inclusive) so
  // cached/cache-creation tokens survive to cost calc + stats. See canonicalizeUsage.
  const normalized = canonicalizeUsage(tokens) || {
    prompt_tokens: tokens.prompt_tokens ?? tokens.input_tokens ?? 0,
    completion_tokens: tokens.completion_tokens ?? tokens.output_tokens ?? 0
  };

  // Latency observation rides on the usage row itself (meta.latencyMs/ttftMs):
  // usageHistory rows outlive the requestDetails 200-record ring and travel
  // with gateway-synced imports, so dashboards on BOTH instances show real
  // speed instead of a dash. Same numbers the requestDetails record gets —
  // no second measurement, just a second home.
  const meta = {};
  meta.usageSource = getRequestUsageSource({ tokens });
  if (requestId) meta.requestId = requestId;
  if (latency && typeof latency.total === "number" && latency.total > 0) {
    meta.latencyMs = Math.round(latency.total);
    if (typeof latency.ttft === "number" && latency.ttft > 0) {
      meta.ttftMs = Math.round(latency.ttft);
    }
  }

  saveRequestUsage({
    provider: provider || "unknown",
    model: model || "unknown",
    tokens: normalized,
    timestamp: new Date().toISOString(),
    connectionId: connectionId || undefined,
    apiKey: apiKey || undefined,
    endpoint: endpoint || null,
    // Forward the dedup key: every call site stamps one per upstream attempt.
    // Without it two distinct requests landing in the same millisecond with
    // identical token counts collapse into one row (the legacy content-only
    // dedup silently ate the second).
    usageKey,
    status,
    meta: Object.keys(meta).length > 0 ? meta : undefined
  }).catch(() => {});
}

import "open-sse/index.js";
import { getExecutor } from "open-sse/executors/index.js";
import { handleChatCore } from "open-sse/handlers/chatCore.js";
import { getProviderCredentials } from "@/sse/services/auth";
import { checkAndRefreshToken, updateProviderCredentials } from "@/sse/services/tokenRefresh";
import { getSettings } from "@/lib/localDb";
import { getThinkingLevels } from "open-sse/providers/thinkingLevels.js";
import { judgeIqReply, extractCompletionText } from "@/app/api/models/test/ping";
import * as log from "@/sse/utils/logger";

export async function probeTarget({ provider, model, thinkingLevel, excludedConnectionIds = [], maxOutputTokens }, question, check = "iq") {
  const started = Date.now();
  if (check === "iq" && thinkingLevel && !getThinkingLevels(provider, model)?.includes(thinkingLevel)) throw new Error("Unsupported thinking level: " + provider + "/" + model + " (" + thinkingLevel + ")");
  const requestedModel = check === "iq" && thinkingLevel ? model + "(" + thinkingLevel + ")" : model;
  const excluded = new Set(excludedConnectionIds);
  const credentials = await getProviderCredentials(provider, excluded.size ? excluded : null, model);
  if (!credentials || credentials.allRateLimited) return { ok: false, status: credentials?.allRateLimited ? 429 : 503, error: "No available account for selected provider" };
  if (excluded.has(credentials.connectionId || credentials.id)) return { ok: false, status: 503, error: "Selected account is excluded from IQ monitoring" };
  const refreshed = await checkAndRefreshToken(provider, credentials);
  const executor = getExecutor(provider);
  const limitedExecutor = Object.create(executor);
  const deadline = AbortSignal.timeout(60000);
  limitedExecutor.execute = options => executor.execute({ ...options, signal: AbortSignal.any([options.signal, deadline].filter(Boolean)) });
  const settings = await getSettings();
  const prompt = check === "availability" ? "Reply with PONG." : question.question + "\nReturn the final answer as: IQ-ANSWER: <number>";
  const responses = provider.startsWith("openai-compatible-responses-");
  const maxTokens = maxOutputTokens ?? (check === "availability" ? 256 : 4096);
  const body = { model: provider + "/" + requestedModel, stream: false, ...(responses
    ? { max_output_tokens: maxTokens, input: prompt }
    : { max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }) };
  const result = await handleChatCore({ body, modelInfo: { provider, model: requestedModel }, credentials: refreshed, connectionId: credentials.connectionId,
    sourceFormatOverride: responses ? "openai-responses" : "openai", userAgent: "10router-iq-monitor", log, _executorOverride: limitedExecutor,
    providerThinking: settings.providerThinking?.[provider] || null,
    clientRawRequest: { endpoint: "/api/iq-monitor", body, headers: {} },
    onCredentialsRefreshed: newCredentials => updateProviderCredentials(credentials.connectionId, { ...newCredentials, existingProviderSpecificData: credentials.providerSpecificData }),
  });
  const response = result.response;
  const latencyMs = Date.now() - started;
  if (!response) return { ok: false, status: result.status || 500, error: String(result.error || "No response"), latencyMs };
  if (!response.ok) { await response.body?.cancel(); return { ok: false, status: response.status, error: `HTTP ${response.status}`, latencyMs }; }
  const parsed = await response.json();
  if (parsed.error) return { ok: false, status: 502, error: "Upstream returned an error", latencyMs };
  const content = extractCompletionText(parsed);
  if (check === "availability") return content.trim()
    ? { ok: true, status: response.status, latencyMs, connectionId: credentials.connectionId, content: content.slice(0, 2000) }
    : { ok: false, status: 502, latencyMs, connectionId: credentials.connectionId, error: "Empty model reply" };
  return judgeIqReply(content, question.answer, { status: response.status, latencyMs, connectionId: credentials.connectionId });
}

export function validateConfig(input) {
  if (!input || typeof input.enabled !== "boolean") throw new Error("Invalid enabled flag");
  if (!Number.isInteger(input.intervalMinutes) || input.intervalMinutes < 1 || input.intervalMinutes > 10080) throw new Error("Interval must be 1-10080 whole minutes");
  if (!Array.isArray(input.providers) || input.providers.length > 200) throw new Error("Invalid providers");
  const testingModes = input.testingModes || {};
  if (typeof testingModes !== "object" || Array.isArray(testingModes) || Object.keys(testingModes).length > 500 || Object.entries(testingModes).some(([id, mode]) => !id || id.length > 300 || !["observe", "manual", "scheduled"].includes(mode))) throw new Error("Invalid testing modes");
  const providers = input.providers.map(item => {
    if (!item || typeof item.id !== "string" || !item.id || !["all", "selected"].includes(item.mode)) throw new Error("Invalid provider selection");
    if (!Array.isArray(item.models) || item.models.some(model => typeof model !== "string" || !model || model.length > 300)) throw new Error("Invalid models");
    if (item.mode === "selected" && !item.models.length) throw new Error("Select at least one model");
    if (item.excludedConnectionIds !== undefined && (!Array.isArray(item.excludedConnectionIds) || item.excludedConnectionIds.length > 500 || item.excludedConnectionIds.some(id => typeof id !== "string" || !id || id.length > 300))) throw new Error("Invalid excluded accounts");
    if (item.checks !== undefined && (!Array.isArray(item.checks) || !item.checks.length || item.checks.some(check => !["iq", "availability"].includes(check)))) throw new Error("Select IQ or availability check");
    let modelChecks;
    if (item.modelChecks !== undefined) {
      if (!item.modelChecks || typeof item.modelChecks !== "object" || Array.isArray(item.modelChecks) || Object.keys(item.modelChecks).length > 2000) throw new Error("Invalid model bindings");
      modelChecks = Object.fromEntries(Object.entries(item.modelChecks).map(([model, checks]) => {
        if (!model || model.length > 300 || !Array.isArray(checks) || checks.some(check => !["iq", "availability"].includes(check))) throw new Error("Invalid model checks");
        return [model, [...new Set(checks)]];
      }));
    }
    let modelThinking;
    if (item.modelThinking !== undefined) {
      if (!item.modelThinking || typeof item.modelThinking !== "object" || Array.isArray(item.modelThinking) || Object.keys(item.modelThinking).length > 2000) throw new Error("Invalid model thinking strengths");
      modelThinking = Object.fromEntries(Object.entries(item.modelThinking).map(([model, level]) => {
        if (!model || model.length > 300 || typeof level !== "string" || !/^[a-z]{1,20}$/.test(level)) throw new Error("Invalid model thinking strength");
        return [model, level];
      }));
    }
    return { id: item.id, mode: item.mode, models: [...new Set(item.models)], ...(modelChecks !== undefined && { modelChecks }), ...(modelThinking !== undefined && { modelThinking }), ...(item.excludedConnectionIds !== undefined && { excludedConnectionIds: [...new Set(item.excludedConnectionIds)] }), ...(item.checks !== undefined && { checks: [...new Set(item.checks)] }) };
  });
  if (new Set(providers.map(item => item.id)).size !== providers.length) throw new Error("Duplicate provider");
  if (input.enabled && !providers.length) throw new Error("Select at least one provider");
  if (!Array.isArray(input.questions) || !input.questions.length || input.questions.length > 20) throw new Error("Configure 1?20 questions");
  const questions = input.questions.map(item => {
    if (typeof item?.question !== "string" || !item.question.trim() || item.question.length > 10000) throw new Error("Invalid question");
    const answer = String(item.answer ?? "").trim();
    if (!/^-?\d+(?:\.\d+)?$/.test(answer) || !Number.isFinite(Number(answer))) throw new Error("Expected answer must be a number");
    return { question: item.question.trim(), answer };
  });
  return { enabled: input.enabled, intervalMinutes: input.intervalMinutes, providers, questions, testingModes: { ...testingModes } };
}

export function selectTargets(config, catalog) {
  return config.providers.flatMap(selection => {
    const provider = catalog.find(item => item.id === selection.id);
    return (provider?.models || []).filter(model => selection.mode === "all" || selection.models.includes(model)).flatMap(model => {
      const checks = Object.hasOwn(selection.modelChecks || {}, model) ? selection.modelChecks[model] : selection.checks;
      if (checks?.length === 0) return [];
      const thinkingLevel = Object.hasOwn(selection.modelThinking || {}, model) ? selection.modelThinking[model] : undefined;
      return [{ provider: selection.id, model, ...(thinkingLevel && { thinkingLevel }), ...(selection.excludedConnectionIds !== undefined && { excludedConnectionIds: selection.excludedConnectionIds }), ...(checks !== undefined && { checks }) }];
    });
  });
}

export function classifyResult(result, check = "iq") {
  if (result.ok) return check === "availability" ? "available" : result.iq?.correct ? "correct" : "incorrect";
  if (result.status === 429) return "rate_limited";
  if (/timeout|timed out|aborted/i.test(result.error || "")) return "timeout";
  return "error";
}

export async function runTick({ config, catalog, state, now = Date.now(), probe, save, isCurrent = async () => true, pause = async () => {}, clock = () => now }) {
  if (!config.enabled || (state.nextAt || 0) > now) return state;
  const next = { ...state, history: [...(state.history || [])], backoff: { ...state.backoff }, startedAt: now, nextAt: now + config.intervalMinutes * 60000 };
  await save(next);
  for (const target of selectTargets(config, catalog)) {
    if ((next.backoff[target.provider] || 0) > clock()) continue;
    const { thinkingLevel, ...withoutThinking } = target;
    for (const check of target.checks || ["iq"]) {
      if ((next.backoff[target.provider] || 0) > clock()) break;
      const checkTarget = check === "iq" ? target : withoutThinking;
      const answers = [];
      for (const question of check === "iq" ? config.questions : [null]) {
        if (!await isCurrent()) return next;
        let result;
        try { result = await probe(checkTarget, question, check); }
        catch (error) { result = { ok: false, error: error.name + ": " + error.message }; }
        const status = classifyResult(result, check);
        answers.push({ ...(question || {}), ...result, status });
        if (status === "rate_limited") {
          next.backoff[target.provider] = clock() + Math.max(config.intervalMinutes * 120000, 3600000);
          break;
        }
        await pause();
      }
      const failure = answers.find(answer => !answer.ok);
      const score = check === "availability" || failure ? null : Math.round(answers.filter(answer => answer.iq?.correct).length / config.questions.length * 100);
      const previous = check === "iq" && next.history.find(row => row.provider === target.provider && row.model === target.model && (row.check || "iq") === "iq" && (row.thinkingLevel ?? null) === (thinkingLevel ?? null) && row.score !== null && JSON.stringify(row.answers.map(({ question, answer }) => ({ question, answer }))) === JSON.stringify(config.questions));
      next.history.unshift({ ...checkTarget, ...(check === "iq" && { thinkingLevel: thinkingLevel ?? null }), check, at: clock(), score, change: score !== null && previous ? score - previous.score : null, status: failure?.status || (check === "availability" ? "available" : score === 100 ? "correct" : "incorrect"), answers });
      next.history = next.history.slice(0, 500);
      await save(next);
    }
  }
  next.completedAt = clock();
  next.nextAt = clock() + config.intervalMinutes * 60000;
  await save(next);
  return next;
}

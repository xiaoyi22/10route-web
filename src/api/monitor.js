export const checkNames = { availability: '模型测活', iq: '智商检测' };
export const resultNames = { available: '可用', correct: '全部答对', incorrect: '有题答错', rate_limited: '限流', timeout: '超时', error: '接口故障', ungraded: '未评分' };
export const resultTone = status => ['available', 'correct'].includes(status) ? 'healthy' : ['incorrect', 'rate_limited'].includes(status) ? 'warning' : ['pending', 'ungraded'].includes(status) ? 'unknown' : 'error';

export function explicitMonitorConfig(config, catalog) {
  return { ...structuredClone(config), providers: (config.providers || []).map(selection => {
    const candidates = selection.mode === 'all' ? catalog.find(provider => provider.id === selection.id)?.models || [] : selection.models || [];
    const modelChecks = Object.fromEntries(candidates.map(model => [model, Object.hasOwn(selection.modelChecks || {}, model) ? selection.modelChecks[model] : selection.checks || ['iq']]));
    return { ...selection, mode: 'selected', models: candidates.filter(model => modelChecks[model].length), modelChecks };
  }) };
}

export function toggleMonitorModel(selection, model, check, enabled) {
  const current = selection.modelChecks?.[model] || [];
  const modelChecks = { ...selection.modelChecks, [model]: enabled ? [...new Set([...current, check])] : current.filter(value => value !== check) };
  return { ...selection, modelChecks, models: Object.keys(modelChecks).filter(key => modelChecks[key].length) };
}

export function monitorTargets(config, catalog) {
  return (config.providers || []).flatMap(selection => {
    const models = catalog.find(provider => provider.id === selection.id)?.models || [];
    return models.filter(model => selection.mode === 'all' || selection.models.includes(model)).flatMap(model => {
      const checks = Object.hasOwn(selection.modelChecks || {}, model) ? selection.modelChecks[model] : selection.checks || ['iq'];
      return checks.map(check => ({ provider: selection.id, model, check }));
    });
  });
}

export function recentChecks(history, provider, model, check) {
  return history.filter(row => row.provider === provider && row.model === model && (row.check || 'iq') === check).sort((a, b) => b.at - a.at).slice(0, 30);
}

export function checkLatency(row) {
  if (!row?.answers?.length || row.answers.some(answer => typeof answer.latencyMs !== 'number' || !Number.isFinite(answer.latencyMs))) return null;
  return row.answers.reduce((sum, answer) => sum + answer.latencyMs, 0);
}

export function manualCheckRow(result, target, check, at = Date.now()) {
  const status = result.ok ? check === 'iq' ? typeof result.iq?.correct !== 'boolean' ? 'ungraded' : result.iq.correct ? 'correct' : 'incorrect' : 'available'
    : result.status === 429 ? 'rate_limited' : /timeout|timed out|aborted/i.test(result.error || '') ? 'timeout' : 'error';
  return { ...target, check, at, manual: true, status, score: status === 'correct' ? 100 : status === 'incorrect' ? 0 : null, answers: [{ ...result, httpStatus: result.status, status }] };
}

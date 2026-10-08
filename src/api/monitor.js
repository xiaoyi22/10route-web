import { requestJson } from './client.js';

export function monitorThinkingOptions(levels) {
  return levels == null ? ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] : Array.isArray(levels) ? levels : [];
}

export async function saveMonitorConfig(config, request = requestJson) {
  const selections = (config.providers || []).filter(provider => provider.modelThinking !== undefined);
  if (selections.some(provider => Object.keys(provider.modelThinking).length)) {
    const current = await request('/api/iq-monitor');
    if (current.capabilities?.modelThinking !== true) throw new Error('当前后端尚不支持保存思考强度，请升级后端；单次检测仍可手动选择。检测计划未写入。');
  }
  const verify = saved => {
    for (const provider of selections) {
      const actual = saved?.providers?.find(item => item.id === provider.id)?.modelThinking || {};
      const expected = provider.modelThinking;
      if (Object.keys(actual).length !== Object.keys(expected).length || Object.entries(expected).some(([model, level]) => actual[model] !== level)) {
        throw new Error('思考强度未完整保存，后端可能不支持此设置。其他计划设置可能已写入，请刷新核对后重试。');
      }
    }
  };
  const result = await request('/api/iq-monitor', { method: 'PUT', body: JSON.stringify(config) });
  verify(result.config);
  if (selections.length) verify((await request('/api/iq-monitor')).config);
  return result;
}

export const checkNames = { availability: '模型测活', iq: '智商检测' };
export const thinkingNames = { '': '默认（沿用网关）', none: '关闭（none）', minimal: '极低（minimal）', low: '低（low）', medium: '中（medium）', high: '高（high）', xhigh: '很高（xhigh）', max: '最高（max）', ultra: '超高（ultra）', thinking: '开启思考（thinking）' };
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
      const thinkingLevel = Object.hasOwn(selection.modelThinking || {}, model) ? selection.modelThinking[model] : undefined;
      return checks.map(check => ({ provider: selection.id, model, check, ...(check === 'iq' && thinkingLevel && { thinkingLevel }) }));
    });
  });
}

export function recentChecks(history, provider, model, check) {
  return history.filter(row => row.provider === provider && row.model === model && (row.check || 'iq') === check).sort((a, b) => b.at - a.at).slice(0, 30);
}

export function summarizeMonitorChecks(history, targets, check) {
  const scope = new Set(targets.filter(target => (target.check || 'iq') === check).map(target => JSON.stringify([target.provider, target.model])));
  const recent = history.filter(row => scope.has(JSON.stringify([row.provider, row.model])) && (row.check || 'iq') === check && Number.isFinite(row.at)).sort((first, second) => second.at - first.at).slice(0, 30);
  const passed = recent.filter(row => ['available', 'correct'].includes(row.status)).length;
  const failed = recent.filter(row => ['incorrect', 'rate_limited', 'timeout', 'error'].includes(row.status)).length;
  const graded = passed + failed;
  return { total: recent.length, passed, failed, ungraded: recent.length - graded, passRate: graded ? passed / graded * 100 : null };
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

export const cliTools = [
  ['claude', 'Claude Code', 'Claude 模型档位与上下文'], ['codex', 'Codex', '主模型、子任务模型与配置档案'],
  ['opencode', 'OpenCode', '多模型配置与默认模型'], ['droid', 'Droid', 'Factory 自定义模型'],
  ['openclaw', 'OpenClaw', '默认模型与代理角色'], ['hermes', 'Hermes Agent', '主模型、委派和辅助模型'],
  ['cowork', 'Cowork', '桌面模型与工具插件'], ['cline', 'Cline', '计划与执行模型'],
  ['kilo', 'Kilo Code', '兼容接口与模型'], ['deepseek-tui', 'DeepSeek TUI', '终端模型配置'],
  ['jcode', 'JCode', '供应商与模型目录'], ['grok-build', 'Grok Build', '模型与上下文'],
  ['copilot', 'GitHub Copilot', '编辑器模型目录'], ['devin', 'Devin', '安装与原生登录状态'],
];
export const multiModelTools = new Set(['opencode', 'droid', 'cowork', 'jcode', 'copilot']);

export function cliPayload(tool, form, apiKey, status) {
  const baseUrl = form.baseUrl.trim().replace(/\/+$/, '');
  if (tool === 'claude') return { env: { ANTHROPIC_BASE_URL: baseUrl, ANTHROPIC_AUTH_TOKEN: apiKey, ANTHROPIC_DEFAULT_OPUS_MODEL: form.opus || form.model, ANTHROPIC_DEFAULT_SONNET_MODEL: form.sonnet || form.model, ANTHROPIC_DEFAULT_HAIKU_MODEL: form.haiku || form.model }, maxContextTokens: form.context || '', exaMcpEnabled: form.exa };
  const result = { baseUrl, apiKey, model: form.model };
  if (multiModelTools.has(tool)) { result.models = [...new Set([form.model, ...form.models].filter(Boolean))]; result.activeModel = form.model; }
  if (['codex', 'opencode'].includes(tool)) result.subagentModel = form.subagent || '';
  if (tool === 'grok-build') { if (form.context) result.contextWindow = Number(form.context); result.subagentModels = form.roles; }
  if (tool === 'hermes') result.selections = [{ role: 'default', model: form.model }, ...Object.entries(form.roles).filter(([, model]) => model).map(([role, model]) => ({ role, model }))];
  if (tool === 'openclaw') result.agentModels = form.roles;
  if (tool === 'cowork') {
    result.plugins = (status?.defaultPlugins || []).filter(plugin => form.plugins.includes(plugin.name));
    result.localPlugins = form.localPlugins;
    result.customPlugins = status?.cowork?.customPlugins || [];
  }
  return result;
}

// Matches the backend OAuth provider registry and its dedicated import routes.
export const deviceProviders = new Set(['github', 'kiro', 'kimi', 'kilocode', 'codebuddy-cn', 'codebuddy-intl', 'qoder', 'qoder-cn', 'grok-cli']);
export const proxyProviders = new Set(['trae', 'windsurf', 'zed']);
export const mimoProviders = new Set(['xiaomi-mimo', 'mimo-desktop']);
export const oauthProviders = ['claude', 'codex', 'xai', 'grok-cli', 'gemini-cli', 'antigravity', 'iflow', 'qoder', 'qoder-cn', 'github', 'kiro', 'cursor', 'kimi', 'kilocode', 'cline', 'clinepass', 'gitlab', 'codebuddy-cn', 'codebuddy-intl', 'kimchi', 'trae', 'windsurf', 'zed', 'xiaomi-mimo', 'mimo-desktop'];

export const tokenImports = {
  codex: { action: 'import-token', fields: [['accessToken', '访问令牌', true, true], ['name', '账号名称']] },
  cursor: { action: 'import', fields: [['accessToken', '访问令牌', true, true], ['machineId', '设备 ID', false, true]] },
  zed: { action: 'import', fields: [['accessToken', '访问令牌', true, true], ['userId', '用户 ID', false, true], ['systemId', '设备 ID']] },
  kiro: { action: 'import', fields: [['refreshToken', '刷新令牌', true, true], ['clientId', '客户端 ID'], ['clientSecret', '客户端密钥', true], ['region', '区域'], ['authMethod', '认证方式'], ['profileArn', '配置 ARN']] },
  trae: { action: 'exchange', fields: [['code', 'Cloud-IDE-JWT 令牌', true, true]] },
  windsurf: { action: 'exchange', fields: [['code', 'Windsurf API 密钥', true, true]] },
  iflow: { action: 'cookie', fields: [['cookie', '包含 BXAuth 的 Cookie', true, true]] },
  gitlab: { action: 'pat', fields: [['token', '个人访问令牌', true, true], ['baseUrl', 'GitLab 地址']] },
  'xiaomi-mimo': { action: 'api-key', fields: [['apiKey', 'MiMo API 密钥', true, true], ['uid', '用户 ID'], ['baseUrl', '接口地址']] },
  'mimo-desktop': { provider: 'xiaomi-mimo', action: 'api-key', fields: [['apiKey', 'MiMo API 密钥', true, true], ['mimoPassToken', '桌面会话令牌', true], ['mimoUserId', '桌面用户 ID'], ['mimoCUserId', '桌面加密用户 ID']] },
};

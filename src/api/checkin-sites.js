const anyrouter = Object.freeze({ name: 'AnyRouter', baseUrl: 'https://anyrouter.top', protocol: 'legacy', checkinPath: '/api/user/sign_in' });

export function getCheckinSitePreset(baseUrl) {
  try {
    const url = new URL(baseUrl);
    return url.origin === anyrouter.baseUrl && url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash ? anyrouter : null;
  } catch { return null; }
}

export function getCheckinConfigurationIssue(account) {
  const preset = getCheckinSitePreset(account.baseUrl);
  return preset && account.checkinPath === '/api/user/checkin' ? 'AnyRouter 不使用 /api/user/checkin，请编辑账号并应用 /api/user/sign_in 推荐配置' : null;
}

export function getCheckinCookieIssue(cookie) {
  const valid = typeof cookie === 'string' && cookie.split(';').every(part => {
    const separator = part.indexOf('=');
    return separator > 0 && /^[!#$%&'*+.^_|~0-9A-Za-z-]+$/.test(part.slice(0, separator).trim());
  });
  return valid ? null : 'Cookie 须为完整请求头，例如 session=会话值；不能只填写会话值或包含 Cookie: 前缀';
}

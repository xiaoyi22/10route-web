// 真实网关只读探测：登录后仅发 GET，不修改任何配置；输出只含结构与计数，不含密钥。
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';

const base = 'http://192.168.11.150:4317';
const env = parseEnv(await readFile(resolve(process.env.USERPROFILE, '.codex/credentials/10router-web.env'), 'utf8'));
const password = env.TENROUTER_TEST_PASSWORD;
if (!password) throw new Error('凭据缺失');
const status = await (await fetch(`${base}/api/auth/status`)).json();
console.log('auth', { demo: status.demo, requireLogin: status.requireLogin, authMode: status.authMode });
const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
console.log('login', login.status);
const cookie = login.headers.getSetCookie().map(item => item.split(';')[0]).join('; ');
if (!cookie) throw new Error('未获得会话 Cookie');
const get = async path => {
  const response = await fetch(base + path, { headers: { cookie } });
  const text = await response.text();
  let body; try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
  return { status: response.status, body };
};
const providers = await get('/api/providers');
const connections = providers.body?.connections || [];
console.log('providers', { status: providers.status, count: connections.length, keys: Object.keys(connections[0] || {}) });
console.log('providerSpecificData keys', [...new Set(connections.flatMap(c => Object.keys(c.providerSpecificData || {})))]);
console.log('compatible connections', connections.filter(c => /compatible/.test(c.provider)).map(c => ({ provider: c.provider, enabled: Array.isArray(c.providerSpecificData?.enabledModels) ? c.providerSpecificData.enabledModels.length : c.providerSpecificData?.enabledModels })));
const distribution = await get('/api/models/distribution');
console.log('distribution', { status: distribution.status, mode: distribution.body?.mode, models: distribution.body?.models?.length, catalog: distribution.body?.catalog?.length });
const keys = await get('/api/keys');
console.log('keys', { status: keys.status, count: keys.body?.keys?.length });
const models = await get('/api/models');
console.log('models', { status: models.status, count: models.body?.models?.length ?? Object.keys(models.body || {}).length });
const monitor = await get('/api/iq-monitor');
console.log('iq-monitor', { status: monitor.status, capabilities: monitor.body?.capabilities, catalog: monitor.body?.catalog?.length });

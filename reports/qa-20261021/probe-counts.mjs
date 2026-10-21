// 核对真实网关的供应商分组数 / 账号数 / Qoder 目录，判断用例里的硬编码计数是否已过期。
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';
import { normalizeProviders } from '../../src/api/client.js';
import { providerInfo } from '../../src/api/providers.js';

const base = 'http://192.168.11.150:4317';
const env = parseEnv(await readFile(resolve(process.env.USERPROFILE, '.codex/credentials/10router-web.env'), 'utf8'));
const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: env.TENROUTER_TEST_PASSWORD }) });
const cookie = login.headers.getSetCookie().map(item => item.split(';')[0]).join('; ');
const get = async path => (await fetch(base + path, { headers: { cookie } })).json();
const nodes = await get('/api/provider-nodes');
const providers = await get('/api/providers');
const connections = normalizeProviders(providers);
const groups = new Map();
for (const connection of connections) {
  const info = providerInfo(connection.provider, nodes.nodes, connection);
  groups.set(info.id, (groups.get(info.id) || 0) + 1);
}
console.log('connections', connections.length, 'groups', groups.size);
console.log('groups', JSON.stringify([...groups.entries()]));
const custom = await get('/api/models/custom');
console.log('custom qd/ultimate', JSON.stringify(custom.models?.filter(model => model.providerAlias === 'qd').slice(0, 5).map(model => model.id)));
const qoderConnections = connections.filter(connection => connection.provider === 'qoder');
console.log('qoder connections', qoderConnections.length, qoderConnections.map(item => item.name));
if (qoderConnections[0]) {
  const catalog = await get(`/api/providers/${qoderConnections[0].id}/models`);
  console.log('qoder catalog models', catalog.models?.length, JSON.stringify(catalog.models?.slice(0, 4)));
}

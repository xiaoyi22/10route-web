import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadTool } from './runtime-tools.mjs';
import { startFixtureServer } from './fixture-server.mjs';

const { createServer, loadEnv, preview } = await loadTool('vite');
const root = fileURLToPath(new URL('..', import.meta.url));
const env = { ...loadEnv('development', root, ''), ...process.env };
const backend = process.argv.includes('--demo') ? '' : env.TENROUTER_BACKEND_URL;
for (const key of ['TENROUTER_ENABLE_MANAGEMENT', 'TENROUTER_MODEL_BASE_URL', 'TENROUTER_PORT', 'TENROUTER_HERMES_URL', 'TENROUTER_HERMES_TOKEN', 'TENROUTER_HERMES_TOKEN_FILE', 'TENROUTER_SYSTEM_SSH_TARGET', 'TENROUTER_SYSTEM_SSH_IDENTITY', 'TENROUTER_CHECKIN_DIR']) {
  if (env[key]) process.env[key] = env[key];
}
let fixture;
if (backend) {
  const url = new URL(backend);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('后端地址须为不含凭据的 http(s) origin');
  process.env.TENROUTER_INTERNAL_TARGET = url.origin;
  process.env.TENROUTER_DATA_MODE = 'readonly';
} else {
  fixture = await startFixtureServer();
  process.env.TENROUTER_INTERNAL_TARGET = fixture.url;
  process.env.TENROUTER_DATA_MODE = 'demo';
}
const isPreview = process.argv.includes('--preview');
const options = { root, configFile: resolve(root, 'vite.config.js') };
const server = isPreview ? await preview(options) : await createServer(options);
if (!isPreview) await server.listen();
console.log(backend ? `后端接入模式：${env.TENROUTER_ENABLE_MANAGEMENT === '1' ? '核心管理接口已开放' : '只读访问'}。` : '隔离演示模式：内存服务，无真实数据库/凭据。演示密码：linear-demo');
server.printUrls();
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  if (isPreview) await new Promise(resolveClose => server.httpServer.close(resolveClose));
  else await server.close();
  await fixture?.close();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

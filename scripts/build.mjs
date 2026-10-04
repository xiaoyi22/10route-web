import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadTool } from './runtime-tools.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const { build, loadEnv } = await loadTool('vite');
const env = { ...loadEnv('production', root, ''), ...process.env };
for (const key of ['TENROUTER_ENABLE_MANAGEMENT', 'TENROUTER_MODEL_BASE_URL']) {
  if (env[key]) process.env[key] = env[key];
}
if (env.TENROUTER_BACKEND_URL) {
  const url = new URL(env.TENROUTER_BACKEND_URL);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('后端地址须为不含凭据的 http(s) origin');
  process.env.TENROUTER_INTERNAL_TARGET = url.origin;
  process.env.TENROUTER_DATA_MODE = 'readonly';
}
await build({ root, configFile: resolve(root, 'vite.config.js') });

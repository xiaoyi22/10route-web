import { loadTool, defaultToolchain } from './scripts/runtime-tools.mjs';
import { isAllowedRequest } from './src/api/policy.js';
import { createHermesBridge } from './scripts/hermes-bridge.mjs';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

export default async () => {
  const { default: react } = await loadTool('@vitejs/plugin-react');
  const { default: tailwindcss } = await loadTool('@tailwindcss/vite');
  const target = process.env.TENROUTER_INTERNAL_TARGET;
  const dataMode = process.env.TENROUTER_DATA_MODE || 'demo';
  const management = dataMode === 'demo' || process.env.TENROUTER_ENABLE_MANAGEMENT === '1';
  const port = Number(process.env.TENROUTER_PORT || 4317);
  const modelBaseUrl = process.env.TENROUTER_MODEL_BASE_URL || (dataMode !== 'demo' && target ? `${target}/v1` : '');
  if (modelBaseUrl) {
    const url = new URL(modelBaseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('模型端点须为不含凭据和查询参数的 http(s) URL');
  }
  const proxy = target ? { '/api': { target, changeOrigin: false, xfwd: true } } : undefined;
  const hermesBridge = target ? createHermesBridge({ backendUrl: target, hermesUrl: process.env.TENROUTER_HERMES_URL, token: process.env.TENROUTER_HERMES_TOKEN, tokenFile: process.env.TENROUTER_HERMES_TOKEN_FILE, management }) : null;
  const readOnlyGuard = (request, response, next) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (!pathname.startsWith('/api')) return next();
    const allowed = isAllowedRequest(request.url, request.method, management);
    let sourceHost = null;
    if (request.headers.origin) {
      try { sourceHost = new URL(request.headers.origin).host; }
      catch {
        response.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        return response.end(JSON.stringify({ error: '请求来源无效' }));
      }
    } else if (request.headers.referer) {
      try { sourceHost = new URL(request.headers.referer).host; }
      catch {
        response.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        return response.end(JSON.stringify({ error: '请求来源无效' }));
      }
    }
    if (allowed && !['GET', 'HEAD'].includes(request.method) && sourceHost && sourceHost !== request.headers.host && pathname !== '/api/auth/saml/acs') {
      response.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      return response.end(JSON.stringify({ error: '请求来源不匹配' }));
    }
    if (allowed && target) return next();
    response.writeHead(target ? 405 : 503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ error: target ? '当前访问模式只读，或接口尚未开放' : 'API 尚未接入，请通过开发或预览启动器运行' }));
  };
  const stripForwardingHeaders = (request, response, next) => {
    for (const header of ['x-real-ip', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-10r-real-ip', 'x-10r-via-proxy', 'x-10r-peer-token', 'x-9r-cli-token', 'x-10r-cli-token', 'x-10r-iq-token']) delete request.headers[header];
    next();
  };
  const installDashboardEntry = server => {
    const indexFile = resolve(server.config.root, 'index.html');
    let indexHtml;
    server.watcher.on('change', file => { if (resolve(file) === indexFile) indexHtml = null; });
    server.middlewares.use(async (request, response, next) => {
      const url = new URL(request.url, 'http://localhost');
      if (!['GET', 'HEAD'].includes(request.method) || !(url.pathname === '/' || url.pathname === '/login' || url.pathname === '/callback' || url.pathname === '/dashboard' || url.pathname.startsWith('/dashboard/'))) return next();
      try {
        // The SPA entry is identical for every dashboard route. Keep Vite's transforms,
        // while avoiding repeated shared-drive filesystem probes on navigation.
        indexHtml ||= readFile(indexFile, 'utf8').then(html => server.transformIndexHtml('/index.html', html)).catch(failure => { indexHtml = null; throw failure; });
        const html = await indexHtml;
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
        response.end(request.method === 'HEAD' ? undefined : html);
      } catch (failure) { next(failure); }
    });
  };
  const toolchain = process.env.TENROUTER_TOOLCHAIN_DIR || defaultToolchain;
  const usePolling = process.env.CHOKIDAR_USEPOLLING === 'true' || (process.platform === 'win32' && !!toolchain);
  return {
    // Native tools and optimized dependencies stay off the Windows network share.
    ...(toolchain ? { cacheDir: resolve(toolchain, `node_modules/.vite/10router-web-${dataMode}`) } : {}),
    resolve: { preserveSymlinks: true },
    plugins: [react(), tailwindcss(), {
      name: 'tenrouter-readonly-boundary',
      configureServer(server) { installDashboardEntry(server); server.middlewares.use(stripForwardingHeaders); if (hermesBridge) server.middlewares.use(hermesBridge); server.middlewares.use(readOnlyGuard); },
      configurePreviewServer(server) { server.middlewares.use(stripForwardingHeaders); if (hermesBridge) server.middlewares.use(hermesBridge); server.middlewares.use(readOnlyGuard); },
    }],
    define: { __DATA_MODE__: JSON.stringify(dataMode), __MANAGEMENT_ENABLED__: JSON.stringify(management), __MODEL_BASE_URL__: JSON.stringify(modelBaseUrl) },
    server: {
      host: '127.0.0.1',
      port,
      strictPort: true,
      proxy,
      watch: usePolling ? { usePolling: true, interval: 200 } : undefined,
      warmup: { clientFiles: ['./src/main.jsx', './src/components/ProxySubscriptions.jsx', './src/components/ProxyWatch.jsx'] }
    },
    preview: { host: '127.0.0.1', port, strictPort: true, proxy },
    build: { chunkSizeWarningLimit: 650 },
  };
};

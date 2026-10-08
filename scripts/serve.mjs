import http from 'node:http';
import https from 'node:https';
import { createReadStream, realpathSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAllowedRequest } from '../src/api/policy.js';
import { createHermesBridge } from './hermes-bridge.mjs';
import { createSystemBridge } from './system-bridge.mjs';
import { createCheckinBridge } from './checkin-bridge.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const strippedHeaders = ['x-real-ip', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-10r-real-ip', 'x-10r-via-proxy', 'x-10r-peer-token', 'x-9r-cli-token', 'x-10r-cli-token', 'x-10r-iq-token'];

export async function startGatewayServer({ backendUrl, distDir = resolve(root, 'dist'), host = '0.0.0.0', port = 4317, management = false, hermesUrl, hermesToken, hermesTokenFile, systemSshTarget, systemSshIdentity, checkinDir, checkinService }) {
  const backend = new URL(backendUrl);
  if (!['http:', 'https:'].includes(backend.protocol) || backend.username || backend.password || backend.pathname !== '/' || backend.search || backend.hash) throw new Error('Backend must be an HTTP(S) origin without credentials');
  distDir = resolve(distDir);
  await stat(resolve(distDir, 'index.html'));
  const transport = backend.protocol === 'https:' ? https : http;
  const sockets = new Set();
  const upstreams = new Set();
  const hermesBridge = createHermesBridge({ backendUrl, hermesUrl, token: hermesToken, tokenFile: hermesTokenFile, management });
  const systemBridge = createSystemBridge({ backendUrl, sshTarget: systemSshTarget, sshIdentity: systemSshIdentity });
  const checkinBridge = createCheckinBridge({ backendUrl, management, directory: checkinDir, service: checkinService });
  function json(response, status, message) {
    if (response.headersSent) return response.destroy();
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(JSON.stringify({ error: message }));
  }
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/api/checkins' || url.pathname.startsWith('/api/checkins/')) return await checkinBridge(request, response);
      if (url.pathname === '/api/system/info') return await systemBridge(request, response);
      if (url.pathname.startsWith('/api/hermes/')) return await hermesBridge(request, response);
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        if (!isAllowedRequest(request.url, request.method, management)) return json(response, 405, '接口尚未开放');
        if (request.method !== 'GET') {
          let sourceHost = null;
          if (request.headers.origin) { try { sourceHost = new URL(request.headers.origin).host; } catch { return json(response, 403, '请求来源无效'); } }
          else if (request.headers.referer) { try { sourceHost = new URL(request.headers.referer).host; } catch { return json(response, 403, '请求来源无效'); } }
          // SAML posts a signed assertion from the external identity provider; the backend verifies it.
          if (sourceHost && sourceHost !== request.headers.host && url.pathname !== '/api/auth/saml/acs') return json(response, 403, '请求来源不匹配');
        }
        const headers = { ...request.headers };
        for (const header of strippedHeaders) delete headers[header];
        // Mark the real client hop so a loopback backend cannot grant local bootstrap privileges.
        headers['x-forwarded-for'] = request.socket.remoteAddress;
        headers['x-forwarded-host'] = request.headers.host;
        headers['x-forwarded-proto'] = 'http';
        const upstream = transport.request(backend, { method: request.method, path: request.url, headers }, upstreamResponse => {
          response.writeHead(upstreamResponse.statusCode, { ...upstreamResponse.headers, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
          upstreamResponse.on('error', () => response.destroy());
          upstreamResponse.pipe(response);
        });
        upstreams.add(upstream);
        upstream.on('close', () => upstreams.delete(upstream));
        upstream.on('error', () => json(response, 502, '网关后端暂时无法访问'));
        if (url.pathname !== '/api/usage/stream') upstream.setTimeout(120000, () => upstream.destroy(new Error('Backend timeout')));
        response.on('close', () => upstream.destroy());
        request.on('error', () => upstream.destroy());
        request.pipe(upstream);
        return;
      }
      if (!['GET', 'HEAD'].includes(request.method)) return json(response, 405, '不支持此请求方法');
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { return json(response, 400, '路径无效'); }
      const dashboard = pathname === '/' || pathname === '/login' || pathname === '/callback' || pathname === '/dashboard' || pathname.startsWith('/dashboard/');
      const bundledFont = pathname === '/fonts/SuperPingFangV1.woff2' || pathname === '/fonts/SuperSFMonoV1.woff2';
      if (!dashboard && !bundledFont && pathname !== '/favicon.svg' && !pathname.startsWith('/assets/')) return json(response, 404, '文件不存在');
      const file = dashboard ? resolve(distDir, 'index.html') : resolve(distDir, `.${pathname}`);
      if (!file.startsWith(`${distDir}${sep}`)) return json(response, 404, '文件不存在');
      let info;
      try { info = await stat(file); } catch { return json(response, 404, '文件不存在'); }
      if (!info.isFile()) return json(response, 404, '文件不存在');
      response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      if (request.method === 'HEAD') return response.end();
      const stream = createReadStream(file);
      stream.on('error', () => response.destroy());
      response.on('close', () => stream.destroy());
      stream.pipe(response);
    } catch { json(response, 400, '请求无效'); }
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(port, host, resolveListen); });
  return {
    server,
    close: async () => {
      upstreams.forEach(upstream => upstream.destroy());
      sockets.forEach(socket => socket.destroy());
      await new Promise(resolveClose => server.close(resolveClose));
    },
  };
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await startGatewayServer({
    backendUrl: process.env.TENROUTER_BACKEND_URL,
    distDir: process.env.TENROUTER_DIST_DIR || resolve(dirname(fileURLToPath(import.meta.url)), '../dist'),
    host: process.env.TENROUTER_HOST || '0.0.0.0',
    port: Number(process.env.TENROUTER_PORT || 4317),
    management: process.env.TENROUTER_ENABLE_MANAGEMENT === '1',
    hermesUrl: process.env.TENROUTER_HERMES_URL,
    hermesToken: process.env.TENROUTER_HERMES_TOKEN,
    hermesTokenFile: process.env.TENROUTER_HERMES_TOKEN_FILE,
    systemSshTarget: process.env.TENROUTER_SYSTEM_SSH_TARGET,
    systemSshIdentity: process.env.TENROUTER_SYSTEM_SSH_IDENTITY,
    checkinDir: process.env.TENROUTER_CHECKIN_DIR,
  });
  console.log(`10router-web listening on ${process.env.TENROUTER_HOST || '0.0.0.0'}:${app.server.address().port}`);
  let stopping = false;
  const stop = async () => { if (stopping) return; stopping = true; await app.close(); process.exit(0); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

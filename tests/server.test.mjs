import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { startGatewayServer } from '../scripts/serve.mjs';

test('production server serves deep links/assets and streams authenticated API requests without local privilege headers', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tenrouter-server-'));
  await mkdir(join(directory, 'assets'));
  await mkdir(join(directory, 'fonts'));
  await writeFile(join(directory, 'index.html'), '<html>gateway</html>');
  await writeFile(join(directory, 'assets', 'app.js'), 'window.gateway=true');
  for (const name of ['SuperPingFangV1.woff2', 'SuperSFMonoV1.woff2']) await writeFile(join(directory, 'fonts', name), Buffer.from('wOF2-test'));
  await writeFile(join(directory, 'fonts', 'private.txt'), 'not-public');
  let receivedHeaders;
  const backend = http.createServer(async (request, response) => {
    receivedHeaders = request.headers;
    if (request.url === '/api/usage/stream') {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.write('data: {"requests":1}\n\n');
      request.on('close', () => response.end());
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'auth_token=test-session; HttpOnly; SameSite=Lax; Path=/' });
    let body = '';
    for await (const chunk of request) body += chunk;
    response.end(JSON.stringify({ cookie: request.headers.cookie, body }));
  });
  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
  let app;
  try {
    app = await startGatewayServer({ backendUrl: `http://127.0.0.1:${backend.address().port}`, distDir: directory, host: '127.0.0.1', port: 0, management: true });
    const url = `http://127.0.0.1:${app.server.address().port}`;
    assert.match(await (await fetch(`${url}/dashboard/models`)).text(), /gateway/);
    const asset = await fetch(`${url}/assets/app.js`);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get('cache-control'), /immutable/);
    assert.equal((await fetch(`${url}/assets/missing.js`)).status, 404);
    for (const name of ['SuperPingFangV1.woff2', 'SuperSFMonoV1.woff2']) {
      const font = await fetch(`${url}/fonts/${name}`);
      assert.equal(font.status, 200);
      assert.equal(font.headers.get('content-type'), 'font/woff2');
      assert.equal(font.headers.get('cache-control'), 'no-cache');
      assert.equal(Buffer.from(await font.arrayBuffer()).toString(), 'wOF2-test');
      const head = await fetch(`${url}/fonts/${name}`, { method: 'HEAD' });
      assert.equal(head.status, 200);
      assert.equal(head.headers.get('content-length'), '9');
      assert.equal(await head.text(), '');
    }
    assert.equal((await fetch(`${url}/fonts/missing.woff2`)).status, 404);
    assert.equal((await fetch(`${url}/fonts/private.txt`)).status, 404);
    assert.equal((await fetch(`${url}/package.json`)).status, 404);
    assert.equal((await fetch(`${url}/api/shutdown`, { method: 'POST' })).status, 405);
    assert.equal((await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { Origin: 'https://foreign.invalid' }, body: '{}' })).status, 403);
    assert.equal((await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { Referer: 'https://foreign.invalid/login' }, body: '{}' })).status, 403);
    const login = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { Origin: url, 'Content-Type': 'application/json', 'x-9r-cli-token': 'spoof', 'x-10r-peer-token': 'spoof', 'x-forwarded-for': 'spoof' }, body: '{"password":"test"}' });
    assert.equal(login.status, 200);
    assert.match(login.headers.get('set-cookie'), /auth_token=test-session/);
    assert.equal((await login.json()).body, '{"password":"test"}');
    assert.equal(receivedHeaders['x-9r-cli-token'], undefined);
    assert.equal(receivedHeaders['x-10r-peer-token'], undefined);
    assert.equal(receivedHeaders['x-forwarded-for'], '127.0.0.1');
    const authenticated = await fetch(`${url}/api/providers`, { headers: { Cookie: 'auth_token=test-session' } });
    assert.equal((await authenticated.json()).cookie, 'auth_token=test-session');
    const upstreamModels = await fetch(`${url}/api/providers/test-connection/models`, { headers: { Cookie: 'auth_token=test-session' } });
    assert.equal(upstreamModels.status, 200);
    assert.equal((await upstreamModels.json()).cookie, 'auth_token=test-session');
    const stream = await fetch(`${url}/api/usage/stream`);
    const reader = stream.body.getReader();
    assert.match(new TextDecoder().decode((await reader.read()).value), /data: /);
    await reader.cancel();
  } finally {
    await app?.close();
    backend.closeAllConnections();
    await new Promise(resolve => backend.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

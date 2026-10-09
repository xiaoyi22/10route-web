import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { startGatewayServer } from '../scripts/serve.mjs';
import * as client from '../scripts/checkin-client.mjs';

const account = { baseUrl: 'https://site.example', checkinPath: '/api/user/checkin', authMode: 'cookie', userId: '42', cookie: 'session=proxy-test-only' };

test('proxy CONNECT pins the public IP and preserves TLS hostname validation', async () => {
  assert.equal(typeof client.createCheckinProxyAgent, 'function');
  const captured = [];
  const tunnel = new PassThrough();
  const secure = new PassThrough();
  const requester = options => {
    captured.push(options);
    const request = new EventEmitter();
    request.end = () => queueMicrotask(() => request.emit('connect', { statusCode: 200 }, tunnel, Buffer.alloc(0)));
    request.destroy = () => {};
    return request;
  };
  let tlsOptions;
  const connector = options => { tlsOptions = options; queueMicrotask(() => secure.emit('secureConnect')); return secure; };
  const agent = client.createCheckinProxyAgent('http://127.0.0.1:7890', { address: '8.8.8.8', requester, connector });
  try {
    const socket = await new Promise((resolve, reject) => agent.createConnection({ host: 'site.example', port: 443 }, (error, socket) => error ? reject(error) : resolve(socket)));
    assert.equal(socket, secure);
    assert.equal(captured.length, 1);
    assert.equal(captured[0].hostname, '127.0.0.1');
    assert.equal(captured[0].port, '7890');
    assert.equal(captured[0].method, 'CONNECT');
    assert.equal(captured[0].path, '8.8.8.8:443');
    assert.deepEqual(captured[0].headers, { Host: '8.8.8.8:443' });
    assert.equal(tlsOptions.servername, 'site.example');
    assert.equal(tlsOptions.rejectUnauthorized, true);
    assert.equal(tlsOptions.socket, tunnel);
  } finally { secure.destroy(); tunnel.destroy(); agent.destroy(); }
});

test('proxy configuration rejects credentials, unsupported schemes and private pinned addresses', () => {
  assert.equal(typeof client.createCheckinProxyAgent, 'function');
  for (const proxyUrl of ['socks5://127.0.0.1:7890', 'https://127.0.0.1:7890', 'http://user:secret@127.0.0.1:7890', 'http://127.0.0.1:7890/path', 'http://127.0.0.1:7890?token=x']) assert.throws(() => client.createCheckinProxyAgent(proxyUrl));
  assert.throws(() => client.createCheckinProxyAgent('http://127.0.0.1:7890', { address: '127.0.0.1' }));
});

test('rejected CONNECT fails the checkin without falling back to a direct request', async () => {
  assert.equal(typeof client.createCheckinProxyAgent, 'function');
  const connections = [];
  const proxy = http.createServer();
  proxy.on('connect', (request, socket) => {
    connections.push({ target: request.url, headers: request.headers });
    socket.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n');
  });
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  try {
    await assert.rejects(client.sendCheckin(account, { proxyUrl: 'http://127.0.0.1:' + proxy.address().port, lookup: async () => [{ address: '8.8.8.8', family: 4 }] }), error => error.diagnostic === 'proxy');
    assert.equal(connections.length, 1);
    assert.equal(connections[0].target, '8.8.8.8:443');
    assert.equal(connections[0].headers.cookie, undefined);
    assert.equal(connections[0].headers.authorization, undefined);
  } finally { await new Promise(resolve => proxy.close(resolve)); }
});

test('proxied DNS uses the fixed encrypted resolver without site credentials', async () => {
  assert.equal(typeof client.lookupCheckinViaProxy, 'function');
  const captured = [];
  const requester = (url, options, callback) => {
    const request = new EventEmitter();
    request.destroy = () => {};
    request.end = () => {
      captured.push({ url: new URL(url), options });
      queueMicrotask(() => {
        const response = new EventEmitter(); response.statusCode = 200; callback(response);
        const type = new URL(url).searchParams.get('type') === 'A' ? 1 : 28;
        response.emit('data', Buffer.from(JSON.stringify({ Status: 0, Answer: [{ type, data: type === 1 ? '8.8.8.8' : '2606:4700:4700::1111' }] })));
        response.emit('end'); request.emit('close');
      });
    };
    return request;
  };
  const addresses = await client.lookupCheckinViaProxy('site.example', 'http://127.0.0.1:7890', { requester });
  assert.deepEqual(addresses, [{ address: '8.8.8.8', family: 4 }, { address: '2606:4700:4700::1111', family: 6 }]);
  assert.equal(captured.length, 2);
  for (const request of captured) {
    assert.equal(request.url.origin, 'https://cloudflare-dns.com');
    assert.equal(request.url.searchParams.get('name'), 'site.example');
    assert.equal(request.options.method, 'GET');
    assert.deepEqual(request.options.headers, { Accept: 'application/dns-json' });
    assert.notEqual(request.options.agent, false);
  }
});

test('proxied checkins reject mixed public and private DNS answers before CONNECT', async () => {
  let sent = 0;
  await assert.rejects(client.sendCheckin(account, { proxyUrl: 'http://127.0.0.1:7890', lookup: async () => [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }], requester: () => { sent++; } }), /Unsafe checkin address/);
  assert.equal(sent, 0);
});

test('TLS rejection destroys the proxy tunnel instead of accepting an insecure connection', async () => {
  const tunnel = new PassThrough();
  const secure = new PassThrough();
  const requester = () => {
    const request = new EventEmitter();
    request.destroy = () => {};
    request.end = () => queueMicrotask(() => request.emit('connect', { statusCode: 200 }, tunnel, Buffer.alloc(0)));
    return request;
  };
  const connector = () => { queueMicrotask(() => secure.emit('error', new Error('certificate rejected'))); return secure; };
  const agent = client.createCheckinProxyAgent('http://127.0.0.1:7890', { address: '8.8.8.8', requester, connector });
  try {
    await assert.rejects(new Promise((resolve, reject) => agent.createConnection({ host: 'site.example', port: 443 }, (error, socket) => error ? reject(error) : resolve(socket))), error => error.diagnostic === 'tls' && !error.message.includes('certificate rejected'));
    assert.equal(tunnel.destroyed, true);
    assert.equal(secure.destroyed, true);
  } finally { agent.destroy(); }
});

test('encrypted DNS rejects private answers and redirects without a local DNS fallback', async () => {
  for (const [httpStatus, answer] of [[200, '10.0.0.1'], [302, '8.8.8.8']]) {
    let requests = 0;
    const requester = (url, options, callback) => {
      const request = new EventEmitter();
      request.destroy = () => {};
      request.end = () => queueMicrotask(() => {
        requests++;
        const response = new EventEmitter(); response.statusCode = httpStatus; callback(response);
        response.emit('data', Buffer.from(JSON.stringify({ Status: 0, Answer: [{ type: 1, data: answer }] })));
        response.emit('end'); request.emit('close');
      });
      return request;
    };
    await assert.rejects(client.lookupCheckinViaProxy('site.example', 'http://127.0.0.1:7890', { requester }));
    assert.equal(requests, 1);
  }
});

test('gateway configuration reaches the default checkin runner through the authenticated API', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kn10-checkin-proxy-'));
  const connections = [];
  const proxy = http.createServer();
  proxy.on('connect', (request, socket) => {
    connections.push({ target: request.url, headers: request.headers });
    socket.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n');
  });
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  const backend = http.createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end('{"authenticated":true}');
  });
  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
  const app = await startGatewayServer({ backendUrl: 'http://127.0.0.1:' + backend.address().port, host: '127.0.0.1', port: 0, management: true, checkinDir: directory, checkinProxyUrl: 'http://127.0.0.1:' + proxy.address().port });
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const headers = { Origin: base, 'Content-Type': 'application/json' };
  try {
    const saved = await fetch(base + '/api/checkins/accounts', { method: 'POST', headers, body: JSON.stringify({ ...account, site: '隔离测试', name: '代理账号', protocol: 'newapi' }) });
    assert.equal(saved.status, 201);
    assert.equal((await fetch(base + '/api/checkins/jobs', { method: 'POST', headers, body: '{}' })).status, 202);
    let snapshot;
    for (let attempt = 0; attempt < 100; attempt++) {
      const response = await fetch(base + '/api/checkins');
      assert.equal(response.status, 200);
      snapshot = await response.json();
      if (snapshot.job.status !== 'running') break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(snapshot.job.status, 'failed');
    assert.equal(snapshot.history[0].diagnostic, 'proxy');
    assert.match(snapshot.history[0].message, /代理连接失败/);
    assert.equal(connections.length, 1);
    assert.equal(connections[0].target, 'cloudflare-dns.com:443');
    assert.equal(connections[0].headers.cookie, undefined);
    assert.equal(connections[0].headers.authorization, undefined);
    assert.equal(JSON.stringify(snapshot).includes(account.cookie), false);
  } finally {
    await app.close();
    await new Promise(resolve => { backend.closeAllConnections(); backend.close(resolve); });
    await new Promise(resolve => proxy.close(resolve));
    assert.equal(dirname(directory), resolve(tmpdir()));
    await rm(directory, { recursive: true, force: true });
  }
});

import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createHermesBridge } from '../scripts/hermes-bridge.mjs';

async function serve(handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}

test('health results survive bridge restart and cached reads never probe models', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tenrouter-health-'));
  const healthCacheFile = join(directory, 'state', 'chain-health.json');
  const calls = [];
  const options = { backendUrl: 'http://gateway.test', hermesUrl: 'http://hermes.test', token: 'private-test-token', management: true, healthCacheFile, fetcher: async url => {
    if (url.startsWith('http://gateway.test')) return Response.json({ authenticated: true });
    calls.push(url);
    return Response.json({ checked_at: new Date().toISOString(), components: [{ name: 'LLM', ok: true, latency_ms: 25 }] });
  } };
  let app = await serve(createHermesBridge(options));
  try {
    assert.equal((await fetch(app.url + '/api/hermes/health').then(response => response.json())).checked_at, null);
    assert.equal(calls.length, 0);
    const results = await Promise.all([1, 2].map(() => fetch(app.url + '/api/hermes/health/check', { method: 'POST', body: '{}' }).then(response => response.json())));
    assert(results.every(result => result.mem0.components.length === 1 && result.icarus.components.length === 1));
    assert.equal(calls.length, 2);
    assert(!(await readFile(healthCacheFile, 'utf8')).includes(options.token));
    await app.close();
    app = await serve(createHermesBridge(options));
    const restored = await fetch(app.url + '/api/hermes/health').then(response => response.json());
    assert.equal(restored.checked_at, results[0].checked_at);
    assert.equal(restored.mem0.components[0].name, 'LLM');
    assert.equal(calls.length, 2);
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});

test('corrupt or unrelated health caches do not become trusted results', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tenrouter-health-'));
  const healthCacheFile = join(directory, 'chain-health.json');
  try {
    for (const content of ['invalid-json', JSON.stringify({ hermesUrl: 'http://other.test', health: { checked_at: new Date().toISOString(), mem0: { components: [] }, icarus: { components: [] } } })]) {
      await writeFile(healthCacheFile, content);
      const app = await serve(createHermesBridge({ backendUrl: 'http://gateway.test', hermesUrl: 'http://hermes.test', healthCacheFile, fetcher: async () => Response.json({ authenticated: true }) }));
      try {
        const response = await fetch(app.url + '/api/hermes/health');
        assert.equal(response.status, 200);
        assert.equal((await response.json()).checked_at, null);
      } finally { await app.close(); }
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

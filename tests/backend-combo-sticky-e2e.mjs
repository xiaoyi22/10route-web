import assert from 'node:assert/strict';
import http from 'node:http';

const base = 'http://127.0.0.1:20131';
const counts = {};
let failPrimary = false;
const server = http.createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString());
  counts[body.model] = (counts[body.model] || 0) + 1;
  response.setHeader('Content-Type', 'application/json');
  if (failPrimary && body.model === 'a') {
    response.writeHead(503);
    return response.end(JSON.stringify({ error: { message: 'Isolated primary unavailable' } }));
  }
  response.end(JSON.stringify({
    id: 'isolated-test', object: 'chat.completion', model: body.model,
    choices: [{ index: 0, message: { role: 'assistant', content: body.model }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  }));
});
await new Promise(resolve => server.listen(20132, '127.0.0.1', resolve));
const call = async (path, body, expected = 200) => {
  const response = await fetch(base + path, {
    method: body ? (path === '/api/settings' ? 'PATCH' : 'POST') : 'GET',
    headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  assert.equal(response.status, expected, path + ': ' + JSON.stringify(data.error || ''));
  return data;
};
try {
  const health = await call('/api/health');
  assert.equal(health.driver, 'better-sqlite3');
  assert.equal((await call('/api/providers')).connections.length, 0, 'Isolated fresh database required');
  await call('/api/settings', { requireApiKey: false, comboStrategy: 'round-robin', comboStickyRoundRobinLimit: 3 });
  const { node } = await call('/api/provider-nodes', { name: 'Isolated combo upstream', prefix: 'combosticky', type: 'openai-compatible', apiType: 'chat', baseUrl: 'http://127.0.0.1:20132/v1' }, 201);
  await call('/api/providers', { provider: node.id, name: 'Isolated combo account', apiKey: 'isolated-placeholder', testStatus: 'active' }, 201);
  const models = ['combosticky/a', 'combosticky/b'];
  for (const name of ['code-nine', 'global-three', 'primary-backup']) await call('/api/combos', { name, models }, 201);
  const comboStrategies = { 'code-nine': { fallbackStrategy: 'round-robin', comboStickyRoundRobinLimit: 9 }, 'primary-backup': { fallbackStrategy: 'fallback', comboStickyRoundRobinLimit: 9 } };
  await call('/api/settings', { comboStrategies });
  assert.equal((await call('/api/settings')).comboStrategies['code-nine'].comboStickyRoundRobinLimit, 9);
  const chat = async model => {
    const data = await call('/api/v1/chat/completions', { model, messages: [{ role: 'user', content: 'OK' }], stream: false });
    return data.choices[0].message.content;
  };
  const nine = [];
  for (let i = 0; i < 19; i++) nine.push(await chat('code-nine'));
  assert.deepEqual(nine, [...Array(9).fill('a'), ...Array(9).fill('b'), 'a']);
  const inherited = [];
  for (let i = 0; i < 4; i++) inherited.push(await chat('global-three'));
  assert.deepEqual(inherited, ['a', 'a', 'a', 'b']);
  for (let i = 0; i < 3; i++) assert.equal(await chat('primary-backup'), 'a');
  const previous = await call('/api/settings');
  await call('/api/settings', { comboStrategies: { 'code-nine': { comboStickyRoundRobinLimit: 1.5 } } }, 400);
  assert.deepEqual((await call('/api/settings')).comboStrategies, previous.comboStrategies);
  await call('/api/settings', { comboStrategies });
  assert.equal(await chat('code-nine'), 'a', 'Settings change resets rotation');
  failPrimary = true;
  assert.equal(await chat('primary-backup'), 'b', 'Primary failure falls back to backup');
  console.log(JSON.stringify({ passed: true, apiStatus: { health: 200, settings: 200, invalidCount: 400, chat: 200 }, requests: 28, nine, inherited, fallback: 'a -> b on 503', upstreamCounts: counts }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { await new Promise(resolve => server.close(resolve)); }

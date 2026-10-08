import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { request } from 'playwright';

const base = process.env.TENROUTER_SANDBOX_URL;
assert(base && new URL(base).hostname === '127.0.0.1' && new URL(base).port === '20129', 'An explicit loopback sandbox URL on port 20129 is required');
const context = await request.newContext({ baseURL: base });
const results = [];
try {
  const path = process.env.TENROUTER_TEST_LOGIN_ENV || process.env.USERPROFILE + '/.codex/credentials/10router-web.env';
  const credentials = parseEnv(await readFile(path, 'utf8'));
  const login = await context.post('/api/auth/login', { data: { password: credentials.TENROUTER_TEST_PASSWORD } });
  assert.equal(login.status(), 200, 'Sandbox login failed; no retry attempted');
  const health = await (await context.get('/api/health')).json();
  assert.equal(health.driver, 'better-sqlite3');
  const providers = (await (await context.get('/api/providers')).json()).connections;
  const provider = providers.find(connection => connection.providerSpecificData?.nodeName === 'WindHub');
  assert(provider, 'Real WindHub configuration is required');
  const keysData = await (await context.get('/api/keys')).json();
  const apiKey = keysData.keys.find(key => key.isActive !== false)?.key;
  assert(apiKey, 'An existing active gateway key is required');
  const query = { provider: provider.provider, pageSize: '100' };
  const baseline = await (await context.get('/api/usage/request-details', { params: query })).json();
  const known = new Set(baseline.details.map(detail => detail.id));
  for (const sample of [
    { endpoint: '/v1/chat/completions', model: 'wh/qwen3.8-flash-next', body: { messages: [{ role: 'user', content: 'Reply OK.' }], max_tokens: 16 } },
    { endpoint: '/v1/responses', model: 'wh/qwen3.8-flash-next', body: { input: 'Reply OK.', max_output_tokens: 16 } },
    { endpoint: '/v1/responses', model: 'wh/gpt-6-luna', body: { input: 'Reply OK.', max_output_tokens: 8 } },
  ].filter(sample => process.env.TENROUTER_SANDBOX_SKIP_LUNA !== '1' || sample.model !== 'wh/gpt-6-luna')) {
    const response = await fetch(base + sample.endpoint, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({ ...sample.body, model: sample.model, stream: true }), signal: AbortSignal.timeout(135000),
    });
    if (response.ok) {
      const reader = response.body.getReader();
      let text = '';
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        text += new TextDecoder().decode(chunk.value);
        if (sample.endpoint === '/v1/responses' ? text.includes('"type":"response.completed"') : text.includes('data: [DONE]')) {
          await reader.cancel('ResponseAborted');
          break;
        }
      }
    } else {
      await response.text();
    }
    let row;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const data = await (await context.get('/api/usage/request-details', { params: query })).json();
      row = data.details.find(detail => !known.has(detail.id) && detail.model === sample.model.slice(3));
      if (row && row.status !== 'streaming') break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert(row, 'The actual request detail must be stored');
    known.add(row.id);
    assert.equal(row.endpoint, sample.endpoint);
    assert.equal(row.upstreamEndpoint, '/v1/chat/completions');
    if (response.ok) {
      assert.equal(row.status, 'success', 'Closing after a terminal event must not turn a completed request into a failure');
      assert((row.tokens.prompt_tokens ?? row.tokens.input_tokens ?? 0) > 0);
      assert((row.tokens.completion_tokens ?? row.tokens.output_tokens ?? 0) > 0);
      assert.equal(row.usageSource, 'upstream', 'WindHub usage frames must be retained rather than estimated');
      assert(row.latency.ttft > 0);
    } else {
      assert.equal(row.status, 'error');
      assert.equal(row.error.status, response.status);
      assert.equal(row.usageSource, 'unavailable');
    }
    results.push({ id: row.id, model: row.model, httpStatus: response.status, status: row.status,
      entry: row.endpoint, exit: row.upstreamEndpoint, tokens: row.tokens, usageSource: row.usageSource, error: row.error });
    console.log('VERIFIED', JSON.stringify(results.at(-1)));
  }
  console.log(`PASS: ${results.length} real WindHub requests in isolated SQLite; ${results.filter(result => result.status === 'success').length} successes with upstream usage, ${results.filter(result => result.status === 'error').length} genuine HTTP failures`);
} finally {
  await context.dispose();
}

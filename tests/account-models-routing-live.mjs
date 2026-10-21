import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

const base = 'http://192.168.11.150:20128';
const state = JSON.parse(await readFile('reports/account-models/deployment-state.json', 'utf8'));
assert(['frontend-and-config-deployed', 'verified', 'verified-with-upstream-limitations'].includes(state.stage));
const env = parseEnv(await readFile('C:/Users/Administrator/.codex/credentials/10router-web.env', 'utf8'));
const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: env.TENROUTER_TEST_PASSWORD.trim() }), signal: AbortSignal.timeout(15000) });
assert.equal(login.status, 200);
const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
const read = async path => {
  const response = await fetch(base + path, { headers: { cookie }, signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 200, path);
  return response.json();
};
const keys = (await read('/api/keys')).keys;
const key = keys.find(key => key.name === 'Default Key' && key.isActive !== false && !key.allowedModels?.length && !key.allowedCombos?.length);
assert(key);
const apiKey = (await read('/api/keys/' + key.id)).key.key;
assert(apiKey && !apiKey.includes('*'));
const headers = { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' };
const modelsResponse = await fetch(base + '/v1/models', { headers, signal: AbortSignal.timeout(20000) });
assert.equal(modelsResponse.status, 200);
const models = await modelsResponse.json();
assert(models.data.some(model => model.id === 'aiapi/deepseek-v4.1-flash'));
const query = '/api/usage/request-details?' + new URLSearchParams({ provider: state.provider, pageSize: '100' });
const known = new Set((await read(query)).details.map(row => row.id));
const report = { base, publishedModelHttp: modelsResponse.status, requests: [], passed: false };
try {
  for (const sample of [
    { model: 'aiapi/deepseek-v4.1-flash', stream: false, account: 'DP' },
    { model: 'aiapi/deepseek-v4.1-flash', stream: true, account: 'DP' },
    { model: 'aiapi/gpt-6.1-sol', stream: false, account: 'aiapi-Default' },
  ].filter(sample => (!process.env.TENROUTER_SMOKE_MODEL || sample.model === process.env.TENROUTER_SMOKE_MODEL) && (!process.env.TENROUTER_SMOKE_STREAM_ONLY || sample.stream))) {
    const start = Date.now();
    const responses = process.env.TENROUTER_SMOKE_PROTOCOL === 'responses';
    const endpoint = responses ? '/v1/responses' : '/v1/chat/completions';
    const body = responses
      ? { model: sample.model, input: 'Reply only OK.', max_output_tokens: 128, stream: sample.stream }
      : { model: sample.model, messages: [{ role: 'user', content: 'Reply only OK.' }], max_tokens: 128, stream: sample.stream };
    const response = await fetch(base + endpoint, {
      method: 'POST', headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90000),
    });
    const raw = await response.text();
    const safe = raw.replaceAll(apiKey, '[REDACTED]').replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]');
    let answer = '';
    let done = !sample.stream;
    if (response.ok) {
      if (sample.stream) {
        for (const line of raw.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') { done = true; continue; }
          if (!data) continue;
          const chunk = JSON.parse(data);
          assert(!chunk.error, '流中没有错误');
          if (chunk.type === 'response.completed') done = true;
          answer += responses ? chunk.type === 'response.output_text.delta' ? chunk.delta || '' : '' : chunk.choices?.[0]?.delta?.content || '';
        }
      } else {
        const data = JSON.parse(raw);
        answer = responses ? (data.output || []).flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('') : data.choices?.[0]?.message?.content || '';
      }
    }
    const result = { ...sample, endpoint, http: response.status, elapsedMs: Date.now() - start, answer, completed: done };
    if (!response.ok) result.error = safe.slice(0, 1200);
    report.requests.push(result);
    console.log(JSON.stringify(result));
    assert.equal(response.status, 200, safe.slice(0, 500));
    assert(answer.trim(), '返回非空回答');
    assert(done, '流式返回结束标记');
    await new Promise(resolve => setTimeout(resolve, 6000));
    let row;
    for (let attempt = 0; attempt < 2; attempt++) {
      const details = (await read(query)).details;
      row = details.find(row => !known.has(row.id) && [sample.model, sample.model.split('/').slice(1).join('/')].includes(row.model) && row.status === 'success' && row.endpoint === endpoint);
      if (row) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    assert(row, '真实请求日志记录成功调用');
    known.add(row.id);
    const expected = state.accounts.find(account => account.name === sample.account);
    result.logId = row.id;
    result.connectionId = row.connectionId;
    result.logStatus = row.status;
    assert.equal(row.connectionId, expected.id, '真实日志命中预期账号');
    console.log(JSON.stringify({ model: sample.model, stream: sample.stream, routedTo: expected.name, connectionId: row.connectionId, logStatus: row.status }));
  }
  report.passed = true;
  if (!process.env.TENROUTER_SMOKE_MODEL && !process.env.TENROUTER_SMOKE_PROTOCOL) state.stage = 'verified';
  await writeFile('reports/account-models/deployment-state.json', JSON.stringify(state, null, 2));
} catch (error) {
  report.failure = error.message;
  throw error;
} finally {
  const reportName = process.env.TENROUTER_SMOKE_MODEL ? 'routing-' + (process.env.TENROUTER_SMOKE_PROTOCOL || 'chat') + '-' + process.env.TENROUTER_SMOKE_MODEL.replaceAll('/', '-') + (process.env.TENROUTER_SMOKE_STREAM_ONLY ? '-stream' : '') + '-acceptance.json' : 'routing-live-acceptance.json';
  await writeFile('reports/account-models/' + reportName, JSON.stringify(report, null, 2));
}

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { decodeDetector, fingerprintChallenges, fingerprintVerdict, friendlyError, probeLanguage, publishedRoutes, readChatStream, routeCandidates, referenceMatch, referenceModelId, runFingerprint } from '../src/api/fingerprint.js';
import { generateChallenges } from '../src/fingerprint/detector.js';

const bank = JSON.parse(await readFile(new URL('../src/fingerprint/bank.json', import.meta.url), 'utf8'));
const detector = decodeDetector(await readFile(new URL('../src/fingerprint/shared_detector.bin', import.meta.url)));
const sample = JSON.parse(await readFile(new URL('./fingerprint-sample.json', import.meta.url), 'utf8'));
const stream = chunks => new Response(new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk)); controller.close(); } }), { headers: { 'Content-Type': 'text/event-stream' } });
const sse = texts => [...texts.map(text => `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: text } }] })}\n\n`), 'data: [DONE]\n\n'];

test('gateway model names map to reference bank ids only on exact version match', () => {
  assert.equal(referenceModelId('cc/claude-opus-4-8', bank), 'claude-opus-4.8');
  assert.equal(referenceModelId('claude-haiku-4-5-20251001', bank), 'claude-haiku-4.5');
  assert.equal(referenceModelId('openrouter/deepseek/deepseek-v4-pro', bank), 'deepseek-v4-pro');
  assert.equal(referenceModelId('qwen3.8-27b', bank), 'qwen3.8-27b');
  assert.equal(referenceModelId('some-unknown-model', bank), null);
});

test('gateway variants and aliases are told apart from exact names', () => {
  assert.deepEqual(referenceMatch('claude-opus-4-6-thinking', bank), { id: 'claude-opus-4.6', kind: 'variant' });
  assert.deepEqual(referenceMatch('gemini-3.5-flash-high', bank), { id: 'gemini-3.5-flash', kind: 'variant' });
  assert.deepEqual(referenceMatch('gemini-3.1-pro-low', bank), { id: 'gemini-3.1-pro-preview', kind: 'variant' });
  assert.deepEqual(referenceMatch('gpt-6.1-sol', bank), { id: 'gpt-6-astra', kind: 'exact' });
  assert.deepEqual(referenceMatch('cc/claude-opus-4-8', bank), { id: 'claude-opus-4.8', kind: 'exact' });
  assert.equal(referenceMatch('glm-5.1', bank), null);
  assert.equal(referenceMatch('gemini-3-flash', bank), null);
});

test('published route resolves the downstream allowlist name from provider prefixes', () => {
  const distribution = { mode: 'allowlist', models: ['nexa/deepseek-v4.1-flash', 'cbcn/deepseek-v4.1-flash', 'aiapi/gpt-6-astra'], catalog: [] };
  // codebuddy-cn 的别名是 cbcn：只按自己的前缀取，不再把别的渠道的同名模型列出来让用户挑。
  assert.deepEqual(publishedRoutes('codebuddy-cn', 'deepseek-v4.1-flash', distribution, ['cbcn']), ['cbcn/deepseek-v4.1-flash']);
  assert.deepEqual(publishedRoutes('fengwind', 'deepseek-v4.1-flash', distribution, ['fw']), []);
  assert.deepEqual(publishedRoutes('aiapi', 'gpt-6-astra', distribution), ['aiapi/gpt-6-astra']);
  assert.deepEqual(publishedRoutes('codebuddy-cn', 'gemini-3-flash', distribution, ['cbcn']), []);
  assert.deepEqual(publishedRoutes('codebuddy-cn', 'deepseek-v4.1-flash', { mode: 'all', models: [] }, ['cbcn']), []);
  assert.deepEqual(routeCandidates('codex', 'gpt', { mode: 'all', models: [] }, 'codex/gpt', ['cx']), ['codex/gpt']);
  assert.deepEqual(routeCandidates('codebuddy-cn', 'deepseek-v4.1-flash', distribution, 'cbcn/deepseek-v4.1-flash', ['cbcn']), ['cbcn/deepseek-v4.1-flash']);
  assert.deepEqual(routeCandidates('codex', 'gpt', { mode: 'all', models: [] }, null), []);
});

test('chat stream keeps only answer text and surfaces gateway errors', async () => {
  const reasoning = `data: ${JSON.stringify({ choices: [{ index: 0, delta: { reasoning_content: '思考 999' } }] })}\n\n`;
  const partial = [];
  assert.equal((await readChatStream(stream([reasoning, ...sse(['12, 3', '4, 56'])].flatMap(chunk => [chunk.slice(0, 7), chunk.slice(7)])), text => partial.push(text))).text, '12, 34, 56');
  assert.deepEqual(partial, ['12, 3', '12, 34, 56']);
  const failure = await readChatStream(new Response(JSON.stringify({ error: 'API key required for remote API access' }), { status: 401, headers: { 'Content-Type': 'application/json' } })).catch(error => error);
  assert.equal(failure.status, 401);
  assert.equal(failure.message, 'API key required for remote API access');
  const html = await readChatStream(new Response('<html><head><title>nexavlinks.com | 502: Bad gateway</title></head><body>x</body></html>', { status: 502, headers: { 'Content-Type': 'text/html' } })).catch(error => error);
  assert.equal(html.status, 502);
  assert.equal(html.message, 'HTTP 502 · nexavlinks.com | 502: Bad gateway');
});

test('synced detector ranks the bundled reference sample as its own model', async () => {
  const replies = [...sample.answers];
  const requests = [];
  const fetcher = async (url, options) => { requests.push({ url, options, body: JSON.parse(options.body) }); return stream(sse([replies.shift().text])); };
  const outcome = await runFingerprint({ routeId: `cx/${sample.model}`, apiKey: 'sk-test', detector, bank, rounds: 3, fetcher });
  assert.equal(requests.length, 3);
  assert(requests.every(request => request.url === '/api/v1/chat/completions' && request.options.headers.Authorization === 'Bearer sk-test' && request.body.model === `cx/${sample.model}` && request.body.stream === true));
  assert.equal(new Set(requests.map(request => request.body.messages[0].content)).size, 3);
  assert.equal(outcome.analysis.results[0].model, sample.model);
  assert.equal(fingerprintVerdict(outcome.analysis, sample.model).tone, 'healthy');
  assert.equal(fingerprintVerdict(outcome.analysis, bank.models.find(model => model.id !== sample.model).id).tone, 'warning');
  assert.equal(fingerprintVerdict(outcome.analysis, null).tone, 'unknown');
});

test('long answers stop once enough numbers arrive and thinking level is forwarded', async () => {
  const numbers = Array.from({ length: 400 }, (_, i) => (i * 37) % 355 + 1);
  let pulled = 0;
  const endless = new Response(new ReadableStream({
    pull(controller) {
      pulled += 1;
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: numbers.slice(pulled * 20, pulled * 20 + 20).join(', ') + ', ' } }] })}\n\n`));
      if (pulled > 60) controller.close();
    },
  }), { headers: { 'Content-Type': 'text/event-stream' } });
  const requests = [];
  const outcome = await runFingerprint({ routeId: 'nexa/deepseek-v4.1-flash', apiKey: 'k', thinkingLevel: 'low', detector, bank, fetcher: async (url, options) => { requests.push(JSON.parse(options.body)); return endless.clone(); } });
  assert(requests.every(body => body.reasoning_effort === 'low'));
  assert(outcome.challenges.every(item => item.status === 'done' && item.capped === true));
  assert(outcome.challenges.every(item => item.numbers >= item.expected));
  assert(pulled < 60, '收够数量后应立即断开上游');
  assert.equal(outcome.thinkingLevel, 'low');
});

test('ASCII model names probe in English so the prompt language stops drifting', () => {
  assert.equal(probeLanguage('deepseek-v4.1-flash'), 'en');
  assert.equal(probeLanguage('gpt-6.1-sol'), 'en');
  assert.equal(probeLanguage('通义千问'), 'zh');
  const challenges = generateChallenges(2);
  assert(challenges.every(challenge => challenge.prompt.length > 100));
});

test('random prompts stay inside the original Chinese/English templates', () => {
  const challenges = fingerprintChallenges(12, 'random');
  assert(challenges.every(challenge => ['en', 'zh'].includes(challenge.language)), '随机只在中英之间挑，不出现日韩法题');
  assert(challenges.every(challenge => /integers from 1 to 355/.test(challenge.prompt) || /个 1 到 355/.test(challenge.prompt)));
  assert(challenges.every(challenge => !/[぀-ヿ가-힯]/.test(challenge.prompt)), '没有日文假名和韩文');
  assert(challenges.every(challenge => !/[àâçéèêëîïôùûüœ]/i.test(challenge.prompt)), '没有法文重音字符');
  assert(fingerprintChallenges(3, 'zh').every(challenge => challenge.language === 'zh' && /个 1 到 355/.test(challenge.prompt)));
  assert(fingerprintChallenges(3, 'en').every(challenge => challenge.language === 'en' && /integers from 1 to 355/.test(challenge.prompt)));
});

test('upstream failures collapse to one readable line and a raw detail', async () => {
  assert.equal(friendlyError({ status: 401, message: '[node] [401]: {"error":{"code":"authentication_error"}}' }), '上游账号认证失败（401）：渠道密钥无效或已过期');
  assert.equal(friendlyError({ status: 503, message: 'No available channel for model kimi-k3 under group default (distributor)' }), '上游暂无可用渠道（503）：该模型当前不可用');
  assert.equal(friendlyError({ status: 404, message: 'Model "pap/claude-opus-5" is not available. The gateway publishes a restricted model list' }), '网关拒绝该路由（404）：模型未在下游分发放行');
  const states = [];
  const outcome = await runFingerprint({ routeId: 'x/y', apiKey: 'k', detector, bank, rounds: 2, fetcher: async () => new Response(JSON.stringify({ error: { message: 'API Key 无效或缺失' } }), { status: 401, headers: { 'Content-Type': 'application/json' } }) });
  assert.equal(outcome.challenges.length, 2);
  assert(outcome.challenges.every(item => item.status === 'error' && item.errorShort === '上游账号认证失败（401）：渠道密钥无效或已过期'));
  assert(outcome.challenges.every(item => item.error.includes('API Key 无效或缺失')), '原始错误保留在折叠区');
});

test('English prompts are used by default for ASCII routes and one round also ranks', async () => {
  const replies = [...sample.answers];
  const prompts = [];
  const fetcher = async (url, options) => { prompts.push(JSON.parse(options.body).messages[0].content); return stream(sse([replies.shift().text])); };
  const outcome = await runFingerprint({ routeId: `cx/${sample.model}`, apiKey: 'sk', detector, bank, rounds: 1, fetcher });
  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /integers from 1 to 355/);
  assert.equal(outcome.language, 'en');
  assert.equal(outcome.challenges[0].status, 'done');
  assert.equal(outcome.analysis.used_outputs, 1);
  assert(outcome.analysis.results.length > 0, '单次回答也能给出部分排名');
});

test('program-generated numbers and failed requests do not produce a model claim', async () => {
  const random = () => Array.from({ length: 300 }, () => 1 + Math.floor(Math.random() * 355)).sort((a, b) => a - b).join(', ');
  const sorted = await runFingerprint({ routeId: 'x/y', apiKey: 'k', detector, bank, fetcher: async () => stream(sse([random()])) });
  assert.equal(sorted.analysis.decision, 'not_model');
  assert.equal(fingerprintVerdict(sorted.analysis, 'gpt-5.5').tone, 'error');
  const failed = await runFingerprint({ routeId: 'x/y', apiKey: 'k', detector, bank, fetcher: async () => new Response(JSON.stringify({ error: { message: 'upstream down' } }), { status: 502, headers: { 'Content-Type': 'application/json' } }) });
  assert(failed.challenges.every(item => item.status === 'error' && item.httpStatus === 502 && item.error === 'upstream down'));
  assert.equal(failed.analysis.results.length, 0);
  assert.equal(fingerprintVerdict(failed.analysis, 'gpt-5.5').tone, 'unknown');
});

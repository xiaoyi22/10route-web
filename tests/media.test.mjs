import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isSpeechPublished, normalizeCapacityEntry, publishSpeechRoute, saveCapacityEntry, ttsCatalog, ttsRoute, ttsVoices, normalizeVoices, speechBlob } from '../src/api/media.js';
import { isAllowedRequest } from '../src/api/policy.js';

test('capacity entries preserve disabled, empty and legacy pools', () => {
  assert.deepEqual(normalizeCapacityEntry(null), { enabled: false, roundRobin: false, models: [] });
  assert.deepEqual(normalizeCapacityEntry([{ model: 'ag/vision' }, 'oc/vision']), { enabled: true, roundRobin: false, models: ['ag/vision', 'oc/vision'] });
  assert.deepEqual(normalizeCapacityEntry({ enabled: false, roundRobin: true, models: [] }), { enabled: false, roundRobin: true, models: [] });
});

test('saving one pool retains other capabilities and unrecognized settings', async () => {
  const existing = { enabled: true, models: ['ag/old'], vendorOption: true };
  const settings = { capacityAdapter: { vision: existing, audioInput: { enabled: true, models: [] }, pdf: { enabled: false } } };
  const calls = [];
  await saveCapacityEntry('vision', { enabled: true, roundRobin: true, models: ['ag/new', 'ag/new'] }, normalizeCapacityEntry(existing), async (url, options) => { calls.push({ url, options }); return settings; });
  const saved = JSON.parse(calls[1].options.body);
  assert.deepEqual(Object.keys(saved), ['capacityAdapter']);
  assert.deepEqual(saved.capacityAdapter.audioInput, settings.capacityAdapter.audioInput);
  assert.deepEqual(saved.capacityAdapter.pdf, settings.capacityAdapter.pdf);
  assert.deepEqual(saved.capacityAdapter.vision.models, ['ag/new']);
  assert.equal(saved.capacityAdapter.vision.vendorOption, true);
  assert.deepEqual(existing.models, ['ag/old']);
});

test('concurrent pool changes are not silently overwritten and invalid models are rejected', async () => {
  const send = async () => ({ capacityAdapter: { vision: { models: ['ag/changed'] } } });
  await assert.rejects(saveCapacityEntry('vision', { models: ['ag/new'] }, normalizeCapacityEntry({ models: ['ag/old'] }), send), /其他操作修改/);
  await assert.rejects(saveCapacityEntry('vision', { models: ['bad model'] }, normalizeCapacityEntry({ models: ['ag/changed'] }), send), /模型路由/);
});

test('TTS catalog covers registered providers and provider-specific model/voice routes', () => {
  assert.equal(ttsCatalog.length, 24);
  assert.equal(new Set(ttsCatalog.map(provider => provider.id)).size, ttsCatalog.length);
  const openrouter = ttsCatalog.find(provider => provider.id === 'openrouter');
  assert.equal(ttsRoute(openrouter, 'openai/tts-1', 'alloy'), 'openrouter/openai/tts-1/alloy');
  assert.equal(ttsRoute(openrouter, 'openai/tts-1', ''), 'openrouter/openai/tts-1/alloy');
  assert(!ttsVoices(openrouter, 'openai/tts-1').some(voice => voice.id === 'marin'));
  const edge = ttsCatalog.find(provider => provider.id === 'edge-tts');
  assert.equal(ttsRoute(edge, '', 'zh-CN-XiaoxiaoNeural'), 'edge-tts/zh-CN-XiaoxiaoNeural');
  assert.equal(edge.noAuth, true);
  const coqui = ttsCatalog.find(provider => provider.id === 'coqui');
  assert.equal(ttsRoute(coqui, coqui.models[0].id, ''), 'coqui/tts_models/en/ljspeech/tacotron2-DDC');
});

test('voice API shapes are normalized without duplicates', () => {
  assert.deepEqual(normalizeVoices({ byLang: { en: { voices: [{ id: 'same', name: 'Voice' }] }, zh: { voices: [{ id: 'same', name: 'Voice' }] } } }), [{ id: 'same', name: 'Voice' }]);
  assert.deepEqual(normalizeVoices({ voices: [] }), []);
});

test('speech publication preserves the restricted list and accepts canonical aliases', async () => {
  const provider = ttsCatalog.find(item => item.id === 'elevenlabs');
  assert.equal(isSpeechPublished(null, 'el/model/voice', provider), false);
  assert.equal(isSpeechPublished({ mode: 'allowlist', models: ['elevenlabs/model/voice'] }, 'el/model/voice', provider), true);
  assert.equal(isSpeechPublished({ mode: 'allowlist', models: [] }, 'el/model/voice', provider), false);
  const calls = [];
  await publishSpeechRoute('el/model/voice', async (url, options) => { calls.push({ url, options }); return { mode: 'allowlist', models: ['fw/existing'] }; });
  assert.deepEqual(JSON.parse(calls[1].options.body), { mode: 'allowlist', models: ['fw/existing', 'el/model/voice'] });
});

test('speech audio is validated and decoded as binary', async () => {
  const blob = speechBlob({ audio: Buffer.from('RIFF-audio').toString('base64'), format: 'wav' });
  assert.equal(blob.type, 'audio/wav');
  assert.equal(await blob.text(), 'RIFF-audio');
  assert.throws(() => speechBlob({ audio: 'test', format: '<script>' }), /有效音频/);
  assert.throws(() => speechBlob({}), /有效音频/);
});

test('speech synthesis remains management-only with narrowly scoped voice reads', () => {
  assert.equal(isAllowedRequest('/api/v1/audio/speech?response_format=json', 'POST', true), true);
  assert.equal(isAllowedRequest('/api/v1/audio/speech', 'POST', false), false);
  assert.equal(isAllowedRequest('/api/v1/audio/speech', 'GET', true), false);
  for (const provider of ['elevenlabs', 'minimax', 'inworld', 'deepgram']) assert.equal(isAllowedRequest(`/api/media-providers/tts/${provider}/voices`, 'GET'), true);
  assert.equal(isAllowedRequest('/api/media-providers/tts/unknown/voices', 'GET', true), false);
  assert.equal(isAllowedRequest('/api/media-providers/tts/voices', 'POST', true), false);
});

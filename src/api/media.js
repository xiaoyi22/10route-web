import ttsCatalog from './tts-catalog.json' with { type: 'json' };
import { requestJson } from './client.js';

export { ttsCatalog };

export function normalizeCapacityEntry(value) {
  if (Array.isArray(value)) return { enabled: true, roundRobin: false, models: value.map(item => item?.model || item).filter(item => typeof item === 'string' && item) };
  return { enabled: !!value && value.enabled !== false, roundRobin: !!value?.roundRobin, models: Array.isArray(value?.models) ? [...value.models] : [] };
}

export async function saveCapacityEntry(key, value, initial, send = requestJson) {
  const latest = await send('/api/settings');
  const existing = latest.capacityAdapter?.[key];
  if (JSON.stringify(normalizeCapacityEntry(existing)) !== JSON.stringify(initial)) throw new Error('此模型池已被其他操作修改，请刷新后重新编辑。');
  const models = [...new Set(value.models.map(model => model.trim()))];
  if (models.some(model => !/^[^\s/]+\/\S+$/.test(model))) throw new Error('模型路由须为供应商前缀/模型 ID，且不能包含空格。');
  const capacityAdapter = { ...latest.capacityAdapter, [key]: { ...(existing && !Array.isArray(existing) ? existing : {}), ...value, models } };
  await send('/api/settings', { method: 'PATCH', body: JSON.stringify({ capacityAdapter }) });
}

export function ttsVoices(provider, model) {
  return provider?.voicesPerModel?.[model] || provider?.voices || [];
}

export function ttsRoute(provider, model, voice) {
  if (!provider) return '';
  const selectedVoice = voice.trim() || (model.trim() ? provider.defaultVoice || ttsVoices(provider, model.trim())[0]?.id || '' : '');
  return [provider.alias, model.trim(), selectedVoice].filter(Boolean).join('/');
}

export function isSpeechPublished(distribution, route, provider) {
  if (!distribution) return false;
  if (distribution.mode !== 'allowlist') return true;
  const canonical = provider.id + route.slice(route.indexOf('/'));
  return (distribution.models || []).includes(route) || (distribution.models || []).includes(canonical);
}

export async function publishSpeechRoute(route, send = requestJson) {
  const latest = await send('/api/models/distribution');
  if (latest.mode !== 'allowlist') return;
  await send('/api/models/distribution', { method: 'PUT', body: JSON.stringify({ mode: 'allowlist', models: [...new Set([...(latest.models || []), route])] }) });
}

export function normalizeVoices(data) {
  const voices = data.voices || Object.values(data.byLang || {}).flatMap(group => group.voices || []);
  return [...new Map(voices.filter(voice => voice?.id).map(voice => [voice.id, { id: voice.id, name: voice.name || voice.id }])).values()];
}

export function speechBlob(data) {
  const format = String(data.format || 'mp3').toLowerCase();
  const types = { mp3: 'audio/mpeg', mpeg: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac', pcm: 'audio/pcm' };
  if (!types[format] || typeof data.audio !== 'string' || !data.audio) throw new Error('语音接口未返回有效音频。');
  const binary = atob(data.audio);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new Blob([bytes], { type: types[format] });
}

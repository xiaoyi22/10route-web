import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4326';
const directory = resolve(process.env.USERPROFILE, '.codex/tmp/10router-media-20261015');
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const report = { realReads: [], isolatedChecks: [], screenshots: [], liveSpeech: null };
let isolated = false;
let settings;
let accounts = [];
let failSpeech = false;
let failSave = false;
let distribution = { mode: 'allowlist', models: ['fw/existing'] };
let writes = 0;
const wav = Buffer.alloc(44 + 3200);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(3200, 40);

await page.route('**/api/**', async route => {
  if (!isolated) return route.continue();
  const request = route.request();
  const url = new URL(request.url());
  const method = request.method();
  const send = (body, status = 200) => route.fulfill({ status, json: body });
  if (url.pathname === '/api/settings') {
    if (method === 'PATCH') {
      writes++;
      if (failSave) return send({ error: '隔离保存失败' }, 500);
      Object.assign(settings, request.postDataJSON());
    }
    return send(settings);
  }
  if (url.pathname === '/api/keys') return send({ keys: [{ id: 'isolated-key', name: '隔离试听密钥', key: 'isolated-not-a-real-key' }] });
  if (url.pathname === '/api/models/distribution') {
    if (method === 'PUT') distribution = request.postDataJSON();
    return send(distribution);
  }
  if (url.pathname === '/api/providers') {
    if (method === 'POST') { accounts.push({ ...request.postDataJSON(), id: 'isolated-tts', isActive: true, authType: 'apikey' }); return send(accounts.at(-1), 201); }
    return send({ connections: accounts });
  }
  if (url.pathname === '/api/providers/isolated-tts') {
    if (method === 'DELETE') accounts = [];
    else Object.assign(accounts[0], request.postDataJSON());
    return send({ success: true });
  }
  if (url.pathname.startsWith('/api/media-providers/tts/')) return send({ voices: [{ id: 'zh-CN-XiaoxiaoNeural', name: '晓晓' }] });
  if (url.pathname === '/api/v1/audio/speech') {
    assert.equal(request.postDataJSON().model, 'edge-tts/zh-CN-XiaoxiaoNeural');
    return failSpeech ? send({ error: { message: '隔离上游故障' } }, 502) : send({ audio: wav.toString('base64'), format: 'wav' });
  }
  assert.equal(method, 'GET', 'Unexpected production write: ' + url.pathname);
  return route.continue();
});

try {
  const credentials = parseEnv(await readFile(resolve(process.env.USERPROFILE, '.codex/credentials/10router-web.env'), 'utf8'));
  const health = await context.request.get(base + '/api/health');
  assert.equal(health.status(), 200); assert.equal((await health.json()).driver, 'better-sqlite3');
  const login = await context.request.post(base + '/api/auth/login', { data: { password: credentials.TENROUTER_TEST_PASSWORD } });
  assert.equal(login.status(), 200);
  const actual = await context.request.get(base + '/api/settings');
  assert.equal(actual.status(), 200); settings = await actual.json();
  await page.goto(base + '/dashboard/combos');
  await page.getByRole('heading', { name: '组合模型', exact: true }).waitFor();
  assert.equal(await page.getByRole('region', { name: '默认模型' }).count(), 0);
  await page.goto(base + '/dashboard/settings');
  await page.getByRole('button', { name: '默认识图模型', exact: true }).click();
  assert.equal(new URL(page.url()).searchParams.get('tab'), 'vision');
  await page.getByRole('button', { name: '编辑默认识图模型', exact: true }).waitFor();
  const section = page.getByRole('region', { name: '默认模型' });
  for (const model of settings.capacityAdapter.vision.models) await section.getByText(model, { exact: false }).waitFor();
  report.realReads.push('Default vision settings are under System Settings, not Combos; actual vision and audio pools match; no settings writes');
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const file = resolve(directory, `capacity-real-${width}.png`); await page.screenshot({ path: file, fullPage: true, animations: 'disabled' }); report.screenshots.push(file);
  }
  await page.goto(base + '/dashboard/media-providers/tts');
  await page.getByRole('button', { name: '生成试听', exact: true }).waitFor();
  assert.equal(await page.getByLabel('语音供应商', { exact: true }).locator('option').count(), 25);
  report.realReads.push('All 24 registered TTS providers are selectable; real connections and gateway key names load');
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const file = resolve(directory, `tts-real-${width}.png`); await page.screenshot({ path: file, fullPage: true, animations: 'disabled' }); report.screenshots.push(file);
  }

  isolated = true;
  const audioPool = JSON.stringify(settings.capacityAdapter.audioInput);
  await page.goto(base + '/dashboard/settings?tab=vision');
  await page.getByRole('button', { name: '编辑默认识图模型', exact: true }).click();
  const originalModels = [...settings.capacityAdapter.vision.models];
  await page.getByLabel('模型路由', { exact: true }).fill('isolated/vision');
  await page.getByRole('button', { name: '添加兜底模型', exact: true }).click();
  await page.getByLabel('模型池调度').selectOption('round-robin');
  await page.getByRole('button', { name: '上移 isolated/vision', exact: true }).click();
  await page.getByRole('button', { name: '保存模型池', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(settings.capacityAdapter.vision.roundRobin, true);
  assert(settings.capacityAdapter.vision.models.includes('isolated/vision'));
  assert.equal(JSON.stringify(settings.capacityAdapter.audioInput), audioPool);
  await page.reload();
  await page.getByRole('button', { name: '编辑默认识图模型', exact: true }).click();
  await page.getByRole('button', { name: '移除 isolated/vision', exact: true }).click();
  failSave = true;
  await page.getByRole('button', { name: '保存模型池', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '隔离保存失败' }).waitFor();
  assert(settings.capacityAdapter.vision.models.includes('isolated/vision'));
  failSave = false;
  settings.capacityAdapter.vision.models = originalModels;
  const beforeConflict = writes;
  await page.getByRole('button', { name: '保存模型池', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '其他操作修改' }).waitFor();
  assert.equal(writes, beforeConflict);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  report.isolatedChecks.push('Pool add/reorder/save/reload, sibling preservation, save failure and concurrent-change rejection');

  await page.goto(base + '/dashboard/media-providers/tts/openai');
  await page.getByRole('button', { name: '添加语音账号', exact: true }).click();
  await page.getByLabel('连接名称', { exact: true }).fill('隔离语音账号');
  await page.getByLabel('上游 API Key', { exact: true }).fill('isolated-test-key');
  await page.getByRole('button', { name: '保存连接', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '编辑语音账号 隔离语音账号', exact: true }).waitFor();
  await page.getByLabel('启用语音账号 隔离语音账号', { exact: true }).click();
  await page.getByText('尚无已启用账号', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('启用语音账号 隔离语音账号', { exact: true }).isChecked(), false);
  await page.getByLabel('启用语音账号 隔离语音账号', { exact: true }).click();
  await page.getByText('1 个已启用账号', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('启用语音账号 隔离语音账号', { exact: true }).isChecked(), true);
  await page.getByRole('button', { name: '删除语音账号 隔离语音账号', exact: true }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  report.isolatedChecks.push('TTS account create, enable/disable and delete reuse provider routes');
  await page.getByLabel('语音供应商', { exact: true }).selectOption('edge-tts');
  await page.getByRole('button', { name: '读取音色列表', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('#tts-voice-options option')].some(option => option.value === 'zh-CN-XiaoxiaoNeural'));
  await page.getByLabel('音色 / Voice ID', { exact: true }).fill('zh-CN-XiaoxiaoNeural');
  assert.equal(await page.getByRole('button', { name: '生成试听', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: '发布当前路由', exact: true }).click();
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.deepEqual(distribution.models, ['fw/existing', 'edge-tts/zh-CN-XiaoxiaoNeural']);
  failSpeech = true;
  await page.getByRole('button', { name: '生成试听', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '隔离上游故障' }).waitFor();
  failSpeech = false;
  await page.getByRole('button', { name: '生成试听', exact: true }).click();
  await page.getByLabel('语音试听').waitFor();
  await page.waitForFunction(() => document.querySelector('audio')?.readyState > 0);
  assert(await page.locator('audio').evaluate(audio => audio.duration > 0));
  const downloading = page.waitForEvent('download');
  await page.getByRole('link', { name: '下载音频', exact: true }).click();
  assert.equal((await downloading).suggestedFilename(), 'speech.wav');
  report.isolatedChecks.push('Explicit route publication preserving whitelist, voice listing, nested upstream errors, retry, decodable WAV playback and download');

  if (process.env.RUN_LIVE_TTS === '1') {
    isolated = false;
    await page.goto(base + '/dashboard/media-providers/tts/google-tts');
    await page.getByLabel('音色 / Voice ID', { exact: true }).fill('zh-CN');
    await page.getByLabel('试听文本', { exact: true }).fill('语音测试。');
    await page.getByText('当前语音路由未发布到下游', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '生成试听', exact: true }).isDisabled(), true);
    report.liveSpeech = { provider: 'google-tts', status: 'blocked-by-production-allowlist', configurationChanged: false };
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ realReads: report.realReads, isolatedChecks: report.isolatedChecks, liveSpeech: report.liveSpeech, errors }));
} finally {
  await page.screenshot({ path: resolve(directory, 'last-state.png'), fullPage: true }).catch(() => {});
  await writeFile(resolve(directory, 'acceptance.json'), JSON.stringify(report, null, 2));
  await browser.close();
}

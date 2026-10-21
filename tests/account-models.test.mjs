import assert from 'node:assert/strict';
import test from 'node:test';
import { accountModelIds, supportsAccountModels, fetchAccountModels, saveAccountModels, syncAccountModels } from '../src/api/account-models.js';
import { normalizeProviders } from '../src/api/client.js';

const provider = 'openai-compatible-chat-aiapi';
const dp = { id: 'dp', provider, isActive: true };

test('账号模型范围只作用于支持筛选的兼容节点，列表保留范围而不暴露凭据', () => {
  assert(supportsAccountModels(provider));
  assert(supportsAccountModels('anthropic-compatible-test'));
  assert(!supportsAccountModels('antigravity'));
  const [connection] = normalizeProviders({ connections: [{ ...dp, apiKey: 'private', providerSpecificData: { enabledModels: ['deepseek'], secret: 'private' } }] });
  assert.deepEqual(connection.enabledModels, ['deepseek']);
  assert(!JSON.stringify(connection).includes('private'));
  assert.equal(normalizeProviders({ connections: [dp] })[0].enabledModels, null);
});

test('按精确上游 ID 解析并去重，拒绝空列表、部分损坏和回退目录', () => {
  assert.deepEqual(accountModelIds({ models: ['deepseek', { id: 'gpt' }, { model: 'deepseek' }, { name: 'claude' }] }), ['deepseek', 'gpt', 'claude']);
  for (const result of [{ models: [] }, { models: {} }, { models: ['deepseek', {}] }, { models: ['deepseek'], warning: '静态目录回退' }]) {
    assert.throws(() => accountModelIds(result));
  }
});

test('同供应商两把 key 分别读取模型，仅更新对应账号范围', async () => {
  const writes = [];
  const progress = [];
  const send = async (url, options) => {
    if (options.method === 'PUT') { writes.push({ url, body: JSON.parse(options.body) }); return {}; }
    return { models: url.includes('/dp/') ? ['deepseek'] : ['gpt'] };
  };
  const results = await syncAccountModels([dp, { ...dp, id: 'default' }], value => progress.push(value.length), send);
  assert.deepEqual(results.map(result => [result.status, result.count]), [['success', 1], ['success', 1]]);
  assert.deepEqual(writes, [
    { url: '/api/providers/dp', body: { providerSpecificData: { enabledModels: ['deepseek'] } } },
    { url: '/api/providers/default', body: { providerSpecificData: { enabledModels: ['gpt'] } } },
  ]);
  assert.deepEqual(progress, [1, 2]);
});

test('空列表、权限错误、超时和写入失败逐账号报告，不覆盖旧范围且继续处理其他账号', async () => {
  const stored = new Map(['empty', 'error', 'timeout', 'write-error', 'good'].map(id => [id, ['old-model']]));
  const writes = [];
  const send = async (url, options) => {
    const id = url.split('/')[3];
    if (options.method === 'PUT') {
      if (id === 'write-error') throw new Error('HTTP 503');
      writes.push(id); stored.set(id, JSON.parse(options.body).providerSpecificData.enabledModels); return {};
    }
    if (id === 'empty') return { models: [] };
    if (id === 'error') throw new Error('HTTP 403');
    if (id === 'timeout') throw new DOMException('超时', 'TimeoutError');
    return { models: ['new-model'] };
  };
  const results = await syncAccountModels([...stored.keys()].map(id => ({ ...dp, id })), () => {}, send);
  assert.deepEqual(results.map(result => result.status), ['error', 'error', 'error', 'error', 'success']);
  assert.deepEqual(writes, ['good']);
  for (const id of ['empty', 'error', 'timeout', 'write-error']) assert.deepEqual(stored.get(id), ['old-model']);
});

test('跳过停用账号和内置供应商，手动解除范围使用 null 且禁止保存空白名单', async () => {
  let calls = 0;
  const skipped = await syncAccountModels([{ ...dp, isActive: false }, { ...dp, provider: 'codex' }], () => {}, async () => { calls++; });
  assert.equal(calls, 0);
  assert(skipped.every(result => result.status === 'skipped'));
  await saveAccountModels(dp, null, async (url, options) => {
    calls++; assert.deepEqual(JSON.parse(options.body), { providerSpecificData: { enabledModels: null } });
  });
  assert.equal(calls, 1);
  await assert.rejects(saveAccountModels(dp, [], async () => { throw new Error('不得发起空范围写入'); }), /空模型/);
  await assert.rejects(fetchAccountModels({ provider: 'codex' }, async () => { throw new Error('不得查询'); }), /不支持/);
});

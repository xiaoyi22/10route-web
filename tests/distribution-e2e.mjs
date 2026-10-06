import assert from 'node:assert/strict';
import { openLiveSession } from './live-support.mjs';

const backend = process.env.DISTRIBUTION_TEST_BACKEND || 'http://192.168.11.150:20129';
assert.equal(new URL(backend).port, '20129', 'Distribution write acceptance requires the isolated backend');
assert.equal(new URL(process.env.PREVIEW_URL || 'http://127.0.0.1:4317').port, '4320', 'Requires the isolated preview');
const session = await openLiveSession('distribution-write');
const { page, context, base, read, check, backupDatabase, finish, report } = session;
report.data = 'isolated-real-gateway';
let original;
let imported;
let failure;
const selectedRows = page.locator('[data-selected-model-id]');
const save = page.getByRole('button', { name: '保存分发设置', exact: true });
const search = page.getByLabel('搜索分发模型');
const config = async () => {
  const value = await read('/api/models/distribution');
  return { mode: value.mode, models: value.models };
};
try {
  original = await config();
  await backupDatabase();
  const [initial, combinations, nodes, keys] = await Promise.all([
    read('/api/models/distribution'), read('/api/combos'), read('/api/provider-nodes'), read('/api/keys'),
  ]);
  assert(Array.isArray(initial.catalog) && initial.catalog.length, 'Complete gateway catalog required');
  const combo = combinations.combos.find(combo => combo.name === 'deepseek-v4-flash');
  const regular = initial.catalog.find(model => model.id === combo?.models[0]);
  assert(regular && combo, 'Acceptance uses the existing real DeepSeek model and combo');
  const hiddenMember = combo.models.find(id => id !== regular.id);
  assert(hiddenMember, 'Combo must have an unpublished member');
  const key = keys.keys.find(key => key.isActive && key.key)?.key;
  assert(key, 'Active gateway API key required');
  const headers = { Authorization: `Bearer ${key}` };
  const list = async () => {
    const response = await context.request.get(backend + '/api/v1/models', { headers });
    assert.equal(response.status(), 200);
    return (await response.json()).data.map(model => model.id);
  };
  await page.goto(base + '/dashboard/distribution', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.querySelector('.distribution-segment button')?.disabled);
  await page.getByRole('button', { name: '清空清单', exact: true }).click();
  for (const id of [combo.name, regular.id]) {
    await search.fill(id);
    await page.getByLabel(`发布 ${id}`, { exact: true }).check();
  }
  assert.equal(await selectedRows.count(), 2);
  await page.route('**/api/models/distribution', route => route.request().method() === 'PUT'
    ? route.fulfill({ status: 503, json: { error: '分发保存失败测试' } }) : route.continue());
  await save.click();
  await page.getByRole('alert').getByText('分发保存失败测试').waitFor();
  assert.equal(await selectedRows.count(), 2);
  assert.deepEqual(await config(), original);
  await page.unroute('**/api/models/distribution');
  report.errors = report.errors.filter(message => !message.includes('503 (Service Unavailable)'));
  check('保存失败保留草稿，实际配置未改变');

  const saving = page.waitForResponse(response => new URL(response.url()).pathname === '/api/models/distribution' && response.request().method() === 'PUT');
  await save.click();
  assert.equal((await saving).status(), 200);
  const wanted = [combo.name, regular.id].sort();
  assert.deepEqual((await config()).models.sort(), wanted);
  assert.deepEqual((await list()).sort(), wanted);
  const current = await read('/api/models/distribution');
  assert(current.catalog.some(model => model.id === hiddenMember), 'Management catalog must retain unpublished models');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('当前发布 2 个模型', { exact: true }).waitFor();
  assert.equal(await selectedRows.count(), 2);
  check('已保存指定清单，刷新后保持；下游列表只返回已选模型，候选清单保留未选模型');

  for (const [path, data] of [
    ['/api/v1/chat/completions', { model: hiddenMember, messages: [{ role: 'user', content: 'Reply OK' }], stream: false }],
    ['/api/v1/responses', { model: hiddenMember, input: 'Reply OK', stream: false }],
    ['/api/v1/messages', { model: hiddenMember, messages: [{ role: 'user', content: 'Reply OK' }], max_tokens: 4 }],
  ]) {
    const response = await context.request.post(backend + path, { headers, data });
    assert.equal(response.status(), 404, path);
    assert.match((await response.json()).error.message, /restricted model list/);
  }
  check('未发布的组合成员在三种聊天协议中均被拒绝直接调用');
  for (const id of [regular.id, combo.name]) {
    if (id === combo.name) {
      const reduced = await context.request.put(base + '/api/models/distribution', { data: { mode: 'allowlist', models: [combo.name] } });
      assert.equal(reduced.status(), 200);
      assert.deepEqual(await list(), [combo.name]);
    }
    const response = await context.request.post(backend + '/api/v1/chat/completions', {
      headers, timeout: 60000, data: { model: id, messages: [{ role: 'user', content: 'Reply OK' }], max_tokens: 4, stream: false },
    });
    assert.equal(response.status(), 200, `Real call failed: ${id} HTTP ${response.status()}`);
    assert((await response.json()).choices?.[0]?.message?.content, 'Real upstream answer required');
  }
  check('已选模型真实调用成功，组合模型通过未单独发布的成员完成内部路由');

  const node = nodes.nodes.find(node => node.prefix === regular.id.split('/')[0]);
  assert(node);
  imported = { providerAlias: node.id, id: `distribution-unpublished-${Date.now()}`, type: 'llm', enabled: true };
  const added = await context.request.post(base + '/api/models/custom', { data: imported });
  assert.equal(added.status(), 200);
  const newId = `${node.prefix}/${imported.id}`;
  assert((await read('/api/models/distribution')).catalog.some(model => model.id === newId));
  assert(!(await list()).includes(newId));
  const rejected = await context.request.post(backend + '/api/v1/chat/completions', {
    headers, data: { model: newId, messages: [{ role: 'user', content: 'Reply OK' }] },
  });
  assert.equal(rejected.status(), 404);
  check('新登记模型出现在候选清单，未勾选时不对下游发布且禁止调用');
  assert.deepEqual(report.errors, []);
} catch (error) { failure = error; }
finally {
  try {
    if (imported) {
      const query = new URLSearchParams({ providerAlias: imported.providerAlias, id: imported.id, type: imported.type });
      const removed = await context.request.delete(base + '/api/models/custom?' + query);
      assert.equal(removed.status(), 200);
    }
    if (original) {
      const restored = await context.request.put(base + '/api/models/distribution', { data: original });
      assert.equal(restored.status(), 200);
      assert.deepEqual(await config(), original);
      check('已恢复隔离服务的原始分发配置并清理测试模型');
    }
  } catch (error) { failure ||= error; }
  await finish(failure);
}
if (failure) throw failure;

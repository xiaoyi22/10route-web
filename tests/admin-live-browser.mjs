import assert from 'node:assert/strict';
import { openLiveSession } from './live-support.mjs';

const live = await openLiveSession('pricing-proxy-pools');
const { base, page, context, read, check } = live;
let failure;
let createdPool;
let changedPrice;
let originalPrice;
try {
  const backup = await live.backupDatabase();
  const pricing = await read('/api/pricing');
  const poolData = await read('/api/proxy-pools?includeUsage=true');
  assert(poolData.proxyPools.length, '需要真实代理池进行连接测试');
  const candidate = Object.entries(pricing).flatMap(([provider, models]) => Object.entries(models).map(([name, rates]) => ({ provider, name, rates }))).find(model => typeof model.rates.input === 'number');
  assert(candidate, '需要真实模型价格进行编辑回读测试');
  await page.goto(base + '/dashboard/pricing');
  await page.getByRole('heading', { name: '模型价格', exact: true }).waitFor();
  await page.getByRole('button', { name: `编辑价格 ${candidate.provider}/${candidate.name}`, exact: true }).waitFor();
  await live.screenshots('/dashboard/pricing', 'pricing');
  await page.getByLabel('搜索价格').fill(candidate.name);
  await page.getByRole('button', { name: `编辑价格 ${candidate.provider}/${candidate.name}`, exact: true }).click();
  const dialog = page.getByRole('dialog');
  assert.equal(await dialog.getByLabel('输入价格', { exact: true }).inputValue(), String(candidate.rates.input));
  originalPrice = backup.pricing[candidate.provider]?.[candidate.name];
  changedPrice = candidate;
  const next = Number((candidate.rates.input + 0.000001).toFixed(8));
  await dialog.getByLabel('输入价格', { exact: true }).fill(String(next));
  const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/pricing' && response.request().method() === 'PATCH');
  await dialog.getByRole('button', { name: '保存价格', exact: true }).click();
  assert.equal((await saved).status(), 200);
  await dialog.waitFor({ state: 'hidden' });
  assert.equal((await read('/api/pricing'))[candidate.provider][candidate.name].input, next);
  await page.reload();
  await page.getByLabel('搜索价格').fill(candidate.name);
  await page.getByRole('button', { name: `编辑价格 ${candidate.provider}/${candidate.name}`, exact: true }).click();
  assert.equal(await page.getByLabel('输入价格', { exact: true }).inputValue(), String(next));
  await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
  check('价格：真实模型编辑成功，HTTP 200，独立接口回读与刷新后的表单一致');
  await page.getByRole('button', { name: `恢复默认价格 ${candidate.provider}/${candidate.name}`, exact: true }).click();
  const reset = page.waitForResponse(response => new URL(response.url()).pathname === '/api/pricing' && response.request().method() === 'DELETE');
  await page.getByRole('button', { name: '确认恢复默认', exact: true }).click();
  assert.equal((await reset).status(), 200);
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  if (originalPrice) assert.equal((await context.request.patch(base + '/api/pricing', { data: { [candidate.provider]: { [candidate.name]: originalPrice } } })).status(), 200);
  assert.deepEqual((await read('/api/pricing'))[candidate.provider]?.[candidate.name], candidate.rates);
  changedPrice = null;
  check('价格：恢复默认流程通过，已恢复验收前真实价格并核对');

  await page.goto(base + '/dashboard/proxy-pools');
  await page.getByRole('heading', { name: '代理池', exact: true }).waitFor();
  for (const pool of poolData.proxyPools) await page.getByRole('article', { name: `代理池 ${pool.name}`, exact: true }).waitFor();
  assert.equal(await page.getByRole('article').count(), poolData.proxyPools.length);
  await live.screenshots('/dashboard/proxy-pools', 'proxy-pools');
  const realPool = poolData.proxyPools.find(pool => pool.type === 'http' && pool.isActive);
  assert(realPool, '需要已启用的真实 HTTP/SOCKS 代理');
  const name = `界面验收-${Date.now()}`;
  await page.getByRole('button', { name: '新增代理池', exact: true }).click();
  await page.getByLabel('代理池名称', { exact: true }).fill(name);
  await page.getByLabel('代理地址', { exact: true }).fill(realPool.proxyUrl);
  const create = page.waitForResponse(response => new URL(response.url()).pathname === '/api/proxy-pools' && response.request().method() === 'POST');
  await page.getByRole('button', { name: '保存代理池', exact: true }).click();
  const created = await create;
  assert.equal(created.status(), 201);
  createdPool = (await created.json()).proxyPool;
  const card = page.getByRole('article', { name: `代理池 ${name}`, exact: true });
  await card.waitFor();
  await card.getByRole('button', { name: '编辑', exact: true }).click();
  assert.equal(await page.getByLabel('替换代理地址').inputValue(), '');
  await page.getByLabel('绕过代理', { exact: true }).fill('localhost,127.0.0.1');
  await page.getByRole('button', { name: '保存代理池', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.reload();
  await card.getByText('localhost,127.0.0.1', { exact: true }).waitFor();
  await card.getByRole('button', { name: `停用代理池 ${name}`, exact: true }).click();
  await card.getByText('已停用', { exact: true }).waitFor();
  assert.equal((await read('/api/proxy-pools')).proxyPools.find(pool => pool.id === createdPool.id).isActive, false);
  await card.getByRole('button', { name: '检测', exact: true }).click();
  const test = page.waitForResponse(response => new URL(response.url()).pathname === `/api/proxy-pools/${createdPool.id}/test`);
  await page.getByRole('button', { name: '开始检测', exact: true }).click();
  const tested = await test;
  assert.equal(tested.status(), 200);
  assert.equal((await tested.json()).ok, true, '真实代理检测失败');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await card.getByText('已启用', { exact: true }).waitFor();
  check('代理池：使用现有真实出口创建记录，编辑、刷新、停用与真实连通性测试通过');
  await card.getByRole('button', { name: `删除代理池 ${name}`, exact: true }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await card.waitFor({ state: 'hidden' });
  assert(!(await read('/api/proxy-pools')).proxyPools.some(pool => pool.id === createdPool.id));
  createdPool = null;
  assert.deepEqual((await read('/api/proxy-pools?includeUsage=true')).proxyPools, poolData.proxyPools);
  check('代理池：删除成功，原有代理池与绑定记录完全保持一致');
  assert.deepEqual(live.report.errors, []);
} catch (error) { failure = error; console.error(error.message); }
finally {
  try {
    if (createdPool) assert.equal((await context.request.delete(base + `/api/proxy-pools/${createdPool.id}`)).status(), 200);
    if (changedPrice) {
      assert.equal((await context.request.delete(base + `/api/pricing?provider=${encodeURIComponent(changedPrice.provider)}&model=${encodeURIComponent(changedPrice.name)}`)).status(), 200);
      if (originalPrice) assert.equal((await context.request.patch(base + '/api/pricing', { data: { [changedPrice.provider]: { [changedPrice.name]: originalPrice } } })).status(), 200);
    }
  } catch (error) { failure ||= error; console.error('验收配置恢复失败：' + error.message); }
  await live.finish(failure);
}
if (failure) throw failure;

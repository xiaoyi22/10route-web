import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { openLiveSession } from './live-support.mjs';

const session = await openLiveSession('subscription-update');
const { page, read, check, report, directory } = session;
let failure;
try {
  await page.goto(session.base + '/dashboard/proxy');
  await page.getByRole('tab', { name: '机场与订阅', exact: true }).click();
  const before = await read('/api/hermes/subscription/status');
  const airports = before.airports.filter(airport => ['suxin', 'ap_1367faac'].includes(airport.id));
  assert.equal(airports.length, 2);
  for (const airport of process.env.SUBSCRIPTION_VERIFY_ONLY === '1' ? [] : airports) {
    const current = await read('/api/hermes/subscription/status');
    const beforeTime = current.airports.find(item => item.id === airport.id).updated_at;
    const button = page.getByRole('button', { name: `更新节点 ${airport.name}`, exact: true });
    await button.click();
    const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/hermes/subscription/update' && response.request().method() === 'POST', { timeout: 125000 });
    await page.getByRole('dialog').getByRole('button', { name: '确认操作', exact: true }).click();
    const response = await responsePromise;
    const result = await response.json();
    assert.equal(response.status(), 200, `机场 ${airport.id} 更新失败：${result.error || response.status()}`);
    assert.equal(result.success, true);
    assert(result.backup, '更新成功必须保留备份');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    const after = await read('/api/hermes/subscription/status');
    assert.notEqual(after.airports.find(item => item.id === airport.id).updated_at, beforeTime);
    for (const other of airports.filter(item => item.id !== airport.id)) {
      const previous = current.airports.find(item => item.id === other.id);
      assert.equal(after.airports.find(item => item.id === other.id).updated_at, previous.updated_at);
    }
    report.checks.push({ airportId: airport.id, http: response.status(), success: result.success, backup: result.backup });
    check(`已通过真实页面更新 ${airport.name}，返回成功并保存备份`);
  }
  const groups = await read('/api/hermes/proxy/groups');
  const entries = Array.isArray(groups) ? groups : groups.groups;
  const google = entries.find(group => group.name === 'ai-谷歌');
  assert(google);
  const status = await read(`/api/hermes/proxy/status?group=${encodeURIComponent('ai-谷歌')}`);
  const members = status.nodes;
  assert(Array.isArray(members) && members.length > 0);
  const names = members.map(member => member.name);
  assert(names.includes(google.now), '运行选择必须属于有效候选');
  assert(names.every(name => name.includes('美国') || name.includes('🇺🇸')));
  assert(members.every(member => member.type.toLowerCase() === 'vless' || member.name.includes('住宅')));
  const suxin = await read(`/api/hermes/proxy/status?group=${encodeURIComponent(airports.find(airport => airport.id === 'suxin').group)}`);
  const suxinMembers = suxin.nodes.map(member => member.name);
  assert(names.every(name => suxinMembers.includes(name)), '谷歌出口必须归属素心机场');
  check(`已验证 ai-谷歌 包含 ${names.length} 个美国候选，当前选择有效`);
  const screenshot = resolve(directory, 'subscription-updated.png');
  await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' });
  report.screenshots.push({ file: screenshot });
  assert.equal(report.errors.length, 0, '真实页面出现控制台错误');
} catch (error) {
  failure = error;
} finally {
  await session.finish(failure);
}
if (failure) throw failure;

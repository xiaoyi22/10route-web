import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { openLiveSession } from './live-support.mjs';

const session = await openLiveSession('one-time-airport');
const { page, read, check, report, directory } = session;
let failure;
try {
  const status = await read('/api/hermes/subscription/status');
  const airport = status.airports.find(item => item.name === 'H1P2M3 机场');
  assert(airport);
  assert.equal(status.airports.length, 3);
  assert.equal(airport.subscription_mode, 'one_time');
  assert.equal(airport.one_time_consumed, true);
  assert(!('url' in airport) && !('subscription_snapshot' in airport));
  const nodes = await read(`/api/hermes/proxy/status?group=${encodeURIComponent(airport.group)}`);
  const actual = nodes.nodes.filter(node => !['URLTest', 'Selector'].includes(node.type));
  assert.equal(actual.length, 51);
  const protocols = actual.reduce((counts, node) => { const key = node.type.toLowerCase(); counts[key] = (counts[key] || 0) + 1; return counts; }, {});
  assert.deepEqual(protocols, { anytls: 24, hysteria2: 24, vless: 3 });
  assert(actual.every(node => !node.is_info));
  const google = await read(`/api/hermes/proxy/status?group=${encodeURIComponent('ai-谷歌')}`);
  const suxin = await read(`/api/hermes/proxy/status?group=${encodeURIComponent('素心机场')}`);
  const h1Google = actual.filter(node => node.name.includes('美国') || node.name.includes('🇺🇸'));
  assert.equal(h1Google.length, 4);
  assert(h1Google.every(node => google.nodes.some(member => member.name === node.name)));
  assert(google.nodes.every(node => [...suxin.nodes, ...h1Google].some(member => member.name === node.name)));
  const best = await read(`/api/hermes/proxy/status?group=${encodeURIComponent('AI-优选')}`);
  assert.equal(actual.filter(node => best.nodes.some(member => member.name === node.name)).length, 47);
  check('已验证三个机场共存、51 个真实节点，H1P2M3 的 4 个美国节点进入 ai-谷歌、47 个节点进入 AI-优选');
  await page.goto(session.base + '/dashboard/proxy?view=subscriptions');
  const row = page.locator('.proxy-table tbody tr').filter({ hasText: 'H1P2M3 机场' });
  await row.waitFor();
  await row.getByText('一次性订阅 · 链接已使用', { exact: true }).waitFor();
  assert.equal(await row.getByRole('button', { name: '更新节点 H1P2M3 机场', exact: true }).count(), 0);
  const before = report.writes.filter(item => item.path.includes('subscription/update')).length;
  await row.getByRole('button', { name: '重新导入 H1P2M3 机场', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('重新导入 · H1P2M3 机场', { exact: true }).waitFor();
  assert.equal(await dialog.getByLabel('新订阅地址').inputValue(), '');
  assert(await dialog.getByRole('button', { name: '导入节点', exact: true }).isDisabled());
  assert.equal(report.writes.filter(item => item.path.includes('subscription/update')).length, before);
  check('已验证重新导入仅打开新链接表单，没有请求已使用链接');
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const file = resolve(directory, `import-${width}.png`);
    await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
    report.screenshots.push({ file });
  }
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: resolve(directory, 'airports.png'), fullPage: true, animations: 'disabled' });
  for (const [group, expected, label] of [
    ['ai-谷歌', h1Google, 'google-pool'],
    ['AI-优选', actual.filter(node => best.nodes.some(member => member.name === node.name)), 'best-pool'],
  ]) {
    await page.goto(session.base + '/dashboard/proxy?group=' + encodeURIComponent(group));
    await page.locator('.proxy-node-name').getByText(expected[0].name, { exact: true }).waitFor();
    await page.waitForFunction(value => document.querySelector('select[aria-label="代理组"]')?.value === value, group);
    assert.equal(await page.getByLabel('代理组', { exact: true }).inputValue(), group);
    const displayed = await page.locator('.proxy-node-name strong').allTextContents();
    assert(expected.every(node => displayed.includes(node.name)), `${group} 页面缺少 H1P2M3 节点`);
    const file = resolve(directory, `${label}.png`);
    await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
    report.screenshots.push({ file });
  }
  check('已验证两个 AI 池的真实节点页面均显示对应的 H1P2M3 节点');
  assert.equal(report.errors.length, 0, '真实页面出现控制台错误');
} catch (error) {
  failure = error;
} finally {
  await session.finish(failure);
}
if (failure) throw failure;

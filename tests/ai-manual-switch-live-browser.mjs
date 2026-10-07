import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { openLiveSession } from './live-support.mjs';

const session = await openLiveSession('ai-manual-switch-controls');
const { page, read, check, report, directory } = session;
const statusPath = group => '/api/hermes/proxy/status?group=' + encodeURIComponent(group);
const watchPath = group => '/api/hermes/proxy/failover?group=' + encodeURIComponent(group);
let failure;
try {
  const h1 = await read(statusPath('H1P2M3 机场'));
  const h1Members = new Set(h1.nodes.map(node => node.name));
  await page.goto(session.base + '/dashboard/proxy');
  for (const [group, other] of [['ai-谷歌', 'AI-优选'], ['AI-优选', 'ai-谷歌']]) {
    const before = await read(statusPath(group));
    const otherBefore = await read(statusPath(other));
    const watchBefore = await read(watchPath(group));
    const target = before.nodes.find(node => node.name !== before.now && h1Members.has(node.name)
      && node.type === 'AnyTLS' && node.alive && node.delay > 0 && node.delay < 400);
    assert(target, `${group} 缺少可用的测试节点`);
    try {
      await page.getByRole('button', { name: `切换节点 ${group}`, exact: true }).click();
      const dialog = page.getByRole('dialog');
      const picker = dialog.getByRole('combobox');
      await picker.waitFor();
      await page.waitForFunction(() => !document.querySelector('dialog select')?.disabled);
      assert(await dialog.getByRole('button', { name: '确认切换', exact: true }).isDisabled());
      await dialog.getByText(group, { exact: true }).waitFor();
      await picker.selectOption(target.name);
      assert.equal((await read(statusPath(group))).now, before.now, '确认前不得改变节点');
      for (const width of [1440, 375]) {
        await page.setViewportSize({ width, height: 1000 });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        const file = resolve(directory, `${group === 'ai-谷歌' ? 'google' : 'best'}-picker-${width}.png`);
        await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
        report.screenshots.push({ file });
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/hermes/proxy/select' && response.request().method() === 'POST');
      await dialog.getByRole('button', { name: '确认切换', exact: true }).click();
      const response = await responsePromise;
      const result = await response.json();
      assert.equal(response.status(), 200, result.error);
      assert.equal(result.now, target.name);
      await dialog.waitFor({ state: 'hidden' });
      assert.equal((await read(statusPath(group))).now, target.name);
      assert.equal((await read(statusPath(other))).now, otherBefore.now, '两个池必须独立切换');
      assert.equal((await read(watchPath(group))).observe_only, watchBefore.observe_only, '手动选择保留看护模式');
      check({ group, target: target.name, http: response.status(), otherPoolUnchanged: true, watchdogModePreserved: true });
    } finally {
      const latest = await read(statusPath(group));
      if (latest.now === target.name) {
        const response = await session.context.request.post(session.base + '/api/hermes/proxy/select', { data: { group, name: before.now } });
        assert.equal(response.status(), 200);
        assert.equal((await read(statusPath(group))).now, before.now);
        check({ group, restored: true });
        await page.getByRole('button', { name: '刷新状态', exact: true }).click();
      }
    }
  }
  assert.equal(report.errors.length, 0);
} catch (error) {
  failure = error;
} finally {
  await session.finish(failure);
}
if (failure) throw failure;

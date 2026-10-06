import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { openLiveSession } from './live-support.mjs';

const live = await openLiveSession('settings');
const { base, page, context, read, check } = live;
let failure;
let original;
let changed = false;
try {
  original = await read('/api/settings');
  await live.backupDatabase();
  await page.goto(base + '/dashboard/settings', { waitUntil: 'domcontentloaded' });
  await page.getByRole('form', { name: '全局调度', exact: true }).waitFor();
  assert.equal(await page.getByLabel('全局账号调度', { exact: true }).inputValue(), original.fallbackStrategy || 'fill-first');
  assert.equal(await page.getByLabel('账号粘滞请求次数', { exact: true }).inputValue(), String(original.stickyRoundRobinLimit ?? 3));
  await live.screenshots('/dashboard/settings', 'settings-routing');
  await page.getByRole('button', { name: '登录与安全', exact: true }).click();
  const access = page.getByRole('form', { name: '访问保护', exact: true });
  await access.waitFor();
  const toggle = access.getByRole('switch', { name: '自动检查版本更新', exact: true });
  assert.equal(await toggle.isChecked(), original.autoUpdateCheck ?? true);
  await toggle.setChecked(!(original.autoUpdateCheck ?? true));
  changed = true;
  const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/settings' && response.request().method() === 'PATCH');
  await access.getByRole('button', { name: '保存设置', exact: true }).click();
  assert.equal((await saved).status(), 200);
  assert.equal((await read('/api/settings')).autoUpdateCheck, !(original.autoUpdateCheck ?? true));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await access.waitFor();
  assert.equal(await toggle.isChecked(), !(original.autoUpdateCheck ?? true));
  await toggle.setChecked(original.autoUpdateCheck ?? true);
  const restored = page.waitForResponse(response => new URL(response.url()).pathname === '/api/settings' && response.request().method() === 'PATCH');
  await access.getByRole('button', { name: '保存设置', exact: true }).click();
  assert.equal((await restored).status(), 200);
  assert.deepEqual(await read('/api/settings'), original);
  changed = false;
  check('系统设置：真实更新偏好保存、独立回读、刷新保持、恢复原值与全量设置一致性通过');
  await live.screenshots('/dashboard/settings?tab=security', 'settings-security');
  await page.getByRole('button', { name: '出站代理', exact: true }).click();
  await page.getByRole('form', { name: '全局出站代理', exact: true }).waitFor();
  assert.equal(await page.getByLabel('代理地址', { exact: true }).inputValue(), '');
  assert.equal(await page.getByLabel('绕过代理规则', { exact: true }).inputValue(), original.outboundNoProxy || '');
  await live.screenshots('/dashboard/settings?tab=proxy', 'settings-proxy');
  await page.getByRole('button', { name: '统一登录', exact: true }).click();
  await page.getByRole('form', { name: 'OIDC 身份服务', exact: true }).waitFor();
  assert.equal(await page.getByLabel('登录方式', { exact: true }).inputValue(), original.authMode || 'password');
  assert.equal(await page.getByLabel('OIDC 客户端密钥', { exact: true }).inputValue(), '');
  await live.screenshots('/dashboard/settings?tab=sso', 'settings-sso');
  check('设置界面：真实调度、代理、登录设置展示一致，代理凭据与 OIDC 密钥不回显');
  await page.getByRole('button', { name: '备份与恢复', exact: true }).click();
  await page.getByRole('heading', { name: '备份与恢复', exact: true }).waitFor();
  await live.screenshots('/dashboard/settings?tab=database', 'settings-database');
  await page.getByRole('button', { name: '恢复备份', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '备份并恢复配置', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  check('恢复备份：无完整备份时禁止提交；真实数据库恢复留给独立真实后端验证');
  await page.goto(base + '/dashboard/pricing', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^编辑价格 / }).first().waitFor();
  await live.screenshots('/dashboard/pricing', 'pricing-mobile-cards');
  await page.setViewportSize({ width: 320, height: 1000 });
  const priceRow = page.locator('.admin-price-table tbody tr').first();
  for (const label of ['输入', '输出', '缓存读取', '缓存写入', '推理']) assert.equal(await priceRow.locator(`td[data-label="${label}"]`).isVisible(), true);
  const edit = priceRow.getByRole('button', { name: /^编辑价格 / });
  await edit.click();
  await page.getByRole('dialog').waitFor();
  assert(await page.getByRole('dialog').evaluate(element => element.scrollWidth <= element.clientWidth));
  await page.screenshot({ path: resolve(live.directory, 'pricing-dialog-320.png'), fullPage: true, animations: 'disabled' });
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  check('手机价格卡片：五类价格直接可见、编辑弹窗可用、Escape 正确关闭');
  assert.deepEqual(live.report.errors, []);
} catch (error) { failure = error; console.error(error.message); }
finally {
  if (changed) {
    try { assert.equal((await context.request.patch(base + '/api/settings', { data: { autoUpdateCheck: original.autoUpdateCheck ?? true } })).status(), 200); assert.deepEqual(await read('/api/settings'), original); }
    catch (error) { failure ||= error; console.error('真实设置恢复失败：' + error.message); }
  }
  await live.finish(failure);
}
if (failure) throw failure;

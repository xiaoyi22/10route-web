import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// 「仅正常连接」是全局偏好：列表页和供应商详情页共用。新加的 Key 状态是「未测试」，
// 筛选开着就会被藏起来，看起来像没保存成功。这里验证保存后会临时关掉筛选并提示。
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4325';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) errors.push(message.text()); });
  await page.goto(base + '/dashboard/providers');
  await page.getByLabel('登录密码').fill('linear-demo');
  await page.getByRole('button', { name: '进入管理端' }).click();
  await page.getByLabel('搜索供应商').waitFor();
  await page.getByLabel('搜索供应商').fill('OpenRouter');
  await page.waitForTimeout(200);
  await page.locator('.provider-link').first().click();
  await page.getByRole('button', { name: '新增连接' }).waitFor();
  // 详情页筛选开着且该供应商账号全异常：列表为空，但必须给出原因和「显示全部」入口。
  await page.getByLabel('仅显示正常连接').check();
  await page.getByText('「仅正常连接」已打开，未测试和异常账号都被隐藏（新加的 Key 默认在其中）。').waitFor();
  await page.getByRole('button', { name: '新增连接' }).click();
  const name = `新增 Key ${Date.now()}`;
  await page.getByLabel('连接名称').fill(name);
  await page.getByLabel('上游 API Key').fill('sk-demo-new');
  await page.getByRole('button', { name: '保存连接' }).click();
  await page.getByText('已保存。新加的 Key 在「仅正常连接」筛选下会被隐藏，已临时显示全部账号。').waitFor();
  assert.equal(await page.getByLabel('仅显示正常连接').isChecked(), false, '保存后临时关掉筛选');
  await page.getByRole('button', { name: `查看连接 ${name}` }).waitFor();
  // 再打开筛选：新连接被隐藏，但提示条写明隐藏数量，点一下就能看全部。
  await page.getByLabel('仅显示正常连接').check();
  await page.getByText(/已隐藏 \d+ 个未测试或异常账号/).waitFor();
  assert.equal(await page.getByRole('button', { name: `查看连接 ${name}` }).count(), 0);
  await page.getByRole('button', { name: '显示全部账号连接' }).click();
  await page.getByRole('button', { name: `查看连接 ${name}` }).waitFor();
  await page.screenshot({ path: new URL('../screenshots/providers-new-key-visible.png', import.meta.url).pathname.replace(/^\/(\w:)/, '$1') });
  await page.getByLabel('仅显示正常连接').uncheck();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, name }));
  // 演示服务是内存状态：删掉本次新增的连接，避免后续浏览器测试拿到不同的连接数。
  const created = (await (await page.request.get(`${base}/api/providers`)).json()).connections.find(connection => connection.name === name);
  if (created) assert.equal((await page.request.delete(`${base}/api/providers/${encodeURIComponent(created.id)}`)).status(), 200);
} finally {
  await browser.close();
}

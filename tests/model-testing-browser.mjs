import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4325';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = { checks: [], errors: [], requests: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => report.errors.push(error.message));
  assert.equal((await (await page.request.get(base + '/api/auth/status')).json()).demo, true);
  assert.equal((await page.goto(base + '/dashboard/providers')).status(), 200);
  await page.getByLabel('登录密码').fill('linear-demo');
  await page.getByRole('button', { name: '进入管理端' }).click();
  await page.getByRole('button', { name: '添加供应商', exact: true }).waitFor();
  const prefix = 'model-test-' + Date.now().toString(36);
  const response = await page.request.post(base + '/api/provider-nodes', { data: { name: prefix, prefix, type: 'openai-compatible', apiType: 'chat', baseUrl: 'https://example.invalid/v1' } });
  assert.equal(response.status(), 201);
  const node = (await response.json()).node;
  let reply = { ok: true, status: 200, latencyMs: 72, note: '测试说明' };
  let httpStatus = 200;
  await page.route('**/api/models/test', async route => {
    report.requests.push(route.request().postDataJSON());
    await route.fulfill({ status: httpStatus, json: reply });
  });
  const navigate = async () => {
    await page.goto(base + '/dashboard/providers/' + encodeURIComponent(node.id));
    await page.getByRole('button', { name: '添加自定义模型', exact: true }).waitFor();
  };
  const add = async id => {
    await page.getByRole('button', { name: '添加自定义模型', exact: true }).click();
    await page.getByLabel('上游模型 ID', { exact: true }).fill(id);
  };
  await navigate();
  await add('plain-model');
  assert(await page.getByRole('button', { name: '保存并测试', exact: true }).isDisabled());
  await page.getByRole('button', { name: '保存模型', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert(await page.getByRole('button', { name: `测试模型 ${prefix}/plain-model`, exact: true }).isDisabled());
  assert.equal(report.requests.length, 0);
  assert.equal((await page.request.post(base + '/api/providers', { data: { provider: node.id, apiKey: 'demo-only', name: '测试账号', isActive: true } })).status(), 201);
  await navigate();
  await add('org/new-model');
  await page.getByRole('button', { name: '保存并测试', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('调用成功', { exact: true }).waitFor();
  assert.deepEqual(report.requests, [{ model: `${prefix}/org/new-model`, kind: 'llm' }]);
  assert((await dialog.innerText()).includes('72 ms'));
  await dialog.getByText('测试说明', { exact: true }).waitFor();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  const row = page.locator('.provider-model-card').filter({ hasText: `${prefix}/org/new-model` });
  await row.getByText('调用成功', { exact: true }).waitFor();
  report.checks.push('保存无账号模型不触发测试；保存并测试使用供应商前缀及完整上游 ID，显示成功与耗时说明');
  const cases = [
    [200, { ok: false, status: 404, error: 'Unknown model', latencyMs: 21 }, 'HTTP 404'],
    [200, { ok: false, status: 403, error: 'Model permission denied', latencyMs: 22 }, 'HTTP 403'],
    [200, { ok: false, status: 429, error: 'Quota exceeded', latencyMs: 23 }, 'HTTP 429'],
    [502, { error: 'Proxy connection refused' }, 'HTTP 502'],
    [200, { ok: false, error: 'Request timed out', latencyMs: 15000 }, '网络或代理异常'],
    [200, {}, '连接异常'],
  ];
  for (const [status, body, text] of cases) {
    httpStatus = status; reply = body;
    await page.getByRole('button', { name: `测试模型 ${prefix}/org/new-model`, exact: true }).click();
    await dialog.getByText('调用失败', { exact: true }).waitFor();
    assert((await dialog.innerText()).includes(text));
    await dialog.getByText('原始错误', { exact: true }).click();
    assert((await dialog.locator('pre').innerText()).includes(body.error || '网关未确认'));
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await row.getByText('调用失败', { exact: true }).waitFor();
  }
  report.checks.push('无效模型、权限、限流、代理、超时及 HTTP 200 业务失败均显示失败并保留原因');
  reply = { ok: true, status: 200, latencyMs: 10 }; httpStatus = 200;
  await page.getByRole('button', { name: `测试模型 ${prefix}/org/new-model`, exact: true }).click();
  await dialog.getByText('调用成功', { exact: true }).waitFor();
  await page.getByRole('button', { name: '重新测试', exact: true }).click();
  await dialog.getByText('调用成功', { exact: true }).waitFor();
  await page.setViewportSize({ width: 375, height: 812 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: 'reports/model-testing-mobile.png', fullPage: true });
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: `测试模型 ${prefix}/org/new-model`, exact: true }).waitFor();
  await page.locator('.provider-model-card').filter({ hasText: `${prefix}/org/new-model` }).getByText('未测试', { exact: true }).waitFor();
  const count = report.requests.length;
  await add('disabled-model');
  await page.getByLabel('向下游发布模型').uncheck();
  assert(await page.getByRole('button', { name: '保存并测试', exact: true }).isDisabled());
  await page.getByRole('button', { name: '保存模型', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert(await page.getByRole('button', { name: `测试模型 ${prefix}/disabled-model`, exact: true }).isDisabled());
  await page.route('**/api/models/custom', route => route.request().method() === 'POST' ? route.fulfill({ status: 400, json: { error: 'Save rejected' } }) : route.continue());
  await add('save-failure');
  await page.getByRole('button', { name: '保存并测试', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Save rejected' }).waitFor();
  assert.equal(report.requests.length, count);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  report.checks.push('支持重试；刷新清除本次结果；停用模型及保存失败不测试；手机无页面溢出');
  await page.goto(base + '/dashboard/models');
  await page.getByRole('button', { name: '编辑模型 cx/gpt', exact: true }).click();
  assert(await page.getByRole('button', { name: '保存并测试', exact: true }).isEnabled());
  await page.getByRole('button', { name: '保存并测试', exact: true }).click();
  await dialog.getByText('调用成功', { exact: true }).waitFor();
  assert.deepEqual(report.requests.at(-1), { model: 'cx/gpt', kind: 'llm' });
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.evaluate(() => {
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    AbortSignal.timeout = ms => timeout(ms === 25000 ? 1000 : ms);
  });
  await page.route('**/api/models/test', route => { report.requests.push(route.request().postDataJSON()); });
  const beforeTimeout = report.requests.length;
  await page.getByRole('button', { name: '测试模型 cx/gpt', exact: true }).click();
  await dialog.getByText('测试中…', { exact: true }).waitFor();
  assert(await page.getByRole('button', { name: '关闭', exact: true }).isDisabled());
  assert(await page.getByRole('button', { name: '正在测试…', exact: true }).isDisabled());
  await dialog.getByText('调用失败', { exact: true }).waitFor();
  await dialog.getByText('原始错误', { exact: true }).click();
  assert((await dialog.locator('pre').innerText()).includes('测试请求超时'));
  assert.equal(report.requests.length, beforeTimeout + 1);
  report.checks.push('内置供应商别名保存后保留原路由；测试中禁止重复操作；挂起请求触发客户端超时并可重试');
  assert.deepEqual(report.errors, []);
  console.log('PASS ' + report.checks.join('；'));
} finally {
  await mkdir('reports', { recursive: true });
  await writeFile('reports/model-testing-browser.json', JSON.stringify(report, null, 2));
  await browser.close();
}

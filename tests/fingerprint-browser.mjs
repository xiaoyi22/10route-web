import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4325';
const sample = JSON.parse(await readFile(new URL('./fingerprint-sample.json', import.meta.url), 'utf8'));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = { errors: [], requests: [], detectorStatus: null };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  page.on('response', response => { if (/shared_detector[^/]*\.bin$/.test(new URL(response.url()).pathname)) report.detectorStatus = response.status(); });
  assert.equal((await (await page.request.get(base + '/api/auth/status')).json()).demo, true);
  assert.equal((await page.goto(base + '/dashboard/monitor')).status(), 200);
  await page.getByLabel('登录密码').fill('linear-demo');
  await page.getByRole('button', { name: '进入管理端' }).click();
  assert.equal((await page.request.post(base + '/api/keys', { data: { name: '指纹检测密钥' } })).status(), 201);
  const replies = [...sample.answers];
  await page.route('**/api/v1/chat/completions', async route => {
    report.requests.push({ authorization: route.request().headers().authorization, body: route.request().postDataJSON() });
    const text = replies.shift().text;
    await route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: text } }] })}\n\ndata: [DONE]\n\n` });
  });
  await page.reload();
  await page.getByLabel('检测模型范围').waitFor();
  assert.equal(await page.getByRole('button', { name: /^指纹检测 / }).count(), 0);
  await page.getByRole('button', { name: '指纹检测', exact: true }).click();
  assert.equal(await page.getByLabel('检测模型范围').count(), 0);
  assert.equal(await page.getByLabel('参考库收录范围').inputValue(), 'configured');
  assert.equal(await page.getByLabel('指纹检测状态').inputValue(), '');
  const metrics = await page.locator('.monitor-metrics .metric').allInnerTexts();
  assert.match(metrics[1], /同名收录/);
  // 供应商分组卡片：演示环境默认折叠，筛选时展开。
  assert.equal(await page.locator('.fingerprint-group').count(), 2);
  assert.equal(await page.getByRole('button', { name: /^指纹检测 / }).count(), 0, '默认折叠不显示检测按钮');
  await page.getByLabel('参考库收录范围').selectOption('none');
  assert.equal(await page.getByRole('button', { name: /^指纹检测 / }).count(), 2, '演示环境的 gpt 与 claude-sonnet 都未收录');
  assert((await page.locator('.fingerprint-groups').innerText()).includes('未收录'));
  assert.match(await page.locator('.table-footer span').first().innerText(), /^\d+ 个供应商$/);
  await page.getByLabel('参考库收录范围').selectOption('configured');
  await page.getByLabel('指纹检测状态').selectOption('unmatched');
  const button = page.getByRole('button', { name: /^指纹检测 / }).first();
  await button.waitFor();
  assert((await button.innerText()).includes('检测'));
  const model = (await button.getAttribute('aria-label')).replace('指纹检测 ', '');
  await button.click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('次真实模型请求', { exact: false }).waitFor();
  // 默认 3 次（证据最稳、并行发出），可降到 1 次；提问语言默认英文。
  assert.equal(await dialog.getByLabel('指纹检测请求次数').inputValue(), '3');
  assert.equal(await dialog.getByLabel('指纹检测提问语言').inputValue(), 'en');
  // 密钥不再需要手选：只有一个已启用密钥时直接可用。
  assert(!(await dialog.getByRole('button', { name: '开始检测' }).isDisabled()));
  assert.equal(await dialog.getByLabel('指纹检测网关路由').count(), 0, '不再让用户选网关路由');
  await dialog.getByRole('button', { name: '开始检测' }).click();
  await dialog.getByText('识别结果', { exact: true }).waitFor();
  assert.equal(report.requests.length, 3);
  assert(report.requests.every(request => request.authorization?.startsWith('Bearer demo_sk_') && request.body.model.endsWith('/' + model) && request.body.stream === true));
  assert.equal(report.detectorStatus, 200);
  const firstRow = dialog.locator('tbody tr').first();
  const topText = await firstRow.innerText();
  assert.match(await firstRow.innerText(), new RegExp(sample.model.replace('.', '\\.')));
  assert.equal(await dialog.locator('tbody tr').count(), 5);
  assert.equal((await dialog.getByText(/^挑战 \d：已完成/).count()), 3);
  await mkdir(new URL('../screenshots/', import.meta.url), { recursive: true });
  await dialog.screenshot({ path: new URL('../screenshots/fingerprint-dialog.png', import.meta.url).pathname.replace(/^\/(\w:)/, '$1') });
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.getByLabel('指纹检测状态').selectOption('tested');
  const row = page.locator('.fingerprint-model-list li').filter({ has: page.getByRole('button', { name: `指纹检测 ${model}`, exact: true }) });
  assert.match(await row.innerText(), new RegExp(`首位 ${sample.model.replace('.', '\\.')}`));
  assert.match(await row.innerText(), /\d{4}\/\d{1,2}\/\d{1,2}/, '记录检测时间');
  assert((await row.getByRole('button', { name: `指纹检测 ${model}`, exact: true }).innerText()).includes('重测'));
  // 记录保存在本机浏览器：重新加载页面后仍在。
  await page.reload();
  await page.getByRole('button', { name: '指纹检测', exact: true }).click();
  await page.getByLabel('指纹检测状态').selectOption('tested');
  const reloaded = page.locator('.fingerprint-model-list li').filter({ has: page.getByRole('button', { name: `指纹检测 ${model}`, exact: true }) });
  await reloaded.waitFor();
  assert.match(await reloaded.innerText(), new RegExp(`首位 ${sample.model.replace('.', '\\.')}`), '已检测筛选保留不在参考库的已测模型');
  assert.equal(await page.getByRole('button', { name: /^指纹检测 / }).count(), 1);
  await reloaded.getByRole('button', { name: `查看指纹结果 ${model}`, exact: true }).click();
  await dialog.getByText('识别结果', { exact: true }).waitFor();
  assert.equal(report.requests.length, 3);
  await page.screenshot({ path: new URL('../screenshots/fingerprint-tab.png', import.meta.url).pathname.replace(/^\/(\w:)/, '$1') });
  // 「检测记录」视图也要能看到指纹检测：记录在本机浏览器，不在后端检测历史里。
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.getByRole('tab', { name: '检测记录' }).click();
  const historyRow = page.locator('.monitor-table tbody tr').filter({ hasText: model }).first();
  await historyRow.waitFor();
  const historyText = await historyRow.innerText();
  assert.match(historyText, /与声称模型一致|参考库未收录|与声称模型不一致/, '显示指纹结论');
  assert.match(historyText, /成功/, '显示请求结果');
  assert.match(historyText, /\d{4}\/\d{1,2}\/\d{1,2}/, '显示记录时间');
  await historyRow.getByRole('button', { name: `查看指纹结果 ${model}`, exact: true }).click();
  await dialog.getByText('识别结果', { exact: true }).waitFor();
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await historyRow.getByRole('button', { name: `删除指纹记录 ${model}`, exact: true }).click();
  await page.getByText('还没有指纹检测记录', { exact: false }).waitFor();
  assert.equal(report.requests.length, 3, '查看记录不会重新发起请求');
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify({ ok: true, model, top: topText, history: historyText.replace(/\n/g, ' | '), requests: report.requests.length, detectorStatus: report.detectorStatus }));
} finally {
  await browser.close();
}

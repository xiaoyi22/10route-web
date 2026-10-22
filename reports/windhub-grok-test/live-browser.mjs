import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { chromium } from 'playwright';

const base = 'http://192.168.11.150:4317';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] });
const report = { base, errors: [] };
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const env = parseEnv(await readFile('C:/Users/Administrator/.codex/credentials/10router-web.env', 'utf8'));
  const login = await context.request.post(base + '/api/auth/login', { data: { password: env.TENROUTER_TEST_PASSWORD.trim() } });
  assert.equal(login.status(), 200);
  const distribution = await (await context.request.get(base + '/api/models/distribution')).json();
  assert.equal(distribution.mode, 'allowlist');
  assert(!distribution.models.includes('wh/grok-4.7'));
  const page = await context.newPage();
  page.setDefaultTimeout(35000);
  page.on('pageerror', error => report.errors.push(error.message));
  const entry = await page.goto(base + '/dashboard/providers/openai-compatible-chat-a9fb2295-434b-4a0c-9623-715ca7cca344');
  assert.equal(entry.status(), 200);
  const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/models/test') && response.request().method() === 'POST');
  await page.getByRole('button', { name: '测试模型 wh/grok-4.7', exact: true }).click();
  const response = await responsePromise;
  report.http = response.status();
  report.result = await response.json();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('调用成功', { exact: true }).waitFor();
  assert.equal(report.http, 200);
  assert.equal(report.result.ok, true);
  assert.equal(report.result.status, 200);
  assert(report.result.content?.trim());
  await page.screenshot({ path: 'reports/windhub-grok-test/deployed-success.png' });
  const finalDistribution = await (await context.request.get(base + '/api/models/distribution')).json();
  assert.deepEqual(finalDistribution, distribution, '测试不修改发布配置');
  const publicKeys = (await (await context.request.get(base + '/api/keys')).json()).keys;
  const key = publicKeys.find(item => item.isActive !== false && !item.allowedModels?.length && !item.allowedCombos?.length);
  assert(key?.key);
  const blocked = await context.request.post('http://192.168.11.150:20128/v1/chat/completions', {
    headers: { authorization: 'Bearer ' + key.key },
    data: { model: 'wh/grok-4.7', messages: [{ role: 'user', content: 'Reply OK' }], max_tokens: 16 },
  });
  report.unpublishedDownstreamHttp = blocked.status();
  assert.equal(blocked.status(), 404);
  assert.match((await blocked.json()).error.message, /not available/);
  assert.deepEqual(report.errors, []);
  report.passed = true;
  await writeFile('reports/windhub-grok-test/acceptance.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await browser.close(); }

// 检查模型检测页读取 /api/models/distribution 的真实状态与渲染结果（是否识别 allowlist 与已发布徽标）。
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4353';
const env = parseEnv(await readFile(resolve(process.env.USERPROFILE, '.codex/credentials/10router-web.env'), 'utf8'));
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.request.post(base + '/api/auth/login', { data: { password: env.TENROUTER_TEST_PASSWORD.trim() } });
  const page = await context.newPage();
  const seen = [];
  page.on('response', response => { if (response.url().includes('/api/models/distribution')) seen.push({ status: response.status(), at: Date.now() }); });
  page.on('requestfailed', request => { if (request.url().includes('/api/models/distribution')) seen.push({ failed: request.failure()?.errorText }); });
  await page.goto(base + '/dashboard/monitor');
  await page.getByLabel('检测模型范围').waitFor();
  await page.waitForTimeout(3000);
  console.log('distribution responses', JSON.stringify(seen));
  await page.getByRole('button', { name: '指纹检测', exact: true }).click();
  await page.waitForTimeout(1500);
  console.log('metric note', (await page.locator('.metric-note').last().innerText()).slice(0, 200));
  console.log('publish filter select present', await page.getByLabel('下游分发状态').count());
  const first = page.locator('.fingerprint-group').first().getByRole('button').first();
  await first.click();
  await page.waitForTimeout(500);
  console.log('badges in first group', await page.locator('.fingerprint-model-list .badge').allInnerTexts());
} finally { await browser.close(); }

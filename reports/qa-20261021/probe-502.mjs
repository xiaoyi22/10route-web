// 定位真实后端返回 502 的页面接口，判断是网关上游故障还是前端路由错误。
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
  const failures = [];
  page.on('response', response => { if (response.status() >= 400) failures.push({ status: response.status(), path: new URL(response.url()).pathname + new URL(response.url()).search }); });
  for (const route of ['/dashboard/providers/qoder', '/dashboard/providers', '/dashboard/pricing', '/dashboard/monitor', '/dashboard/models']) {
    await page.goto(base + route);
    await page.waitForTimeout(2500);
  }
  console.log(JSON.stringify(failures, null, 1));
} finally { await browser.close(); }

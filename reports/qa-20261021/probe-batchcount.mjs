// 读取真实网关供应商页「全选」后的提示文案，核对用例中的硬编码计数。
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';

const base = 'http://192.168.11.150:4317';
const env = parseEnv(await readFile(resolve(process.env.USERPROFILE, '.codex/credentials/10router-web.env'), 'utf8'));
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.request.post(base + '/api/auth/login', { data: { password: env.TENROUTER_TEST_PASSWORD.trim() } });
  const page = await context.newPage();
  await page.goto(base + '/dashboard/providers');
  await page.getByLabel('全选当前供应商', { exact: true }).check();
  console.log('toolbar:', await page.locator('.provider-batch-toolbar > span').first().innerText());
  console.log('rows:', await page.locator('tbody tr').count());
} finally { await browser.close(); }

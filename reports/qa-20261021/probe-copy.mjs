// 真实网关只读巡检：复制按钮在非安全来源（http）下的实际行为 + 生产只读检查。
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
  await page.goto(base + '/dashboard/providers/qoder');
  await page.locator('.provider-model-card').first().waitFor();
  const clipboard = await page.evaluate(() => ({ exists: !!navigator.clipboard, readText: typeof navigator.clipboard?.readText, writeText: typeof navigator.clipboard?.writeText, secure: isSecureContext }));
  console.log('clipboard', JSON.stringify(clipboard));
  const button = page.locator('.provider-model-card').first().getByRole('button', { name: /^复制模型/ });
  const label = await button.getAttribute('aria-label');
  const token = label.replace('复制模型 ', '');
  await button.click();
  await page.waitForTimeout(500);
  const copiedState = await button.evaluate(element => ({ title: element.title, text: element.textContent, cls: element.className }));
  const field = await page.evaluate(async () => { try { return await navigator.clipboard.readText(); } catch (error) { return `ERR:${error.name}`; } });
  console.log('copied button state', JSON.stringify(copiedState));
  console.log('clipboard read after click', String(field).slice(0, 80), 'expected token', token);
} finally { await browser.close(); }

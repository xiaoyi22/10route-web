// 取证：组合模型页搜索无匹配词时 tbody 行结构与类名。
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4318';
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true, args: ['--no-proxy-server'] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.request.post(base + '/api/auth/login', { data: { password: 'linear-demo' } });
  const page = await context.newPage();
  await page.goto(base + '/dashboard/combo-models');
  await page.locator('tbody tr').first().waitFor();
  const snapshot = () => page.evaluate(() => [...document.querySelectorAll('tbody tr')].map(row => ({ cls: row.className, cells: row.children.length, text: row.innerText.replace(/\s+/g, ' ').slice(0, 60) })));
  const inputs = await page.evaluate(() => [...document.querySelectorAll('input')].map(input => ({ type: input.type, aria: input.getAttribute('aria-label'), placeholder: input.placeholder })));
  console.log('inputs', JSON.stringify(inputs));
  console.log('before', JSON.stringify(await snapshot()));
  const box = page.locator('main input[type=search], main input[placeholder]').first();
  await box.fill('zzz-no-such-item-zzz');
  await page.waitForTimeout(800);
  console.log('after', JSON.stringify(await snapshot()));
} finally { await browser.close(); }

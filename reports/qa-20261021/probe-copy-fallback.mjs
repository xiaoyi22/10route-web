// 验证 CopyButton 在「剪贴板 API 不可用」（真实网关 http 入口实测就是这个状态）时的降级行为。
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4330';
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true, args: ['--no-proxy-server'] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.request.post(base + '/api/auth/login', { data: { password: 'linear-demo' } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let target = null;
  for (const route of ['/dashboard/models', '/dashboard/providers', '/dashboard/combo-models']) {
    await page.goto(base + route);
    await page.waitForTimeout(1200);
    const button = page.getByRole('button', { name: /^复制/ }).first();
    if (await button.count()) { target = { route, button }; break; }
  }
  if (!target) throw new Error('演示环境未找到复制按钮');
  console.log('route', target.route, 'label', await target.button.getAttribute('aria-label'));

  // 场景 A：127.0.0.1 是安全上下文，走 navigator.clipboard 正常路径。
  await target.button.click();
  await page.waitForTimeout(400);
  const secure = await target.button.getAttribute('aria-label');
  const copiedText = await page.evaluate(() => navigator.clipboard.readText().catch(() => 'unreadable'));
  console.log('secure-context  label=', secure, ' clipboard=', copiedText);

  // 场景 B：模拟真实网关 http 入口（navigator.clipboard === undefined）。
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }));
  await page.reload();
  await page.waitForTimeout(1200);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }));
  const button = page.getByRole('button', { name: /^复制/ }).first();
  await button.click();
  await page.waitForTimeout(500);
  const fallback = await button.getAttribute('aria-label');
  const hint = await page.locator('.copy-control .copy-hint').first().innerText().catch(() => 'none');
  const selected = await page.evaluate(() => { const area = document.activeElement; return area && area.tagName === 'TEXTAREA' ? area.value.length : 0; });
  const alert = await page.locator('.copy-control .error-message').count();
  console.log('no-clipboard    label=', fallback, ' hint=', hint, ' selectedChars=', selected, ' failureAlert=', alert);
  console.log('pageerrors', JSON.stringify(errors));
} finally { await browser.close(); }

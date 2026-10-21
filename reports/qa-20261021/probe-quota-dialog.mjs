// 取证：320×640 下配额明细弹窗实际尺寸与 dvh 解析值（分别用 setViewportSize 与 CDP 设备模拟）。
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4320';
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true, args: ['--no-proxy-server'] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.request.post(base + '/api/auth/login', { data: { password: 'linear-demo' } });
  const page = await context.newPage();
  await page.goto(base + '/dashboard/balances');
  const cdp = await context.newCDPSession(page);
  for (const mode of ['viewport', 'cdp']) {
    if (mode === 'viewport') await page.setViewportSize({ width: 320, height: 640 });
    else await cdp.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: false });
    await page.waitForTimeout(300);
    await page.locator('.quota-expand').first().click();
    await page.getByRole('dialog').waitFor();
    await page.waitForTimeout(400);
    const info = await page.evaluate(() => {
      const dialog = document.querySelector('dialog[open]');
      const style = getComputedStyle(dialog);
      return { innerHeight, dvh: (() => { const probe = document.createElement('div'); probe.style.height = '100dvh'; dialog.appendChild(probe); const value = getComputedStyle(probe).height; probe.remove(); return value; })(), rect: dialog.getBoundingClientRect().toJSON(), height: style.height, maxHeight: style.maxHeight, margin: style.margin, position: style.position, inset: style.inset };
    });
    console.log(mode, JSON.stringify(info));
    await page.getByRole('button', { name: '关闭窗口' }).click();
    await page.waitForTimeout(200);
  }
} finally { await browser.close(); }

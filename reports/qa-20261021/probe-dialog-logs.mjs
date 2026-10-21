// 取证：快速跳转弹窗位置 + 日志页 demo-codex 连接的分页数据。
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4330';
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 620 }, deviceScaleFactor: 1.5 });
  await context.request.post(base + '/api/auth/login', { data: { password: 'linear-demo' } });
  const page = await context.newPage();
  await page.goto(base + '/dashboard/providers');
  await page.getByRole('heading', { name: '供应商', exact: true }).waitFor();
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: '快速跳转' });
  await dialog.waitFor();
  await page.waitForTimeout(400);
  const bounds = await dialog.boundingBox();
  const style = await dialog.evaluate(element => ({ maxHeight: getComputedStyle(element).maxHeight, marginTop: getComputedStyle(element).marginTop }));
  console.log('search-dialog', JSON.stringify({ bounds, style, viewport: [1280, 620] }));

  const providers = await (await context.request.get(base + '/api/providers')).json();
  const connections = providers.connections || [];
  for (const connection of connections) {
    const counts = {};
    for (const status of ['success', '']) {
      const url = base + '/api/usage/request-details?page=1&pageSize=20&connectionId=' + encodeURIComponent(connection.id) + (status ? '&status=' + status : '');
      const data = await (await context.request.get(url)).json();
      counts[status || 'all'] = { rows: (data.details || []).length, pagination: data.pagination };
    }
    console.log('connection', connection.id, connection.name, JSON.stringify(counts));
  }
} finally { await browser.close(); }

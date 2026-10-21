// 复现 usage-log 用例的价目单元格：登录隔离演示环境，打开日志价格，读取首屏价格列。
import { chromium } from 'playwright';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4341';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.request.post(base + '/api/auth/login', { data: { password: 'linear-demo' } });
  const page = await context.newPage();
  const pricing = await (await context.request.get(base + '/api/pricing')).json();
  console.log('pricing keys', Object.keys(pricing));
  await page.goto(base + '/dashboard/logs');
  await page.getByRole('button', { name: /查看 Token 明细/ }).first().waitFor();
  await page.getByLabel('显示日志价格').check();
  await page.getByRole('columnheader', { name: '费用 · USD' }).waitFor();
  await page.waitForTimeout(1500);
  const rows = await page.locator('tbody tr').evaluateAll(items => items.map(row => [...row.children].map(cell => cell.textContent.trim())).map(cells => [cells[0], cells[3], cells[4], cells[7], cells[11]]));
  console.log('rows', JSON.stringify(rows));
  const requests = await page.evaluate(() => performance.getEntriesByType('resource').filter(e => e.name.includes('request-details')).map(e => e.name));
  console.log('requests', requests.slice(-3));
} finally { await browser.close(); }

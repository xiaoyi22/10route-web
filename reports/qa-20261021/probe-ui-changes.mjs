// 只读 UI 巡检：针对本次未提交改动涉及的页面，在真实网关上取真实数据渲染结果与截图。
// 不点击任何写操作按钮；记录所有非 GET 请求以证明只读。
import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';

const base = process.env.PREVIEW_URL || 'http://192.168.11.150:4317';
const out = resolve(import.meta.dirname, 'ui');
await mkdir(out, { recursive: true });
const env = parseEnv(await readFile(resolve(process.env.USERPROFILE, '.codex/credentials/10router-web.env'), 'utf8'));
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] });
const report = { base, checks: [], writes: [], errors: [] };
const check = value => { report.checks.push(value); console.log('✓', value); };
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.request.post(base + '/api/auth/login', { data: { password: env.TENROUTER_TEST_PASSWORD.trim() } });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  page.on('request', request => { const path = new URL(request.url()).pathname; if (path.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) report.writes.push({ path, method: request.method() }); });

  // 1. Qoder 供应商详情：卡片目录 + 积分参考区 + 峰谷倍率。
  await page.goto(base + '/dashboard/providers/qoder');
  const providerAccounts = await (await context.request.get(base + '/api/providers')).json();
  const qoderConnection = (providerAccounts.connections || []).find(item => item.provider === 'qoder');
  const catalogFill = page.waitForResponse(response => /\/api\/providers\/[^/]+\/models/.test(new URL(response.url()).pathname)).catch(() => null);
  await page.getByRole('button', { name: '刷新模型', exact: true }).click();
  const catalogResponse = await catalogFill;
  const catalog = catalogResponse ? await catalogResponse.json() : { models: [] };
  await page.locator('.provider-model-card').first().waitFor();
  const cards = await page.locator('.provider-model-card').count();
  const source = page.getByLabel('积分参考信息', { exact: true });
  const hasSource = await source.count();
  const sourceText = hasSource ? (await source.innerText()).replace(/\n/g, ' | ') : '';
  const periodGroups = await page.locator('.model-credit-periods').count();
  const currentPeriod = periodGroups ? await page.locator('.model-credit-periods .current dt').first().innerText() : '';
  const currentRate = periodGroups ? await page.locator('.model-credit-periods .current strong').first().innerText() : '';
  const ultimate = (catalog.models || []).find(model => model.id.endsWith('/ultimate'));
  check(`Qoder 详情：${cards} 张模型卡片，积分参考区 ${hasSource} 个，峰谷区块 ${periodGroups} 个`);
  check(`真实接口 ultimate rateMultiplier=${ultimate?.rateMultiplier} promotion=${ultimate?.promotion ? JSON.stringify({ start: ultimate.promotion.window_start, end: ultimate.promotion.window_end, normal: ultimate.promotion.before_promotion_price_factor, discount: ultimate.promotion.discount_factor }) : 'null'}`);
  check(`页面高峰/低谷当前段：${currentPeriod} ${currentRate}`);
  check(`积分参考区文案：${sourceText}`);
  check(`账号 ${qoderConnection?.name} 账号模型范围字段：${JSON.stringify(qoderConnection?.providerSpecificData?.enabledModels ?? null)}`);
  await page.screenshot({ path: resolve(out, 'providers-qoder.png'), fullPage: true });

  // 2. 供应商列表：账号模型范围行内提示与筛选提示。
  await page.goto(base + '/dashboard/providers');
  await page.locator('.provider-link').first().waitFor();
  const compatibleHints = await page.locator('td .connection-name small').allInnerTexts();
  check(`供应商列表账号副标题示例：${JSON.stringify(compatibleHints.slice(0, 4))}`);
  const syncButtons = await page.getByRole('button', { name: '同步模型范围', exact: true }).count();
  check(`批量工具栏「同步模型范围」按钮：${syncButtons}`);
  await page.screenshot({ path: resolve(out, 'providers-list.png'), fullPage: true });

  // 3. 模型价格：五项齐全计数与缺项筛选。
  await page.goto(base + '/dashboard/pricing');
  await page.locator('.admin-price-table tbody tr').first().waitFor();
  const summary = await page.locator('.admin-summary').innerText();
  const coverage = await page.locator('.coverage-filter button').allInnerTexts();
  await page.locator('.coverage-filter button').nth(2).click();
  await page.waitForTimeout(400);
  const partialRows = await page.locator('.admin-price-table tbody tr').count();
  const missingCells = await page.locator('.admin-price-table .price-missing').count();
  check(`价格摘要：${summary.replace(/\n/g, ' | ')}`);
  check(`完整度筛选：${JSON.stringify(coverage)}；缺项筛选后 ${partialRows} 行，缺项单元格 ${missingCells} 个`);
  await page.screenshot({ path: resolve(out, 'pricing-coverage.png'), fullPage: true });

  // 4. 模型检测：指纹检测只读视图（不发起检测）。
  await page.goto(base + '/dashboard/monitor');
  await page.getByLabel('检测模型范围').waitFor();
  await page.getByRole('button', { name: '指纹检测', exact: true }).click();
  await page.getByLabel('参考库收录范围').waitFor();
  const metrics = await page.locator('.monitor-metrics .metric').allInnerTexts();
  const groups = await page.locator('.fingerprint-group').count();
  const allowNotice = await page.locator('.metric-note').last().innerText();
  check(`指纹检测汇总：${JSON.stringify(metrics.map(text => text.replace(/\n/g, ' ')))}`);
  check(`供应商分组 ${groups} 个；提示：${allowNotice.slice(0, 160)}`);
  await page.locator('.fingerprint-group').first().getByRole('button').first().click();
  await page.waitForTimeout(300);
  const publishedBadges = await page.locator('.fingerprint-model-list .badge').count();
  check(`展开首个供应商后徽标数：${publishedBadges}`);
  await page.screenshot({ path: resolve(out, 'monitor-fingerprint.png'), fullPage: true });

  // 5. 模型页总目录：表格视图与供应商卡片视图并存。
  await page.goto(base + '/dashboard/models');
  await page.locator('tbody tr').first().waitFor();
  const tableRows = await page.locator('tbody tr').count();
  check(`模型总目录表格视图 ${tableRows} 行（首屏）`);
  await page.screenshot({ path: resolve(out, 'models-catalog.png'), fullPage: true });

  // 6. 移动端 375px 无横向溢出（覆盖改动最大的两个页面）。
  for (const route of ['/dashboard/providers/qoder', '/dashboard/pricing', '/dashboard/monitor']) {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(base + route);
    await page.waitForTimeout(1500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(`375px ${route} 横向溢出 ${overflow}px`);
  }
  check(`控制台错误 ${report.errors.length} 条；非 GET 请求 ${report.writes.length} 条`);
} finally {
  await browser.close();
  console.log(JSON.stringify({ errors: report.errors, writes: report.writes }));
}

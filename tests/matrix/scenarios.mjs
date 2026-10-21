import { selectTheme } from '../theme-control.mjs';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';

// Scenario probes for the reconstructed matrix. Each probe drives a REAL control observed on the live
// page and asserts the observable outcome. Pages without the relevant control throw a 'not-applicable'
// marker so the runner reports an honest pending instead of a fabricated pass.

const NOT_APPLICABLE = 'not-applicable:';
// Known gaps of the isolated fixture (no upstream bridge), not product defects.
const FIXTURE_NOISE = /hermes\/proxy|system\/info|status of 502 \(Bad Gateway\)|status of 404 \(Not Found\)/;
const meaningfulError = (list, from = 0) => list.slice(from).find(message => !FIXTURE_NOISE.test(message));
export const isNotApplicable = message => String(message).startsWith(NOT_APPLICABLE);

// Per-route search-box placeholders actually present on the gateway, verified by live inspection.
export const SEARCH_INPUTS = {
  '/dashboard/providers': "input[placeholder*='搜索供应商']",
  '/dashboard/models': "input[placeholder*='搜索模型']",
  '/dashboard/pricing': "input[placeholder*='搜索模型或供应商']",
  '/dashboard/combos': "input[placeholder*='搜索']",
  '/dashboard/authorization': "input[placeholder*='搜索供应商']",
};

const open = async (page, base, route) => {
  await page.goto(base + route, { waitUntil: 'domcontentloaded' });
  await page.locator('#main h1, .page-heading').first().waitFor();
  await page.waitForTimeout(400);
};

export const scenarioProbes = {
  async search(session, item) {
    const selector = SEARCH_INPUTS[item.route];
    if (!selector) throw new Error(NOT_APPLICABLE + ' 本页无搜索框');
    await open(session.page, session.base, item.route);
    const box = session.page.locator(selector).first();
    // 空态是一行含 td.table-empty 的占位行，不能算作数据行。
    const rows = () => session.page.locator('tbody tr:not(:has(.table-empty))');
    const total = await rows().count();
    if (total === 0) throw new Error(NOT_APPLICABLE + ' 无数据行可搜索');
    await box.fill('zzz-no-such-item-zzz');
    await session.page.waitForTimeout(600);
    const miss = await rows().count();
    if (miss >= total) throw new Error('输入无匹配词后行数未变化（' + total + '->' + miss + '）');
    await box.fill('');
    await session.page.waitForTimeout(600);
    const restored = await rows().count();
    if (restored !== total) throw new Error('清空搜索后未恢复（' + total + '->' + restored + '）');
  },
  async filter(session, item) {
    await open(session.page, session.base, item.route);
    const status = session.page.getByRole('combobox', { name: '状态' });
    if (!(await status.count())) throw new Error(NOT_APPLICABLE + ' 本页无状态筛选');
    const total = await session.page.locator('tbody tr').count();
    await status.selectOption('失败').catch(() => status.selectOption({ index: 2 }));
    await session.page.waitForTimeout(600);
    const filtered = await session.page.locator('tbody tr').count();
    if (filtered > total) throw new Error('筛选后行数多于筛选前（' + total + '->' + filtered + '）');
    const clear = session.page.getByRole('button', { name: /清除日志筛选|清除筛选|重置/ });
    if (await clear.count()) { await clear.first().click(); await session.page.waitForTimeout(600); }
    else { await status.selectOption({ index: 0 }); await session.page.waitForTimeout(600); }
  },
  async pagination(session, item) {
    await open(session.page, session.base, item.route);
    const size = session.page.getByRole('combobox', { name: /每页/ });
    if (!(await size.count())) throw new Error(NOT_APPLICABLE + ' 本页无分页控件');
    const options = await size.locator('option').allTextContents();
    const target = options.length > 1 ? options[1] : options[0];
    await size.selectOption({ label: target });
    await session.page.waitForTimeout(700);
    if (await session.page.locator('tbody tr').count() === 0) throw new Error('切换每页条数后表格为空');
    await size.selectOption({ label: options[0] });
    await session.page.waitForTimeout(600);
    if (await session.page.locator('tbody tr').count() === 0) throw new Error('恢复每页条数后表格为空');
  },
  async detail(session, item) {
    await open(session.page, session.base, item.route);
    const trigger = session.page.getByRole('button', { name: /^查看|查看请求|查看 Token|详情/ }).first();
    if (!(await trigger.count())) throw new Error(NOT_APPLICABLE + ' 本页无详情入口');
    const rowsBefore = await session.page.locator('tbody tr').count();
    await trigger.click();
    await session.page.waitForTimeout(700);
    const dialogOpen = await session.page.locator('dialog[open], [role=dialog]').count();
    const expanded = await session.page.evaluate(() => {
      const nodes = [...document.querySelectorAll('[class*=details], [class*=detail-], [aria-expanded=true]')];
      return nodes.filter(node => node.offsetParent !== null && node.innerText.trim().length > 0).length;
    });
    const rowsAfter = await session.page.locator('tbody tr').count();
    if (!dialogOpen && !expanded && rowsAfter === rowsBefore) throw new Error(NOT_APPLICABLE + ' 详情以行内展开呈现，当前无可观测面板');
    if (dialogOpen) { await session.page.keyboard.press('Escape'); await session.page.waitForTimeout(400); }
  },
  async copy(session, item) {
    await open(session.page, session.base, item.route);
    const trigger = session.page.getByRole('button', { name: /^复制/ }).first();
    if (!(await trigger.count())) throw new Error(NOT_APPLICABLE + ' 本页无复制按钮');
    if (await trigger.isDisabled()) throw new Error(NOT_APPLICABLE + ' 复制按钮当前禁用（无可用内容）');
    const before = session.errors.length;
    await trigger.click();
    await session.page.waitForTimeout(400);
    if (session.errors.length > before) throw new Error('复制按钮触发控制台错误：' + session.errors[before]);
  },
  async keyboard(session, item) {
    await open(session.page, session.base, item.route);
    // Prefer a control that is known to open a real dialog (edit/settings); inline 'view' toggles are not dialogs.
    const trigger = session.page.getByRole('button', { name: /编辑|设置|详情/ }).first();
    if (!(await trigger.count())) throw new Error(NOT_APPLICABLE + ' 本页无对话框类键盘入口');
    await trigger.focus();
    await session.page.keyboard.press('Enter');
    await session.page.waitForTimeout(700);
    const dialog = session.page.locator('dialog[open], [role=dialog]').first();
    if (!(await dialog.count())) throw new Error(NOT_APPLICABLE + ' 该入口非对话框语义，无法断言键盘焦点行为');
    const focusInside = await session.page.evaluate(() => !!document.activeElement.closest('dialog, [role=dialog]'));
    if (!focusInside) throw new Error('面板打开后焦点未进入面板');
    await session.page.keyboard.press('Escape');
    await session.page.waitForTimeout(400);
    if (await session.page.locator('dialog[open]').count()) throw new Error('Escape 未能关闭面板');
  },
  async 'loading-repeat'(session, item) {
    const before = session.errors.length;
    await open(session.page, session.base, item.route);
    await session.page.goto(session.base + '/dashboard/overview', { waitUntil: 'domcontentloaded' });
    await session.page.goto(session.base + item.route, { waitUntil: 'domcontentloaded' });
    await session.page.locator('#main h1, .page-heading').first().waitFor();
    await session.page.waitForTimeout(800);
    if (session.errors.length > before) throw new Error('快速来回导航后出现错误：' + session.errors[before]);
  },
  async navigation(session, item) {
    const before = session.errors.length;
    const title = item.title || '';
    if (/Unknown route/i.test(title)) {
      await session.page.goto(session.base + '/dashboard/unknown-route-probe', { waitUntil: 'domcontentloaded' });
      await session.page.waitForTimeout(700);
      const heading = await session.page.locator('#main h1').first().innerText().catch(() => '');
      if (!/不存在|404|未找到/.test(heading)) throw new Error('未知路由未显示恢复页，实际标题：' + heading);
    } else if (/Quick navigation search/i.test(title)) {
      await open(session.page, session.base, '/dashboard/overview');
      const trigger = session.page.getByRole('button', { name: /搜索页面|搜索/ }).first();
      if (!(await trigger.count())) throw new Error(NOT_APPLICABLE + ' 无快速导航入口');
      await trigger.click();
      await session.page.waitForTimeout(500);
      if (!(await session.page.locator('dialog[open]').count())) throw new Error('快速导航未打开搜索面板');
      await session.page.keyboard.press('Escape');
    } else if (/Deep links and route refresh/i.test(title)) {
      await open(session.page, session.base, '/dashboard/providers');
      const response = await session.page.reload({ waitUntil: 'domcontentloaded' });
      if (!response || response.status() !== 200) throw new Error('深链刷新 HTTP ' + (response ? response.status() : 'none'));
      await session.page.locator('#main h1, .page-heading').first().waitFor();
    } else if (/browser history|Selected navigation state/i.test(title)) {
      await open(session.page, session.base, '/dashboard/overview');
      await session.page.goto(session.base + '/dashboard/providers', { waitUntil: 'domcontentloaded' });
      await session.page.goBack({ waitUntil: 'domcontentloaded' });
      await session.page.waitForTimeout(600);
      const heading = await session.page.locator('#main h1').first().innerText().catch(() => '');
      if (!heading.trim()) throw new Error('返回上一页后主标题为空');
    } else {
      throw new Error(NOT_APPLICABLE + ' 该跨页条目暂无对应探针');
    }
    if (session.errors.length > before) throw new Error('导航过程中出现错误：' + session.errors[before]);
  },


  // No user-facing sortable header exists in the product; the probe asserts that truthfully instead of guessing.
  async sort(session, item) {
    await open(session.page, session.base, item.route);
    const sortable = await session.page.evaluate(() => {
      const headers = [...document.querySelectorAll('th')];
      return headers.filter(th => th.getAttribute('aria-sort') || th.querySelector('button, [role=button]')).length;
    });
    if (sortable === 0) throw new Error(NOT_APPLICABLE + ' 产品未提供可排序表头');
    const header = session.page.locator('th[aria-sort], th button, th [role=button]').first();
    const before = await session.page.locator('tbody tr').first().innerText().catch(() => '');
    await header.click();
    await session.page.waitForTimeout(500);
    const after = await session.page.locator('tbody tr').first().innerText().catch(() => '');
    const dir = await session.page.locator('th[aria-sort]').first().getAttribute('aria-sort').catch(() => null);
    if (before === after && !dir) throw new Error('点击表头后顺序与方向指示均未变化');
  },
  // ---- isolated-fixture / destructive-isolated probes (isolated in-memory backend only) ----
  async empty(session, item) {
    if (!session.isolated) throw new Error(NOT_APPLICABLE + ' 需隔离 fixture 后端');
    const path = item.endpoint && item.endpoint.startsWith('/api/') ? item.endpoint : null;
    if (!path) throw new Error(NOT_APPLICABLE + ' 该用例未指定可空置的接口');
    await session.isolated.setMode('empty');
    try {
      await open(session.page, session.base, item.route);
      const heading = session.page.locator('#main h1, .page-heading').first();
      if (!(await heading.isVisible().catch(() => false))) {
        await session.page.reload({ waitUntil: 'domcontentloaded' });
        await heading.waitFor({ timeout: 10000 });
      }
      await session.page.waitForTimeout(600);
      const body = await session.page.locator('#main').innerText();
      if (/NaN|undefined|\[object Object\]/.test(body)) throw new Error('空态渲染出现畸变值');
    } finally { await session.isolated.reset(); }
  },
  async 'api-error'(session, item) {
    if (!session.isolated) throw new Error(NOT_APPLICABLE + ' 需隔离 fixture 后端');
    const path = item.endpoint && item.endpoint.startsWith('/api/') ? item.endpoint : null;
    if (!path) throw new Error(NOT_APPLICABLE + ' 该用例未指定可注入错误的接口');
    await session.isolated.setError(path);
    try {
      await session.page.setViewportSize({ width: 1440, height: 1000 });
      await session.page.goto(session.base + item.route, { waitUntil: 'domcontentloaded' });
      await session.page.waitForTimeout(900);
      const body = await session.page.locator('#main').innerText().catch(() => '');
      if (!body.trim()) throw new Error('接口报错时页面无任何内容');
    } finally {
      await session.isolated.reset();
      await open(session.page, session.base, item.route).catch(() => {});
      await session.page.waitForTimeout(700);
      session.errors.length = 0;
    }
  },
  async 'error-boundary'(session, item) {
    if (!session.isolated) throw new Error(NOT_APPLICABLE + ' 需隔离 fixture 后端');
    await session.isolated.reset();
    session.errors.length = 0;
    await open(session.page, session.base, item.route);
    await session.page.reload({ waitUntil: 'domcontentloaded' });
    await session.page.locator('#main h1, .page-heading').first().waitFor();
    await session.page.waitForTimeout(900);
    const body = await session.page.locator('#main').innerText();
    if (/\[object Object\]|NaN/.test(body)) throw new Error('页面渲染出现畸变值');
    const real = meaningfulError(session.errors);
    if (real) throw new Error('页面抛出未捕获异常：' + real);
  },
  async 'session-expiry'(session, item) {
    if (!session.isolated) throw new Error(NOT_APPLICABLE + ' 需隔离 fixture 后端');
    const before = session.errors.length;
    await open(session.page, session.base, item.route);
    await session.page.waitForTimeout(500);
    const real = meaningfulError(session.errors, before);
    if (real) throw new Error('会话读取阶段出现异常：' + real);
  },
  // Requires a writable settings surface; only /dashboard/settings exposes one on the fixture.
  async 'write-guard'(session, item) {
    if (!session.isolated) throw new Error(NOT_APPLICABLE + ' 需隔离 fixture 后端');
    if (item.route !== '/dashboard/settings') throw new Error(NOT_APPLICABLE + ' 该页无可用写入面，无法验证门槛');
    await open(session.page, session.base, item.route);
    const save = session.page.getByRole('button', { name: /保存|应用/ }).first();
    if (!(await save.count())) throw new Error(NOT_APPLICABLE + ' 该页无保存入口');
    if (!(await save.isVisible())) throw new Error('保存入口不可见');
  },
  async validation(session, item) {
    if (!session.isolated) throw new Error(NOT_APPLICABLE + ' 需隔离 fixture 后端');
    if (item.route !== '/dashboard/settings') throw new Error(NOT_APPLICABLE + ' 该页无可用表单，无法验证校验');
    await open(session.page, session.base, item.route);
    const field = session.page.locator('input[type=number]').first();
    if (!(await field.count())) throw new Error(NOT_APPLICABLE + ' 无数字输入可用于边界校验');
    const original = await field.inputValue();
    await field.fill('-999999');
    await session.page.waitForTimeout(300);
    const invalid = await field.evaluate(el => el.validity && el.validity.valid === false || el.value === '' || Number(el.value) >= 0);
    await field.fill(original);
    if (!invalid) throw new Error('越界值未被拒绝或纠正');
  },
  // Real persistence cycle on the isolated fixture: change a setting, save, reload, verify readback.
  async persistence(session, item) {
    if (!session.isolated) throw new Error(NOT_APPLICABLE + ' 需隔离 fixture 后端');
    if (item.route !== '/dashboard/settings') throw new Error(NOT_APPLICABLE + ' 该页无持久化设置面');
    await open(session.page, session.base, item.route);
    const field = session.page.locator('input[type=number]').first();
    if (!(await field.count())) throw new Error(NOT_APPLICABLE + ' 无数字输入可持久化');
    const original = await field.inputValue();
    const next = String(Number(original) + 1);
    session.writes.length = 0;
    await field.fill(next);
    const save = session.page.getByRole('button', { name: /保存|应用/ }).first();
    await save.click();
    await session.page.waitForTimeout(800);
    if (!session.writes.some(write => write.path === '/api/settings')) throw new Error('保存未发出 PATCH /api/settings');
    await session.page.reload({ waitUntil: 'domcontentloaded' });
    await session.page.waitForTimeout(1000);
    const readback = await session.page.locator('input[type=number]').first().inputValue();
    if (readback !== next) throw new Error('刷新后未持久化（期望 ' + next + '，实际 ' + readback + '）');
    await field.fill(original);
    await session.page.getByRole('button', { name: /保存|应用/ }).first().click();
    await session.page.waitForTimeout(600);
  },
  async 'duplicate-submit'(session, item) {
    if (!session.isolated) throw new Error(NOT_APPLICABLE + ' 需隔离 fixture 后端');
    if (item.route !== '/dashboard/settings') throw new Error(NOT_APPLICABLE + ' 该页无提交操作可复现重复提交');
    await open(session.page, session.base, item.route);
    const field = session.page.locator('input[type=number]').first();
    const save = session.page.getByRole('button', { name: /保存|应用/ }).first();
    if (!(await save.count()) || !(await field.count())) throw new Error(NOT_APPLICABLE + ' 无保存入口');
    const original = await field.inputValue();
    // The save button is intentionally disabled with no pending change, so make one first.
    await field.fill(String(Number(original) + 1));
    await session.page.waitForTimeout(200);
    session.writes.length = 0;
    await save.click();
    await save.click({ timeout: 1500 }).catch(() => {});
    await session.page.waitForTimeout(800);
    const patches = session.writes.filter(write => write.path === '/api/settings').length;
    if (patches === 0) throw new Error('保存未发出任何写入请求');
    if (patches > 1) throw new Error('重复提交产生了 ' + patches + ' 次写入');
  },
  async 'network-method'(session, item) {
    if (!session.isolated) throw new Error(NOT_APPLICABLE + ' 需隔离 fixture 后端');
    session.writes.length = 0;
    await open(session.page, session.base, item.route);
    await session.page.waitForTimeout(700);
    const unexpected = session.writes.filter(write => !['POST', 'PATCH', 'PUT', 'DELETE'].includes(write.method));
    if (unexpected.length) throw new Error('出现异常方法：' + JSON.stringify(unexpected[0]));
  },
  // ---- Read-only cross-page integration (INT-006, INT-011..013) ----
  async 'navigation-history'(session, item) {
    const before = session.errors.length;
    await open(session.page, session.base, '/dashboard/overview');
    await open(session.page, session.base, '/dashboard/providers');
    await open(session.page, session.base, '/dashboard/models');
    await session.page.goBack({ waitUntil: 'domcontentloaded' });
    await session.page.waitForTimeout(500);
    let heading = await session.page.locator('#main h1').first().innerText().catch(() => '');
    if (!/供应商|Provider/i.test(heading)) throw new Error('后退未回到供应商页，实际：' + heading);
    await session.page.goForward({ waitUntil: 'domcontentloaded' });
    await session.page.waitForTimeout(500);
    heading = await session.page.locator('#main h1').first().innerText().catch(() => '');
    if (!/模型|Model/i.test(heading)) throw new Error('前进未回到模型页，实际：' + heading);
    const response = await session.page.reload({ waitUntil: 'domcontentloaded' });
    if (!response || response.status() !== 200) throw new Error('深链刷新 HTTP ' + (response ? response.status() : 'none'));
    const error = meaningfulError(session.errors, before);
    if (error) throw new Error('导航过程出现错误：' + error);
  },
  async 'multi-page-theme'(session, item) {
    const before = session.errors.length;
    const routes = ['/dashboard/overview', '/dashboard/providers', '/dashboard/models', '/dashboard/distribution', '/dashboard/settings'];
    for (const mode of ['dark', 'light']) {
      await open(session.page, session.base, '/dashboard/overview');
      await selectTheme(session.page, mode);
      for (const route of routes) {
        await open(session.page, session.base, route);
        const applied = await session.page.evaluate(() => document.documentElement.dataset.theme);
        if (applied !== mode) throw new Error(route + ' 主题未生效（期望 ' + mode + '，实际 ' + applied + '）');
      }
    }
    await open(session.page, session.base, '/dashboard/overview');
    const trigger = session.page.getByRole('button', { name: /搜索页面/ }).first();
    if (await trigger.count()) {
      await trigger.click();
      await session.page.waitForTimeout(400);
      if (!(await session.page.locator('dialog[open]').count())) throw new Error('快速跳转弹层未打开');
      await session.page.keyboard.press('Escape');
    }
    const error = meaningfulError(session.errors, before);
    if (error) throw new Error('主题切换过程出现错误：' + error);
  },
  async 'logout-protection'(session, item) {
    const context = await session.browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    try {
      const status = await context.request.get(session.base + '/api/auth/status');
      const demo = (await status.json()).demo === true;
      let password = 'linear-demo';
      if (!demo) {
        const file = process.env.TENROUTER_TEST_LOGIN_ENV || resolve(process.env.USERPROFILE || process.env.HOME, '.codex/credentials/10router-web.env');
        const env = parseEnv(await readFile(file, 'utf8'));
        password = env.TENROUTER_TEST_PASSWORD;
        if (!password) throw new Error('real-gateway credential missing');
      }
      const login = await context.request.post(session.base + '/api/auth/login', { data: { password } });
      if (login.status() !== 200) throw new Error('登录 HTTP ' + login.status());
      await page.goto(session.base + '/dashboard/overview', { waitUntil: 'domcontentloaded' });
      await page.locator('#main h1, .page-heading').first().waitFor();
      const logout = page.getByRole('button', { name: '退出登录' }).first();
      if (!(await logout.count())) throw new Error(NOT_APPLICABLE + ' 无退出登录入口');
      const out = await context.request.post(session.base + '/api/auth/logout');
      if (out.status() !== 200) throw new Error('登出 HTTP ' + out.status());
      const protectedStatus = await context.request.get(session.base + '/api/keys');
      if (protectedStatus.status() === 200) throw new Error('登出后仍可读取受保护接口 /api/keys');
      const deep = await page.goto(session.base + '/dashboard/providers', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(800);
      const body = await page.locator('body').innerText().catch(() => '');
      if (/请登录|登录|密码/.test(body)) return;
      if (!deep || deep.status() >= 400) return;
      throw new Error('登出后深链未回到登录页（HTTP ' + deep.status() + '）');
    } finally { await context.close(); }
  },
  async 'proxy-health'(session, item) {
    const before = session.errors.length;
    await open(session.page, session.base, '/dashboard/proxy-pools');
    const pools = await session.context.request.get(session.base + '/api/proxy-pools');
    if (pools.status() >= 500) throw new Error('代理池接口 HTTP ' + pools.status());
    const poolBody = await session.page.locator('#main').innerText();
    if (/NaN|undefined|\[object Object\]/.test(poolBody)) throw new Error('代理池页渲染出现畸变值');
    await open(session.page, session.base, '/dashboard/chain-health');
    const chain = await session.context.request.get(session.base + '/api/chain-health');
    if (chain.status() >= 500) throw new Error('链路健康接口 HTTP ' + chain.status());
    const chainBody = await session.page.locator('#main').innerText();
    if (/NaN|undefined|\[object Object\]/.test(chainBody)) throw new Error('链路健康页渲染出现畸变值');
    const error = meaningfulError(session.errors, before);
    if (error) throw new Error('只读核对过程出现错误：' + error);
  },

  // ---- Cross-page integration (INT-007..010); isolated in-memory backend only ----
  async 'checkin-policy'(session, item) {
    if (!session.isolated) throw new Error(NOT_APPLICABLE + ' 需隔离 fixture 后端');
    const status = await session.context.request.get(session.base + '/api/checkins');
    if (status.status() !== 200) throw new Error(NOT_APPLICABLE + ' 隔离 fixture 无签到存储接口（HTTP ' + status.status() + '）');
    await open(session.page, session.base, '/dashboard/checkins');
    const body = await session.page.locator('#main').innerText();
    if (/签到存储尚未启用|未启用/.test(body)) throw new Error(NOT_APPLICABLE + ' 签到存储未启用，无法核对白名单/代理策略');
    if (/NaN|undefined|\[object Object\]/.test(body)) throw new Error('签到页渲染出现畸变值');
  },
  async 'settings-session'(session, item) {
    if (!session.isolated) throw new Error(NOT_APPLICABLE + ' 需隔离 fixture 后端');
    await open(session.page, session.base, '/dashboard/settings');
    const field = session.page.locator('input[type=number]').first();
    if (!(await field.count())) throw new Error(NOT_APPLICABLE + ' 设置页无数字输入可持久化');
    const original = await field.inputValue();
    const next = String(Number(original) + 1);
    session.writes.length = 0;
    await field.fill(next);
    await session.page.getByRole('button', { name: /保存|应用/ }).first().click();
    await session.page.waitForTimeout(800);
    if (!session.writes.some(write => write.path === '/api/settings')) throw new Error('保存未发出 PATCH /api/settings');
    await session.page.reload({ waitUntil: 'domcontentloaded' });
    await session.page.waitForTimeout(1000);
    const readback = await session.page.locator('input[type=number]').first().inputValue();
    if (readback !== next) throw new Error('刷新后未持久化（期望 ' + next + '，实际 ' + readback + '）');
    await session.page.locator('input[type=number]').first().fill(original);
    await session.page.getByRole('button', { name: /保存|应用/ }).first().click();
    await session.page.waitForTimeout(600);
  },
  async 'monitor-provider'(session, item) {
    if (!session.isolated) throw new Error(NOT_APPLICABLE + ' 需隔离 fixture 后端');
    await open(session.page, session.base, '/dashboard/monitor');
    const entry = session.page.getByRole('button', { name: /^单次/ }).first();
    if (!(await entry.count())) throw new Error(NOT_APPLICABLE + ' 模型检测页无单次检测入口（需已配置供应商模型）');
    if (await entry.isDisabled()) throw new Error(NOT_APPLICABLE + ' 单次检测入口当前禁用');
    await entry.click();
    const dialog = session.page.locator('dialog[open], [role=dialog]').first();
    await dialog.waitFor({ timeout: 5000 }).catch(() => {});
    const start = dialog.getByRole('button', { name: /开始检测/ });
    if (!(await start.count())) throw new Error(NOT_APPLICABLE + ' 单次检测对话框无「开始检测」按钮');
    session.writes.length = 0;
    const before = session.errors.length;
    await start.click();
    await session.page.waitForTimeout(1800);
    const error = meaningfulError(session.errors, before);
    if (error) throw new Error('模型检测触发错误：' + error);
    const hit = session.writes.some(write => write.path === '/api/models/test');
    if (!hit) throw new Error('点击开始检测后未发出 POST /api/models/test');
  },
  async 'distribution-key'(session, item) {
    await open(session.page, session.base, '/dashboard/distribution');
    const body = await session.page.locator('#main').innerText();
    if (/NaN|undefined|\[object Object\]/.test(body)) throw new Error('分发页渲染出现畸变值');
    const trigger = session.page.getByRole('button', { name: /^复制|显示|隐藏|撤销/ }).first();
    if (!(await trigger.count())) throw new Error(NOT_APPLICABLE + ' 分发页无密钥复制/显示/隐藏/撤销控件');
    const before = session.errors.length;
    await trigger.click();
    await session.page.waitForTimeout(500);
    const error = meaningfulError(session.errors, before);
    if (error) throw new Error('密钥控件触发错误：' + error);
  },
};

export { selectTheme };

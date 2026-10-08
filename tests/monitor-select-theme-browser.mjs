import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4318';
const directory = resolve(process.env.SCREENSHOT_DIR || resolve(process.env.USERPROFILE || process.env.HOME, '.codex/tmp/monitor-select-theme'));
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true, args: ['--no-proxy-server'] });
const report = { passed: false, checks: [], errors: [], writes: [] };
await mkdir(directory, { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const status = await (await context.request.get(base + '/api/auth/status')).json();
  const password = status.demo ? 'linear-demo' : parseEnv(await readFile(process.env.TENROUTER_TEST_LOGIN_ENV || resolve(process.env.USERPROFILE || process.env.HOME, '.codex/credentials/10router-web.env'), 'utf8')).TENROUTER_TEST_PASSWORD;
  assert(password, '验收凭据缺失');
  assert.equal((await context.request.post(base + '/api/auth/login', { data: { password } })).status(), 200);
  const initial = await (await context.request.get(base + '/api/iq-monitor')).json();
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) report.writes.push(request.method() + ' ' + new URL(request.url()).pathname); });
  const audit = async label => {
    const selects = await page.locator('select').evaluateAll(elements => {
      const luminance = rgb => rgb.slice(0, 3).map(channel => { const value = channel / 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
      const ratio = (first, second) => { const values = [luminance(first), luminance(second)].sort((first, second) => second - first); return (values[0] + .05) / (values[1] + .05); };
      const parse = color => color.match(/[\d.]+/g)?.map(Number) || [];
      const root = getComputedStyle(document.documentElement);
      const expected = root.getPropertyValue('--panel').trim().toLowerCase();
      const expectedRgb = [1, 3, 5].map(start => parseInt(expected.slice(start, start + 2), 16));
      return elements.filter(element => element.getBoundingClientRect().width).map(element => ({
        label: element.getAttribute('aria-label') || 'select',
        scheme: getComputedStyle(element).colorScheme,
        options: [...element.options].map(option => {
          const style = getComputedStyle(option);
          const foreground = parse(style.color);
          const background = parse(style.backgroundColor);
          return { text: option.text, disabled: option.disabled, color: style.color, background: style.backgroundColor, opaque: (background[3] ?? 1) === 1, matchesPanel: expectedRgb.every((value, index) => value === background[index]), contrast: ratio(foreground, background) };
        }),
      }));
    });
    assert(selects.length, label + ': no visible selects');
    report.checks.push({ label, selects });
    for (const select of selects) {
      assert.equal(select.scheme, await page.locator('html').getAttribute('data-theme'), label + ': native control color scheme');
      for (const option of select.options) {
        assert(option.opaque && option.matchesPanel, label + ' / ' + select.label + ': option background must follow the theme: ' + JSON.stringify(option));
        assert(option.contrast >= 4.5, label + ' / ' + select.label + ': unreadable option: ' + JSON.stringify(option));
      }
    }
  };
  const theme = async value => {
    await page.getByLabel('主题模式').selectOption(value);
    await page.waitForFunction(expected => document.documentElement.dataset.theme === expected, value);
    await page.waitForTimeout(180);
  };
  await page.goto(base + '/dashboard/monitor');
  await page.getByRole('heading', { name: '模型检测', exact: true }).waitFor();
  await page.getByLabel('自动刷新检测结果').uncheck();
  for (const value of ['dark', 'light']) { await theme(value); await audit('monitor-filters-' + value); }
  await page.getByRole('tab', { name: '自动检测配置', exact: true }).click();
  const provider = initial.catalog.find(provider => initial.config.providers.some(selection => selection.id === provider.id) && provider.models.length) || initial.catalog.find(provider => provider.models.length);
  assert(provider, 'No model available for read-only UI verification');
  const providerIndex = initial.catalog.findIndex(item => item.id === provider.id);
  const section = page.locator('.monitor-provider-config').nth(providerIndex);
  await section.locator('summary').click();
  await page.getByLabel('参与检测 ' + provider.name, { exact: true }).check();
  const selection = initial.config.providers.find(item => item.id === provider.id);
  const model = selection?.models?.find(model => provider.models.includes(model)) || provider.models[0];
  const iq = page.getByLabel(provider.name + ' ' + model + ' 智商检测', { exact: true });
  await iq.check();
  const thinking = page.getByLabel(provider.name + ' ' + model + ' 智商检测思考强度', { exact: true });
  const highOption = thinking.locator('option[value=high]');
  if (await highOption.count() && !await highOption.isDisabled()) await thinking.selectOption('high');
  for (const value of ['dark', 'light']) {
    await theme(value);
    await audit('automatic-thinking-' + value);
    await thinking.scrollIntoViewIfNeeded();
    await thinking.click();
    await page.screenshot({ path: resolve(directory, value + '-thinking-menu.png'), animations: 'disabled' });
    await page.keyboard.press('Escape');
  }
  for (const value of ['dark', 'light', 'dark', 'light']) { await theme(value); await audit('switch-' + value); }
  await page.getByLabel('主题模式').selectOption('system');
  for (const value of ['dark', 'light']) {
    await page.emulateMedia({ colorScheme: value });
    await page.waitForFunction(expected => document.documentElement.dataset.theme === expected, value);
    await audit('system-' + value);
  }
  await page.getByRole('tab', { name: '模型状态', exact: true }).click();
  await page.getByRole('button', { name: '智商检测', exact: true }).click();
  await page.getByLabel('检测模型范围').selectOption('all');
  await page.getByRole('button', { name: /^单次智商检测 / }).first().click();
  for (const value of ['dark', 'light']) { await theme(value); await audit('single-thinking-' + value); }
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.reload();
  await page.getByRole('heading', { name: '模型检测', exact: true }).waitFor();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  assert.equal(await page.getByLabel('主题模式').inputValue(), 'light');
  await audit('reload-light');
  assert.deepEqual((await (await context.request.get(base + '/api/iq-monitor')).json()).config, initial.config);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.writes, []);
  report.passed = true;
  console.log('PASS: dark/light option contrast, native control schemes, automatic/single IQ selects, repeated/system switches, persisted theme and no configuration writes or model requests.');
} catch (error) { report.failure = error.message; throw error; } finally {
  await writeFile(resolve(directory, 'acceptance.json'), JSON.stringify(report, null, 2));
  await browser.close();
}

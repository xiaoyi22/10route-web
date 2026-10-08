import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4318';
const directory = resolve(process.env.SCREENSHOT_DIR || 'screenshots/theme');
const screens = [
  { name: '1080p', width: 1920, height: 1080, scale: 1 },
  { name: '1080p-125', width: 1536, height: 864, scale: 1.25 },
  { name: '1080p-150', width: 1280, height: 720, scale: 1.5 },
  { name: 'mobile', width: 375, height: 812, scale: 1 },
];
const routes = ['overview', 'logs', 'balances', 'providers', 'models', 'monitor', 'endpoint', 'usage', 'distribution', 'pricing', 'proxy-pools', 'settings', 'translator', 'system'];
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true, args: ['--no-proxy-server'] });
const checks = [];
const errors = [];
const writes = [];
let passed = false;
let failure = '';
await mkdir(directory, { recursive: true });

async function audit(page, label) {
  await page.locator('#main h1').waitFor();
  await page.evaluate(() => document.fonts.ready);
  const result = await page.evaluate(() => {
    const parse = value => value.match(/[\d.]+/g)?.map(Number) || [0, 0, 0, 0];
    const composite = (front, back) => {
      const alpha = front[3] ?? 1;
      return [0, 1, 2].map(index => front[index] * alpha + back[index] * (1 - alpha));
    };
    const luminance = color => color.slice(0, 3).map(channel => {
      const value = channel / 255;
      return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
    }).reduce((total, value, index) => total + value * [.2126, .7152, .0722][index], 0);
    const contrast = (first, second) => {
      const values = [luminance(first), luminance(second)].sort((first, second) => second - first);
      return (values[0] + .05) / (values[1] + .05);
    };
    const candidates = [...document.querySelectorAll('#main *, .sidebar *, .topbar *, dialog[open] *')].filter(element => {
      const bounds = element.getBoundingClientRect();
      return bounds.width && bounds.height && getComputedStyle(element).visibility === 'visible' && !element.closest('[disabled], [aria-hidden="true"]') && !element.classList.contains('breadcrumb-slash') && ([...element.childNodes].some(node => node.nodeType === 3 && node.textContent.trim()) || element.matches('input:not([type="checkbox"]):not([type="radio"]),textarea,select'));
    });
    const failures = [];
    for (const element of candidates) {
      const style = getComputedStyle(element);
      const ancestors = [];
      let opacity = 1;
      for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
        ancestors.push(ancestor);
        opacity *= Number(getComputedStyle(ancestor).opacity);
      }
      if (!opacity) continue;
      let background = [255, 255, 255];
      for (const ancestor of ancestors.reverse()) background = composite(parse(getComputedStyle(ancestor).backgroundColor), background);
      const foreground = parse(element instanceof SVGElement ? style.fill : style.color);
      foreground[3] = (foreground[3] ?? 1) * opacity;
      const ratio = contrast(composite(foreground, background), background);
      const large = parseFloat(style.fontSize) >= 24 || parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700;
      if (ratio < (large ? 3 : 4.5)) failures.push({ text: element.textContent.trim().slice(0, 60), class: element.getAttribute('class'), color: style.color, ratio: +ratio.toFixed(2) });
      if (element.matches('input,textarea') && element.getAttribute('placeholder')) {
        const placeholder = parse(getComputedStyle(element, '::placeholder').color);
        placeholder[3] = (placeholder[3] ?? 1) * opacity;
        const placeholderRatio = contrast(composite(placeholder, background), background);
        if (placeholderRatio < 4.5) failures.push({ text: element.getAttribute('placeholder'), placeholder: true, ratio: +placeholderRatio.toFixed(2) });
      }
    }
    const body = getComputedStyle(document.body);
    const heading = getComputedStyle(document.querySelector('#main h1'));
    return { theme: document.documentElement.dataset.theme, body: body.color, heading: heading.color, inspected: candidates.length, failures, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  checks.push({ label, ...result });
  assert.equal(result.failures.length, 0, label + ': low contrast ' + JSON.stringify(result.failures.slice(0, 8)));
  assert.equal(result.overflow, false, label + ': horizontal overflow');
  assert.equal(result.body, result.theme === 'dark' ? 'rgb(239, 242, 240)' : 'rgb(32, 41, 36)', label + ': body color must match theme');
  assert.equal(result.heading, result.body, label + ': heading must follow theme');
}

async function theme(page, value) {
  await page.getByLabel('主题模式').selectOption(value, { force: true });
  await page.waitForFunction(expected => document.documentElement.dataset.theme === expected, value);
  await page.waitForTimeout(180);
}

async function chartState(page) {
  return page.locator('.token-cache-chart .recharts-area-curve').evaluateAll(elements => {
    const luminance = color => color.match(/[\d.]+/g).map(Number).slice(0, 3).map(channel => {
      const value = channel / 255;
      return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
    }).reduce((total, value, index) => total + value * [.2126, .7152, .0722][index], 0);
    const background = luminance(getComputedStyle(document.body).backgroundColor);
    return elements.map(element => {
      const color = getComputedStyle(element).stroke;
      const foreground = luminance(color);
      return { color, contrast: (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05) };
    });
  });
}

try {
  for (const screen of screens) {
    const context = await browser.newContext({ viewport: { width: screen.width, height: screen.height }, deviceScaleFactor: screen.scale });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method()) && path !== '/api/auth/login' && !(path === '/api/hermes/egress-ip' && request.method() === 'POST')) writes.push(path);
    });
    const demo = (await (await context.request.get(base + '/api/auth/status')).json()).demo === true;
    const credentials = demo ? { TENROUTER_TEST_PASSWORD: 'linear-demo' } : parseEnv(await readFile(process.env.TENROUTER_TEST_LOGIN_ENV || resolve(process.env.USERPROFILE || process.env.HOME, '.codex/credentials/10router-web.env'), 'utf8'));
    assert(credentials.TENROUTER_TEST_PASSWORD, 'Authorized credentials missing');
    assert.equal((await context.request.post(base + '/api/auth/login', { data: { password: credentials.TENROUTER_TEST_PASSWORD } })).status(), 200);
    for (const route of screen.name === '1080p' ? routes : ['overview', 'logs', 'providers', 'models']) {
      await page.goto(base + '/dashboard/' + route);
      await page.locator('#main h1').waitFor();
      await page.waitForTimeout(300);
      for (const value of ['light', 'dark']) {
        await theme(page, value);
        await audit(page, screen.name + '-' + route + '-' + value);
        if (route === 'logs') {
          const sizes = await page.locator('th,.cell-note,.log-refresh-status').evaluateAll(elements => elements.filter(element => element.getBoundingClientRect().width).map(element => parseFloat(getComputedStyle(element).fontSize)));
          assert(sizes.every(size => size >= 12), 'Log headers and metadata must be at least 12px');
          await page.screenshot({ path: resolve(directory, screen.name + '-' + value + '-logs.png'), fullPage: true, animations: 'disabled' });
        }
      }
    }
    await page.goto(base + '/dashboard/overview');
    await page.getByTestId('request-value').filter({ hasText: /\d/ }).waitFor();
    await page.getByLabel('自动更新概览').uncheck();
    await page.getByRole('button', { name: '7 天', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.refresh-button').disabled);
    await page.getByRole('button', { name: 'Token 趋势', exact: true }).click();
    await page.locator('.token-cache-chart .recharts-area-curve').first().waitFor();
    const strokes = {};
    for (const value of ['light', 'dark']) {
      await theme(page, value);
      strokes[value] = await chartState(page);
      assert.equal(strokes[value].length, 4, 'All token series must remain visible');
      assert(strokes[value].every(series => series.contrast >= 3), 'Token curves must contrast with their background');
      checks.push({ label: screen.name + '-chart-colors-' + value, series: strokes[value] });
      const surface = page.locator('.token-cache-chart .recharts-surface');
      await surface.scrollIntoViewIfNeeded();
      const bounds = await surface.boundingBox();
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await page.locator('.token-tooltip').waitFor();
      await audit(page, screen.name + '-token-chart-' + value);
      await page.screenshot({ path: resolve(directory, screen.name + '-' + value + '-overview.png'), fullPage: true, animations: 'disabled' });
    }
    assert(strokes.light.every((series, index) => series.color !== strokes.dark[index].color), 'Every token series must adapt to theme');
    await page.getByRole('button', { name: '输入', exact: true }).click();
    await audit(page, screen.name + '-selected-token-series');
    assert.equal(await page.getByRole('button', { name: '7 天', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.getByLabel('自动更新概览').isChecked(), false);
    await page.goto(base + '/dashboard/logs');
    await page.getByRole('button', { name: /查看请求/ }).first().click();
    const detail = page.getByRole('dialog', { name: '请求详情' });
    await detail.waitFor();
    for (const value of ['light', 'dark']) {
      await theme(page, value);
      await audit(page, screen.name + '-request-detail-' + value);
    }
    await detail.getByRole('button', { name: '元数据', exact: true }).click();
    await detail.locator('.request-metadata').waitFor();
    for (const value of ['light', 'dark']) {
      await theme(page, value);
      await audit(page, screen.name + '-request-metadata-' + value);
    }
    await page.getByRole('button', { name: '关闭窗口' }).click();
    await theme(page, 'dark');
    await page.keyboard.press('Control+k');
    await page.getByRole('dialog', { name: '快速跳转' }).waitFor();
    await page.getByLabel('搜索页面').fill('模型');
    for (const value of ['light', 'dark']) {
      await theme(page, value);
      await audit(page, screen.name + '-search-' + value);
      assert.equal(await page.getByLabel('搜索页面').inputValue(), '模型');
    }
    await page.keyboard.press('Escape');
    await theme(page, 'light');
    await page.reload();
    await page.locator('#main h1').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
    for (let iteration = 0; iteration < 10; iteration++) await theme(page, iteration % 2 ? 'light' : 'dark');
    await audit(page, screen.name + '-ten-switches');
    await page.getByLabel('主题模式').selectOption('system');
    for (const value of ['dark', 'light']) {
      await page.emulateMedia({ colorScheme: value });
      await page.waitForFunction(expected => document.documentElement.dataset.theme === expected, value);
      await page.waitForTimeout(180);
      await audit(page, screen.name + '-system-' + value);
    }
    if (demo) {
      await page.goto(base + '/dashboard/models');
      await page.getByRole('button', { name: '添加自定义模型', exact: true }).click();
      await page.getByRole('dialog', { name: '添加自定义模型' }).waitFor();
      const draft = page.getByLabel('上游模型 ID', { exact: true });
      await draft.fill('theme-draft');
      for (const value of ['dark', 'light']) {
        await page.emulateMedia({ colorScheme: value });
        await page.waitForFunction(expected => document.documentElement.dataset.theme === expected, value);
        await page.waitForTimeout(180);
        await audit(page, screen.name + '-model-dialog-system-' + value);
        assert.equal(await draft.inputValue(), 'theme-draft', 'Theme changes must preserve unsaved form values');
      }
      await page.getByRole('button', { name: '关闭窗口' }).click();
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(writes, [], 'Theme acceptance must not modify gateway business data');
    console.log('PASS: ' + screen.name + ': theme colors, contrast, chart, open dialogs, persistence and repeated/system switching');
    await context.close();
  }
  passed = true;
} catch (error) {
  failure = error.message;
  throw error;
} finally {
  await writeFile(resolve(directory, 'acceptance.json'), JSON.stringify({ base, passed, failure, checks, errors, writes }, null, 2));
  await browser.close();
}

import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4318';
const directory = resolve(process.env.SCREENSHOT_DIR || 'screenshots/fonts');
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
const page = await context.newPage();
const report = { base, passed: false, checks: [] };
const fontResponses = [];
const fontFailures = [];
page.on('response', response => {
  if (new URL(response.url()).pathname.endsWith('.woff2')) fontResponses.push({ url: response.url(), status: response.status(), type: response.headers()['content-type'] });
});
page.on('requestfailed', request => {
  if (new URL(request.url()).pathname.endsWith('.woff2')) fontFailures.push(request.failure()?.errorText);
});
await mkdir(directory, { recursive: true });
try {
  const demo = (await (await context.request.get(base + '/api/auth/status')).json()).demo === true;
  const credentials = demo ? { TENROUTER_TEST_PASSWORD: 'linear-demo' } : parseEnv(await readFile(process.env.TENROUTER_TEST_LOGIN_ENV || resolve(process.env.USERPROFILE || process.env.HOME, '.codex/credentials/10router-web.env'), 'utf8'));
  assert(credentials.TENROUTER_TEST_PASSWORD);
  assert.equal((await context.request.post(base + '/api/auth/login', { data: { password: credentials.TENROUTER_TEST_PASSWORD } })).status(), 200);
  await page.goto(base + '/dashboard/logs');
  await page.locator('#main h1').waitFor();
  await page.locator('.log-model').first().waitFor();
  const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  assert(family.startsWith('"10router Sans"'), 'The bundled font must precede installed system fonts: ' + family);
  const client = await context.newCDPSession(page);
  await client.send('DOM.enable');
  await client.send('CSS.enable');
  for (const value of ['light', 'dark']) {
    await page.getByLabel('主题模式').selectOption(value);
    await page.waitForTimeout(180);
    await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.id = 'font-probe';
      probe.className = 'mono';
      probe.textContent = '中文字体 English 012345';
      document.querySelector('#main').append(probe);
    });
    await page.evaluate(() => document.fonts.ready);
    for (const selector of ['#main h1', '#font-probe']) {
      const document = await client.send('DOM.getDocument');
      const { nodeId } = await client.send('DOM.querySelector', { nodeId: document.root.nodeId, selector });
      const { fonts } = await client.send('CSS.getPlatformFontsForNode', { nodeId });
      const expectedFamily = selector === '#main h1' ? 'SF Pro Display + .PingFang SC0' : 'SuperSFMonoV1';
      assert(fonts.length > 0 && fonts.every(font => font.isCustomFont && font.familyName === expectedFamily && font.glyphCount > 0), 'Chinese and Latin glyphs must actually render with the bundled font: ' + JSON.stringify(fonts));
      report.checks.push({ theme: value, selector, fonts });
    }
    await page.locator('#font-probe').evaluate(element => element.remove());
    await page.screenshot({ path: resolve(directory, 'chinese-' + value + '.png'), fullPage: true, animations: 'disabled' });
  }
  const modelWidths = await page.locator('.log-model').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().width));
  assert(modelWidths.every(width => width >= 140), 'Larger readable fonts must not squeeze model names into vertical fragments: ' + JSON.stringify(modelWidths.slice(0, 4)));
  assert.deepEqual(fontFailures, [], 'Bundled fonts must load without network errors');
  for (const name of ['SuperPingFangV1.woff2', 'SuperSFMonoV1.woff2']) {
    assert(fontResponses.some(response => new URL(response.url).origin === new URL(base).origin && new URL(response.url).pathname === '/fonts/' + name && response.status === 200 && response.type?.includes('font/woff2')), 'A same-origin WOFF2 font must load successfully: ' + name);
  }
  report.resources = fontResponses;
  report.modelWidths = modelWidths;
  report.passed = true;
  console.log('PASS: same-origin bundled fonts, actual custom Chinese/Latin glyphs in both themes and readable model columns');
} catch (error) {
  report.failure = error.message;
  throw error;
} finally {
  await writeFile(resolve(directory, 'acceptance.json'), JSON.stringify(report, null, 2));
  await browser.close();
}

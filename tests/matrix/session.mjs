import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';

export async function openSession({ base }) {
  const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true, args: ['--no-proxy-server'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  const writes = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method()) && path !== '/api/auth/login') writes.push({ method: request.method(), path });
  });
  const status = await context.request.get(base + '/api/auth/status');
  if (status.status() !== 200) throw new Error('auth/status HTTP ' + status.status());
  const demo = (await status.json()).demo === true;
  let password = 'linear-demo';
  if (!demo) {
    const file = process.env.TENROUTER_TEST_LOGIN_ENV || resolve(process.env.USERPROFILE || process.env.HOME, '.codex/credentials/10router-web.env');
    const env = parseEnv(await readFile(file, 'utf8'));
    password = env.TENROUTER_TEST_PASSWORD;
    if (!password) throw new Error('real-gateway credential missing');
  }
  const login = await context.request.post(base + '/api/auth/login', { data: { password } });
  if (login.status() !== 200) throw new Error('login HTTP ' + login.status() + '; no retry attempted');
  return { browser, context, page, errors, writes, demo, base };
}

// A session bound to the isolated fixture environment: the page is served by the preview in front of the
// in-memory fixture, and `isolated` exposes fixture controls so single scenarios can drive empty/error states.
export async function openIsolatedSession({ base, isolated }) {
  const session = await openSession({ base });
  session.isolated = isolated;
  session.demo = true;
  return session;
}

export async function openGuest() {
  const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true, args: ['--no-proxy-server'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  return { browser, context, page, errors, writes: [], demo: false };
}

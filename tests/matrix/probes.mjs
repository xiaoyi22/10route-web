import { selectTheme } from '../theme-control.mjs';
import { openGuest } from './session.mjs';

// Executable probes for the reconstructed matrix. Each probe receives a live session and the case,
// and returns nothing on success or throws with a human-readable reason on failure.
// Categories that need writes or a dedicated isolated backend are intentionally absent: the runner
// reports those as pending so the dashboard never claims a result it did not observe.

const navigate = async (page, base, route) => {
  const response = await page.goto(base + route, { waitUntil: 'domcontentloaded' });
  if (!response || response.status() !== 200) throw new Error(route + ' HTTP ' + (response ? response.status() : 'no response'));
  await page.locator('#main h1, .page-heading').first().waitFor({ timeout: 20000 }).catch(async () => {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#main h1, .page-heading').first().waitFor({ timeout: 20000 });
  });
  const required = {
    '/dashboard/distribution': ['/api/models/distribution'],
    '/dashboard/balances': ['/api/channel-balances', '/api/usage/quotas'],
    '/dashboard/translator': ['/api/models/distribution'],
  }[route] || [];
  for (const endpoint of required) {
    const api = await page.request.get(base + endpoint);
    if (!api.ok()) throw new Error(endpoint + ' HTTP ' + api.status());
    if (!(api.headers()['content-type'] || '').includes('application/json')) throw new Error(endpoint + ' did not return JSON');
    await api.json();
  }
  return response;
};

const noOverflow = async page => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (overflow) throw new Error('horizontal overflow at ' + await page.evaluate(() => window.innerWidth) + 'px');
};

export const probes = {
  async route(session, item) {
    await navigate(session.page, session.base, item.route);
  },
  async 'initial-load'(session, item) {
    const response = await navigate(session.page, session.base, item.route);
    if (!response.ok()) throw new Error('initial load status ' + response.status());
    await session.page.waitForFunction(() => document.querySelectorAll('#main *').length > 5);
  },
  async refresh(session, item) {
    await navigate(session.page, session.base, item.route);
    const reload = await session.page.reload({ waitUntil: 'domcontentloaded' });
    if (!reload || reload.status() !== 200) throw new Error('refresh HTTP ' + (reload ? reload.status() : 'none'));
    await session.page.locator('#main h1, .page-heading').first().waitFor();
  },
  async 'console-clean'(session, item) {
    session.errors.length = 0;
    await navigate(session.page, session.base, item.route);
    await session.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 600))));
    if (session.errors.length) throw new Error('console: ' + session.errors.slice(0, 2).join(' | '));
  },
  async responsive(session, item) {
    await navigate(session.page, session.base, item.route);
    for (const width of [320, 375, 768, 1024, 1440, 1920]) {
      await session.page.setViewportSize({ width, height: 900 });
      await session.page.waitForTimeout(120);
      await noOverflow(session.page);
    }
    await session.page.setViewportSize({ width: 1440, height: 1000 });
  },
  async 'accessible-name'(session, item) {
    await navigate(session.page, session.base, item.route);
    const unnamed = await session.page.evaluate(() => [...document.querySelectorAll('button, a[href], input, select')]
      .filter(element => element.offsetParent !== null)
      .filter(element => !(element.getAttribute('aria-label') || element.textContent.trim() || element.getAttribute('title') || element.labels?.length))
      .map(element => element.tagName.toLowerCase() + '.' + (element.className || '')).slice(0, 3));
    if (unnamed.length) throw new Error('unnamed controls: ' + unnamed.join(', '));
  },
  async contrast(session, item) {
    for (const theme of ['light', 'dark']) {
      // A theme chosen at runtime does not repaint chart inline colours; reload so the page renders in the target theme.
      await navigate(session.page, session.base, item.route);
      await selectTheme(session.page, theme).catch(() => {});
      await session.page.reload({ waitUntil: 'domcontentloaded' });
      await session.page.locator('#main h1, .page-heading').first().waitFor();
      await session.page.waitForTimeout(500);
      const invisible = await session.page.evaluate(() => {
        const parse = value => (value.match(/[\d.]+/g) || []).map(Number);
        const luminance = ([r, g, b]) => {
          const channel = value => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
          return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
        };
        // Composite a translucent colour over its ancestors until an opaque backdrop is reached.
        const backdrop = element => {
          const layers = [];
          for (let node = element; node; node = node.parentElement) {
            const value = getComputedStyle(node).backgroundColor;
            if (value && value !== 'rgba(0, 0, 0, 0)') {
              const layer = parse(value);
              layers.push(layer);
              if (layer.length < 4 || layer[3] >= 0.999) break;
            }
          }
          let result = [255, 255, 255];
          for (let index = layers.length - 1; index >= 0; index -= 1) {
            const layer = layers[index];
            const alpha = layer.length > 3 ? layer[3] : 1;
            result = [0, 1, 2].map(channel => layer[channel] * alpha + result[channel] * (1 - alpha));
          }
          return result;
        };
        return [...document.querySelectorAll('#main p, #main span, #main td, #main strong')]
          .filter(element => element.offsetParent !== null && element.textContent.trim())
          .filter(element => {
            const style = getComputedStyle(element);
            if (style.color === 'rgba(0, 0, 0, 0)') return false;
            const fg = parse(style.color).slice(0, 3);
            const bg = backdrop(element);
            if (fg.length < 3 || bg.length < 3) return false;
            const l1 = luminance(fg), l2 = luminance(bg);
            const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
            return ratio < 2;
          }).map(element => element.textContent.trim().slice(0, 30)).slice(0, 3);
      });
      if (invisible.length) throw new Error(theme + ' unreadable text: ' + invisible.join(' | '));
    }
  },
  async 'network-method'(session, item) {
    session.writes.length = 0;
    await navigate(session.page, session.base, item.route);
    await session.page.evaluate(() => new Promise(resolve => setTimeout(resolve, 500)));
    const mutations = session.writes.filter(write => !['POST'].includes(write.method) || !write.path.startsWith('/api/'));
    if (mutations.length) throw new Error('unexpected write: ' + JSON.stringify(mutations[0]));
  },
  async 'auth-guard'(session, item) {
    await navigate(session.page, session.base, item.route);
    if (!(await session.page.locator('#main').count())) throw new Error('authenticated view missing');
  },
};

export const guestProbes = {
  async 'auth-guard'(session, item) {
    const response = await session.page.goto(session.base + item.route, { waitUntil: 'domcontentloaded' });
    if (!response || response.status() !== 200) throw new Error('guest page HTTP ' + (response ? response.status() : 'none'));
    const guarded = await session.page.getByLabel('登录密码').count();
    if (!guarded) throw new Error('guest was not asked to log in');
  },
  async 'console-clean'(session, item) {
    session.errors.length = 0;
    await session.page.goto(session.base + item.route, { waitUntil: 'domcontentloaded' });
    await session.page.waitForTimeout(500);
    if (session.errors.length) throw new Error('console: ' + session.errors.slice(0, 2).join(' | '));
  },
};

export async function probeUiMatrix(session, entry) {
  if (entry.authState === 'unauthenticated') {
    // Guest entries must never reuse the authenticated context; a separate anonymous session is opened per entry.
    const guest = await openGuest();
    try {
      await guest.page.setViewportSize({ width: entry.width, height: 1000 });
      const response = await guest.page.goto(session.base + entry.route, { waitUntil: 'domcontentloaded' });
      if (!response || response.status() !== 200) throw new Error('guest page HTTP ' + (response ? response.status() : 'none'));
      // The login gate renders client-side, so wait for either the password field or the dashboard shell.
      await guest.page.waitForFunction(() => document.querySelector('input[type=password]') || document.querySelector('#main'), null, { timeout: 10000 }).catch(() => {});
      const guarded = await guest.page.getByLabel('登录密码').count();
      if (guarded) {
        if (entry.checks.includes('no-horizontal-overflow') || entry.checks.includes('responsive-extreme')) await noOverflow(guest.page);
        if (entry.checks.includes('no-console-error') && guest.errors.length) throw new Error('console: ' + guest.errors[0]);
        return;
      }
      // Without a login gate the route must at least still render its own content cleanly.
      if (entry.checks.includes('no-console-error') && guest.errors.length) throw new Error('console: ' + guest.errors[0]);
      throw new Error('unauthenticated visitor reached ' + entry.route + ' without a login gate');
    } finally {
      await guest.browser.close();
    }
  }
  await session.page.setViewportSize({ width: entry.width, height: 1000 });
  session.errors.length = 0;
  await navigate(session.page, session.base, entry.route);
  await selectTheme(session.page, entry.theme).catch(() => {});
  await session.page.reload({ waitUntil: 'domcontentloaded' });
  await session.page.locator('#main h1, .page-heading').first().waitFor({ timeout: 20000 }).catch(async () => {
    await session.page.reload({ waitUntil: 'domcontentloaded' });
    await session.page.locator('#main h1, .page-heading').first().waitFor({ timeout: 20000 });
  });
  await session.page.waitForTimeout(300);
  if (entry.checks.includes('no-horizontal-overflow') || entry.checks.includes('responsive-extreme')) await noOverflow(session.page);
  if (entry.checks.includes('no-console-error') && session.errors.length) throw new Error('console: ' + session.errors[0]);
  await session.page.setViewportSize({ width: 1440, height: 1000 });
  await selectTheme(session.page, 'light');
}

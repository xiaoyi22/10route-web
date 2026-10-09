import { getCheckinSitePreset } from '../src/api/checkin-sites.js';
import { sendCheckin } from './checkin-client.mjs';
import { runAnyRouterBrowserCheckin } from './anyrouter-browser-checkin.mjs';

export function createCheckinRunner({ proxyUrl, browserRunner = runAnyRouterBrowserCheckin, httpRunner = account => sendCheckin(account, { proxyUrl }) } = {}) {
  return account => getCheckinSitePreset(account.baseUrl) ? browserRunner(account) : httpRunner(account);
}

import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { setTimeout as pause } from 'node:timers/promises';
const base = 'http://127.0.0.1:4339';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] });
try {
 const context = await browser.newContext();
 const env = parseEnv(await readFile('C:/Users/Administrator/.codex/credentials/10router-web.env','utf8'));
 await context.request.post(base+'/api/auth/login',{data:{password:env.TENROUTER_TEST_PASSWORD.trim()}});
 const snapshot = await (await context.request.get(base+'/api/model-availability')).json();
 const page = await context.newPage();
 await page.route('**/api/**',r=>r.request().method()!=='GET'?r.abort():new URL(r.request().url()).pathname==='/api/model-availability'?r.fulfill({json:snapshot}):r.continue());
 await page.goto(base+'/dashboard/monitor');
 const provider = page.getByLabel('可用性供应商',{exact:true});
 const status = page.getByLabel('可用性状态',{exact:true});
 await provider.selectOption('codebuddy-cn'); await status.selectOption('disabled'); await pause(500);
 await provider.selectOption(snapshot.providers.find(p=>p.name==='42x').id); await status.selectOption('');
 for(const wait of [0,100,500]) {
  await pause(wait);
  console.log(JSON.stringify({wait,url:page.url(),footer:await page.locator('.table-footer').innerText(),models:await page.locator('.availability-table tbody td:first-child > strong').allTextContents()}));
 }
} finally {await browser.close();}

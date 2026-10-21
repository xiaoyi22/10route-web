// 对比线上产物与本地构建：确认本次未提交改动是否已经发布。
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = 'http://192.168.11.150:4317';
const markers = { 'provider-model-card': 'CorePages（供应商模型卡片）', 'ModelCreditsSource': 'CorePages（积分参考区）', 'coverage-filter': 'PricingPage（完整度筛选）', 'fingerprint-groups': 'MonitorPage（指纹检测）', 'account-model-scope': 'ProvidersPage（账号模型范围）', 'sync-models': 'ProvidersPage（批量同步模型范围）' };
const index = await (await fetch(base + '/')).text();
const entry = index.match(/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0];
const bundle = await (await fetch(`${base}/${entry}`)).text();
const chunks = [...bundle.matchAll(/assets\/([A-Za-z0-9_-]+\.js)/g)].map(match => match[1]);
const unique = [...new Set(chunks)];
const deployed = {};
for (const chunk of unique) {
  const text = await (await fetch(`${base}/assets/${chunk}`)).text();
  for (const marker of Object.keys(markers)) if (text.includes(marker)) deployed[marker] = (deployed[marker] || []).concat(chunk);
}
const local = await readdir(resolve(import.meta.dirname, '../../dist/assets'));
const localText = {};
for (const file of local.filter(name => name.endsWith('.js'))) {
  const text = await readFile(resolve(import.meta.dirname, '../../dist/assets', file), 'utf8');
  for (const marker of Object.keys(markers)) if (text.includes(marker)) localText[marker] = (localText[marker] || []).concat(file);
}
for (const [marker, label] of Object.entries(markers)) console.log(label.padEnd(28), '线上:', (deployed[marker] || ['无'])[0].padEnd(32), '本地:', (localText[marker] || ['无'])[0]);
console.log('entry', entry, 'chunks', unique.length);

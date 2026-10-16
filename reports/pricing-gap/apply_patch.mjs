import { parseEnv } from 'node:util';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const base = 'http://192.168.11.150:4317';
const env = parseEnv(readFileSync('C:/Users/Administrator/.codex/credentials/10router-web.env','utf8'));
const password = env.TENROUTER_TEST_PASSWORD;
const jar = [];
const req = async (path, opts={}) => {
  const res = await fetch(base+path, {...opts, headers:{'content-type':'application/json', cookie: jar.join('; '), ...(opts.headers||{})}});
  for (const c of (res.headers.getSetCookie?.()||[])) jar.push(c.split(';')[0]);
  const text = await res.text();
  return {status: res.status, text};
};
await req('/api/auth/login',{method:'POST',body:JSON.stringify({password})});

// 1. backup current pricing BEFORE writes
const before = JSON.parse((await req('/api/pricing')).text);
const stamp = new Date().toISOString().replace(/[:.]/g,'-');
const bakDir = 'E:/10reoute-web/reports/pricing-gap/backups';
mkdirSync(bakDir, {recursive:true});
writeFileSync(resolve(bakDir, `pricing.bak-${stamp}.json`), JSON.stringify(before,null,1), {mode:0o600});
console.log('已备份修改前价目:', bakDir, `pricing.bak-${stamp}.json`);

// 2. apply patch provider by provider via PATCH /api/pricing
const patch = JSON.parse(readFileSync('patch-final.json','utf8'));
const ok=[], fail=[];
for (const [provider, models] of Object.entries(patch)) {
  const r = await req('/api/pricing', {method:'PATCH', body: JSON.stringify({[provider]: models})});
  if (r.status===200) ok.push([provider, Object.keys(models).length]);
  else fail.push([provider, r.status, r.text.slice(0,120)]);
}
console.log('\n== PATCH 结果 ==');
console.log('成功供应商:', ok.length, '条数:', ok.reduce((a,x)=>a+x[1],0));
for (const x of ok) console.log('  OK', x[0].padEnd(26), x[1]);
if (fail.length){ console.log('失败:'); for(const x of fail) console.log('  FAIL', x[0], x[1], x[2]); }

// 3. verify by re-reading
const after = JSON.parse((await req('/api/pricing')).text);
const afterTotal = Object.values(after).reduce((a,o)=>a+Object.keys(o||{}).length,0);
const afterProv = Object.keys(after).length;
console.log('\n== 回读验证 ==');
console.log('价目供应商:', before?Object.keys(before).length:'?', '->', afterProv);
console.log('价目条数:', before?Object.values(before).reduce((a,o)=>a+Object.keys(o).length,0):'?', '->', afterTotal);
// spot-check a few
const sp = ['openai/gpt-5.4','anthropic/claude-sonnet-5','gemini/gemini-3.8-flash','ocz/claude-fable-5','ag/gemini-3.8-flash'];
for (const k of sp) {
  const [p,m] = k.split('/');
  const r = after[p]?.[m];
  console.log('  check', k, r?JSON.stringify(r):'MISSING');
}

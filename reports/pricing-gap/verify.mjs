import { parseEnv } from 'node:util';
import { readFileSync, writeFileSync } from 'node:fs';
const base = 'http://192.168.11.150:4317';
const env = parseEnv(readFileSync('C:/Users/Administrator/.codex/credentials/10router-web.env','utf8'));
const jar = [];
const req = async (path, opts={}) => {
  const res = await fetch(base+path, {...opts, headers:{'content-type':'application/json', cookie: jar.join('; '), ...(opts.headers||{})}});
  for (const c of (res.headers.getSetCookie?.()||[])) jar.push(c.split(';')[0]);
  return {status: res.status, text: await res.text()};
};
await req('/api/auth/login',{method:'POST',body:JSON.stringify({password:env.TENROUTER_TEST_PASSWORD})});
const models = JSON.parse((await req('/api/models')).text).models;
const pricing = JSON.parse((await req('/api/pricing')).text);

const byProvider={};
for(const m of models) (byProvider[m.provider]=byProvider[m.provider]||[]).push(m.model);
const totalModels=models.length, totalPrice=Object.values(pricing).reduce((a,o)=>a+Object.keys(o||{}).length,0);
const pricedPer={}; for(const [p,o] of Object.entries(pricing)) pricedPer[p]=Object.keys(o||{}).length;

let missing=0, covered=0;
const missProv={};
for(const [p,ms] of Object.entries(byProvider)){
  const have=new Set(Object.keys(pricing[p]||{}));
  const miss=ms.filter(m=>!have.has(m));
  if(miss.length){missing+=miss.length; missProv[p]={total:ms.length, have:have.size, miss:miss.length, list:miss.slice(0,8)};}
  else covered++;
}
const stillZero=Object.entries(missProv).filter(([p,v])=>v.have===0).length;
const allCovered=Object.entries(missProv).filter(([p,v])=>v.have===0).reduce((a,[p,v])=>a+v.total,0);
console.log(`模型 ${totalModels} | 供应商 ${Object.keys(byProvider).length}`);
console.log(`已定价模型 ${totalPrice} | 缺失 ${missing}`);
console.log(`完全有价供应商 ${covered} | 仍然整组为零 ${stillZero} 家(${allCovered}模型)`);
console.log('\n== 仍然整组为零的供应商 TOP 30 ==');
const zeroList=Object.entries(missProv).filter(([p,v])=>v.have===0).sort((a,b)=>b[1].total-a[1].total).slice(0,30);
for(const [p,v] of zeroList) console.log(' ',p.padEnd(26), v.total, v.list.slice(0,5).join(', '));
console.log('\n== 部分缺失 TOP 15 ==');
const partList=Object.entries(missProv).filter(([p,v])=>v.have>0).sort((a,b)=>b[1].miss-a[1].miss).slice(0,15);
for(const [p,v] of partList) console.log(' ',p.padEnd(26), `${v.have}/${v.total} 缺${v.miss}`, v.list.slice(0,4).join(', '));

writeFileSync('post-verify.json', JSON.stringify({generatedAt:new Date().toISOString(), base, totalModels, totalPrice, missing, providers:Object.keys(byProvider).length, stillZero, allCovered, missProv}, null, 2));

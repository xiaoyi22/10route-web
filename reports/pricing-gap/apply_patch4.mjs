import { parseEnv } from 'node:util';
import { readFileSync, writeFileSync } from 'node:fs';
const base='http://192.168.11.150:4317';
const env=parseEnv(readFileSync('C:/Users/Administrator/.codex/credentials/10router-web.env','utf8'));
const jar=[];
const req=async(path,opts={})=>{const r=await fetch(base+path,{...opts,headers:{'content-type':'application/json',cookie:jar.join('; '),...(opts.headers||{})}});for(const c of (r.headers.getSetCookie?.()||[]))jar.push(c.split(';')[0]);return{status:r.status,text:await r.text()};};
await req('/api/auth/login',{method:'POST',body:JSON.stringify({password:env.TENROUTER_TEST_PASSWORD})});
const models=JSON.parse((await req('/api/models')).text).models;
const before=JSON.parse((await req('/api/pricing')).text);
const ts=new Date().toISOString().replace(/[:.]/g,'-');
writeFileSync('backups/pricing.bak-'+ts+'.json', JSON.stringify(before,null,1));
const raw=JSON.parse(readFileSync('patch4.json','utf8'));
const patch={};
for(const [p,o] of Object.entries(raw)) for(const [m,r] of Object.entries(o)){
  if(models.some(x=>x.provider===p && x.model===m)) (patch[p]=patch[p]||{})[m]=r;
}
const total=Object.values(patch).reduce((a,o)=>a+Object.keys(o).length,0);
console.log('待写入:', total, '条');
const ok=[],fail=[];
for(const [p,o] of Object.entries(patch)){
  const r=await req('/api/pricing',{method:'PATCH',body:JSON.stringify({[p]:o})});
  if(r.status===200) ok.push([p,Object.keys(o).length]); else fail.push([p,r.status,r.text.slice(0,140)]);
}
console.log('成功:', ok.length, '供应商 /', ok.reduce((a,x)=>a+x[1],0), '条');
if(fail.length){ console.log('失败:', JSON.stringify(fail,null,1)); }
const after=JSON.parse((await req('/api/pricing')).text);
const bT=Object.values(before).reduce((a,o)=>a+Object.keys(o).length,0);
const aT=Object.values(after).reduce((a,o)=>a+Object.keys(o).length,0);
console.log('价目条数:', bT, '->', aT, ' 供应商:', Object.keys(before).length, '->', Object.keys(after).length);
const have=new Set();
for(const [p,o] of Object.entries(after)) for(const m of Object.keys(o)) have.add(p+'/'+m);
const miss=models.filter(m=>!have.has(m.provider+'/'+m.model));
const byP={};
for(const m of miss)(byP[m.provider]=byP[m.provider]||[]).push(m.model);
console.log('剩余缺失:', miss.length, '/', models.length);
const zero=Object.entries(byP).filter(([p,v])=>v.length===models.filter(m=>m.provider===p).length);
console.log('整组为零供应商:', zero.length, zero.slice(0,15).map(x=>x[0]).join(','));
writeFileSync('post-apply4.json', JSON.stringify({generatedAt:new Date().toISOString(), before:bT, after:aT, providersBefore:Object.keys(before).length, providersAfter:Object.keys(after).length, missing:miss.length, total:models.length, patchApplied:total, fail},null,2));
// 抽验 5 条
let n=0;
for(const [p,o] of Object.entries(patch)) for(const [m,r] of Object.entries(o)){ if(n++<6){ const cur=after[p]&&after[p][m]; console.log('抽验', p+'/'+m, JSON.stringify(cur)); } }

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
const before = JSON.parse((await req('/api/pricing')).text);
const patch3 = JSON.parse(readFileSync('patch3.json','utf8'));
const ok=[],fail=[];
for(const [provider, models] of Object.entries(patch3)){
  const r = await req('/api/pricing', {method:'PATCH', body:JSON.stringify({[provider]:models})});
  if(r.status===200) ok.push([provider,Object.keys(models).length]);
  else fail.push([provider,r.status,r.text.slice(0,120)]);
}
console.log('三轮应用成功:', ok.length, '条数:', ok.reduce((a,x)=>a+x[1],0));
for(const x of ok) console.log(' OK',x[0].padEnd(18),x[1]);
if(fail.length){console.log('失败:');for(const x of fail) console.log(' FAIL',x[0],x[1],x[2]);}
const after = JSON.parse((await req('/api/pricing')).text);
const bT=Object.values(before).reduce((a,o)=>a+Object.keys(o).length,0);
const aT=Object.values(after).reduce((a,o)=>a+Object.keys(o).length,0);
console.log('\n价目条数:',bT,'->',aT);
const models = JSON.parse((await req('/api/models')).text).models;
const have=new Set();
for(const [p,o] of Object.entries(after)) for(const m of Object.keys(o)) have.add(p+'/'+m);
const miss=models.filter(m=>!have.has(m.provider+'/'+m.model));
console.log('剩余缺失:', miss.length, '/', models.length);
writeFileSync('post-apply3.json', JSON.stringify({generatedAt:new Date().toISOString(), before:bT, after:aT, missing:miss.length},null,2));

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
const have = new Set();
for (const [p,o] of Object.entries(pricing)) for (const m of Object.keys(o)) have.add(p+'/'+m);
const missing = models.filter(m=>!have.has(m.provider+'/'+m.model));
const byBare = new Map();
for (const [p,o] of Object.entries(pricing)) for (const [m,r] of Object.entries(o)) {
  const bare=m.replace(/^.*\//,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  if(!byBare.has(bare)) byBare.set(bare,r);
}
const norm=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
const patch2={};
let n1m=0,nfree=0;
for(const m of missing){
  let r=null;
  if(/\[1m\]/.test(m.model)){
    r=byBare.get(norm(m.model.replace(/\[1m\]/,'').trim()))||null;
    if(r) n1m++;
  } else if(m.model.startsWith('free/')){
    r={input:0, output:0, cached:0};
    nfree++;
  }
  if(r) (patch2[m.provider]=patch2[m.provider]||{})[m.model]=r;
}
const total=Object.values(patch2).reduce((a,o)=>a+Object.keys(o).length,0);
console.log('二轮补丁: [1m]继承', n1m, ' free归零', nfree, ' 共', total, '条');
writeFileSync('patch2.json', JSON.stringify(patch2,null,1));
let printed=0;
for(const [p,obj] of Object.entries(patch2)) for(const [m,r] of Object.entries(obj)){ if(printed++<30) console.log(' ',p.padEnd(18),m.padEnd(30),JSON.stringify(r)); }

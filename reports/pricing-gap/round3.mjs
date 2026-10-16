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

// OR index with multiple key forms
const oridx = JSON.parse(readFileSync('or-index.json','utf8'));
const orFull=new Map(), orBare=new Map(), orSuffix=new Map();
for(const [key,v] of Object.entries(oridx)){
  orFull.set(key.toLowerCase().replace(/[^a-z0-9/]/g,''), v.rates);
  const bare=key.split('/').slice(1).join('/').toLowerCase().replace(/[^a-z0-9]/g,'');
  if(!orBare.has(bare)) orBare.set(bare,v.rates);
  const suffix=bare.replace(/[^a-z0-9]/g,'');
  if(!orSuffix.has(suffix)) orSuffix.set(suffix,v.rates);
}
const norm=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');

// special handling: model IDs that include provider prefix like 'deepseek/deepseek-v4-flash-vision-exp' or 'google/gemini-3.1-flash-lite'
const patch3={};
let hit=0;
const samples=[];
for(const m of missing){
  const bare=norm(m.model);
  const hasSlash=m.model.includes('/');
  // try full OR path with gateway provider? no — OR path is OR's own provider scheme. Use bare/suffix.
  let r = orBare.get(bare) || orSuffix.get(bare);
  // Also try stripping a leading 'openai/' 'google/' 'deepseek/' provider prefix inside the model id
  if(!r && hasSlash){
    const afterSlash=m.model.split('/').slice(1).join('/');
    const b2=norm(afterSlash);
    r = orBare.get(b2) || orSuffix.get(b2);
  }
  if(r){
    hit++;
    (patch3[m.provider]=patch3[m.provider]||{})[m.model]=r;
    if(samples.length<25) samples.push([m.provider,m.model,r]);
  }
}
const total=Object.values(patch3).reduce((a,o)=>a+Object.keys(o).length,0);
console.log('三轮命中:', hit, '共', total, '条');
for(const [p,m,r] of samples) console.log(' ',p.padEnd(18),m.padEnd(40),JSON.stringify(r));
writeFileSync('patch3.json', JSON.stringify(patch3,null,1));

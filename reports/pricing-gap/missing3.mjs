import { parseEnv } from 'node:util';
import { readFileSync } from 'node:fs';
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

// Build provider-model price lookup for inheritance: match by bare model name within the SAME provider first, then globally
const byBare = new Map();
for (const [p,o] of Object.entries(pricing)) for (const [m,r] of Object.entries(o)) {
  const bare=m.replace(/^.*\//,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  if(!byBare.has(bare)) byBare.set(bare,r);
}
const norm=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');

const inherited=[];
for(const m of missing){
  let r=null;
  if(/\[1m\]/.test(m.model)){
    const base=m.model.replace(/\[1m\]/,'').trim();
    r=byBare.get(norm(base))||null;
  } else if(m.model.startsWith('free/')){
    const base=m.model.slice(5);
    r=byBare.get(norm(base))||null;
  }
  if(r) inherited.push({provider:m.provider, model:m.model, base: m.model.replace(/\[1m\]|^free\//,''), rates:r});
}
console.log('可继承:', inherited.length);
for(const x of inherited) console.log(' ', x.provider.padEnd(20), x.model.padEnd(34), '<-', x.base, JSON.stringify(x.rates));

// Also: ag provider has gemini-3.8-flash-medium/low variants; those are real gemini tier models — find via OR for gemini
const oridx = JSON.parse(require('node:fs').readFileSync('or-index.json','utf8'));
let orhits=0;
for(const m of missing){
  if(m.provider!=='ag') continue;
  const key=(m.provider+'/'+m.model).toLowerCase();
  if(oridx[key]!==undefined) { console.log('OR ag hit:', m.model, JSON.stringify(oridx[key].rates)); orhits++; }
}
console.log('OR ag hits:', orhits);

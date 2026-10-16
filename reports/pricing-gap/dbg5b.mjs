import { parseEnv } from 'node:util';
import { readFileSync } from 'node:fs';
const base='http://192.168.11.150:4317';
const env=parseEnv(readFileSync('C:/Users/Administrator/.codex/credentials/10router-web.env','utf8'));
const jar=[];
const req=async(path,opts={})=>{const r=await fetch(base+path,{...opts,headers:{'content-type':'application/json',cookie:jar.join('; '),...(opts.headers||{})}});for(const c of (r.headers.getSetCookie?.()||[]))jar.push(c.split(';')[0]);return{status:r.status,text:await r.text()};};
await req('/api/auth/login',{method:'POST',body:JSON.stringify({password:env.TENROUTER_TEST_PASSWORD})});
const models=JSON.parse((await req('/api/models')).text).models;
const pricing=JSON.parse((await req('/api/pricing')).text);
const have=new Set();
for(const [p,o] of Object.entries(pricing)) for(const m of Object.keys(o)) have.add(p+'/'+m);
const miss=models.filter(m=>!have.has(m.provider+'/'+m.model)).filter(m=>/claude-sonnet-4\.6-thinking-1m|claude-4\.5-opus|claude-4\.6-opus/.test(m.model));
console.log('相关缺失:', miss.length);
for(const m of miss) console.log(' ',m.provider,'/',m.model);
const norm=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
for(const kw of ['claude-sonnet-4.6','claude-opus-4.5','claude-4.5-opus','claude-opus-4.6','claude-sonnet-4.5']){
  const k=norm(kw);
  let found=0;
  for(const [p,o] of Object.entries(pricing)) for(const [m,r] of Object.entries(o)){ if(norm(m.split('/').pop())===k){ console.log('idx hit',kw,'=>',p,'/',m,JSON.stringify(r)); found++; } }
  if(!found) console.log('索引无', kw);
}

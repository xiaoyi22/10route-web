import { parseEnv } from 'node:util';
import { readFileSync } from 'node:fs';
const base='http://192.168.11.150:4317';
const env=parseEnv(readFileSync('C:/Users/Administrator/.codex/credentials/10router-web.env','utf8'));
const jar=[];
const req=async(path,opts={})=>{const r=await fetch(base+path,{...opts,headers:{'content-type':'application/json',cookie:jar.join('; '),...(opts.headers||{})}});for(const c of (r.headers.getSetCookie?.()||[]))jar.push(c.split(';')[0]);return{status:r.status,text:await r.text()};};
await req('/api/auth/login',{method:'POST',body:JSON.stringify({password:env.TENROUTER_TEST_PASSWORD})});
const pricing=JSON.parse((await req('/api/pricing')).text);
let n=0;
for(const [p,o] of Object.entries(pricing)) for(const [m,r] of Object.entries(o)){
  if(/embed|tts|voyage|audio/i.test(m)){ console.log(p.padEnd(20), m.padEnd(44), JSON.stringify(r)); n++; }
}
console.log('共', n, '条 embed/tts 相关现有价');

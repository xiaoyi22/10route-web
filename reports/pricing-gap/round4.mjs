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

// Group missing by kind
const kind = m => {
  const s=m.model.toLowerCase();
  if(/embed|voyage|bge/.test(s))return 'embedding';
  if(/tts|voice|neural/.test(s))return 'tts';
  if(/\[1m\]/.test(s))return '1m';
  if(/swe/.test(s))return 'swe-agent';
  if(/image|flux|sdxl|stable|dall|seedream|hailuo|kling|runway|gen4|video|recraft/.test(s))return 'image-video';
  return 'other-llm';
};
const byKind={};
for(const m of missing){const k=kind(m);(byKind[k]=byKind[k]||[]).push(m);}
console.log('剩余缺失分类:');
for(const [k,a] of Object.entries(byKind).sort((a,b)=>b[1].length-a[1].length)) console.log(' ',k.padEnd(14),a.length);
console.log('\n== embedding 清单 ==');
for(const m of (byKind.embedding||[])) console.log('  embed', m.provider.padEnd(20), m.model);
console.log('\n== tts 清单（前25） ==');
for(const m of (byKind.tts||[]).slice(0,25)) console.log('  tts', m.provider.padEnd(20), m.model);

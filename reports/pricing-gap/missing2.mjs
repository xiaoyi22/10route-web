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

// classify remaining missing
const cat = m => {
  const s = m.model.toLowerCase(), p=m.provider.toLowerCase();
  if(/\[1m\]/.test(m.model)) return '1m-variant';
  if(/^free\//.test(m.model)) return 'free-prefix';
  if(/tts|voice|neural/i.test(m.model) || /tts/.test(p) || /^-?[a-z]{2,3}(-[a-z]{2,3})?\d?$/.test(m.model)&&/tts/.test(p)) return 'tts-voice';
  if(/embed|bge|voyage/.test(m.model)) return 'embedding';
  if(/swe|agent|codex|coder/.test(m.model)) return 'code-agent';
  if(/image|flux|dall|sdxl|sd3|seedream|hailuo|kling|runway|gen4|recraft|stable|video|tts/.test(m.model)) return 'image-video';
  if(/^(auto|default|qfmodel|work|latest)$/.test(m.model)) return 'special-auto';
  return 'llm';
};
const byCat={};
for(const m of missing){ const c=cat(m); (byCat[c]=byCat[c]||[]).push(m); }
console.log('剩余缺失', missing.length);
for(const [c,arr] of Object.entries(byCat).sort((a,b)=>b[1].length-a[1].length)){
  console.log(' ', c.padEnd(14), arr.length);
  if(c==='llm') console.log('     LLM样本:', arr.slice(0,20).map(x=>x.provider+'/'+x.model).join(', '));
}

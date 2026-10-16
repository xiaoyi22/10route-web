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

const lit = JSON.parse(readFileSync('litellm-prices.json','utf8'));
const norm = s => s.toLowerCase().replace(/^[^/]+\//,'').replace(/[^a-z0-9]/g,'');
const litByNorm = new Map();
for (const [k,v] of Object.entries(lit)) {
  const n = norm(k);
  if (!litByNorm.has(n)) litByNorm.set(n, [k,v]);
}
const per1M = v => {
  const pick = (a,b) => (a!=null? a*1e6 : b!=null? b*1e6 : null);
  return { input: pick(v.input_cost_per_token, v.input_cost_per_character), output: pick(v.output_cost_per_token, v.output_cost_per_character) };
};
const kind = m => {
  const s=m.model.toLowerCase();
  if(/embed|voyage|bge/.test(s))return 'embedding';
  if(/tts|voice|neural|audio/.test(s))return 'tts';
  return 'other';
};
const rows = [];
for (const m of missing) {
  const k = kind(m);
  if (k==='other') continue;
  const nm = norm(m.model);
  const hit = litByNorm.get(nm);
  let input=null, output=null, src='litellm';
  if (hit) { const p = per1M(hit[1]); input=p.input; output=p.output; }
  // gemini TTS verified from gemini.html (current official page)
  const gtts = {
    'gemini-2.5-flash-preview-tts': {input:0.50, output:10.00},
    'gemini-2.5-pro-preview-tts': {input:1.00, output:20.00},
    'gemini-3.1-flash-tts-preview': {input:1.00, output:1.00},
  };
  if (gtts[nm]) { input=gtts[nm].input; output=gtts[nm].output; src='gemini.html'; }
  if (/free/.test(m.model.toLowerCase()) && !hit) { input=0; output=0; src='free'; }
  rows.push({provider:m.provider, model:m.model, kind:k, litKey: hit?hit[0]:null, input, output, src});
}
// print
console.log('匹配结果:');
for (const r of rows) console.log(
  (r.kind==='embedding'?'E ':'T '),
  r.provider.padEnd(18), r.model.padEnd(42),
  'in='+r.input, 'out='+r.output, 'src='+r.src, r.litKey?('<- '+r.litKey):''
);
writeFileSync('round4-rows.json', JSON.stringify(rows,null,1));
console.log('\n合计:', rows.length, '有价:', rows.filter(r=>r.input!=null||r.output!=null).length, '无源:', rows.filter(r=>r.input==null&&r.output==null).length);

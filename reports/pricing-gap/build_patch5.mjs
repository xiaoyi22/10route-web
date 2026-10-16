import { parseEnv } from 'node:util';
import { readFileSync, writeFileSync } from 'node:fs';
const base='http://192.168.11.150:4317';
const env=parseEnv(readFileSync('C:/Users/Administrator/.codex/credentials/10router-web.env','utf8'));
const jar=[];
const req=async(path,opts={})=>{const r=await fetch(base+path,{...opts,headers:{'content-type':'application/json',cookie:jar.join('; '),...(opts.headers||{})}});for(const c of (r.headers.getSetCookie?.()||[]))jar.push(c.split(';')[0]);return{status:r.status,text:await r.text()};};
await req('/api/auth/login',{method:'POST',body:JSON.stringify({password:env.TENROUTER_TEST_PASSWORD})});
const models=JSON.parse((await req('/api/models')).text).models;
const pricing=JSON.parse((await req('/api/pricing')).text);
const have=new Set();
for(const [p,o] of Object.entries(pricing)) for(const m of Object.keys(o)) have.add(p+'/'+m);
const missing=models.filter(m=>!have.has(m.provider+'/'+m.model));
const norm=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
const idx=new Map();
const add=(nm,rates,src)=>{ const k=norm(nm); if(!idx.has(k)) idx.set(k,{...rates,src}); };
for(const [p,o] of Object.entries(pricing)) for(const [m,r] of Object.entries(o)){
  add(m.split('/').pop(),{input:r.input,output:r.output,cached:r.cached??0},'gateway:'+p);
}
const or=JSON.parse(readFileSync('or-index.json','utf8'));
for(const [k,v] of Object.entries(or)){
  const r=v.rates||{};
  if(r.input==null) continue;
  add(k,{input:r.input,output:r.output??r.input,cached:r.cached??0},'openrouter');
}
const lit=JSON.parse(readFileSync('litellm-prices.json','utf8'));
for(const [k,v] of Object.entries(lit)){
  const inp=v.input_cost_per_token!=null?v.input_cost_per_token*1e6:v.input_cost_per_character!=null?v.input_cost_per_character*1e6:null;
  const outp=v.output_cost_per_token!=null?v.output_cost_per_token*1e6:v.output_cost_per_character!=null?v.output_cost_per_character*1e6:null;
  if(inp==null) continue;
  add(k.split('/').pop(),{input:inp,output:outp??inp,cached:0},'litellm');
}
console.log('官方基座索引条数:', idx.size);
const SUF=['-ultraspeed','-highspeed','-fast','-thinking-agentic','-extended-thinking','-high-thinking','-thinking','-agentic','-review','-max','-xhigh','-high','-low','-beta','-spark','-preview','-latest','-vision','-exp','-voiceclone','-voicedesign','-native-audio','-audio','-asr','-tts','-image','-live','-translate','-ultra','-extended','-code','-video','-voice','-lite','-medium'];
const MARKER=new Set(['preview','latest','exp','thinking','vision']);
const variantsOf=(name)=>{
  let s=name.split('/').pop().replace(/\[1m\]/g,'').trim();
  const out=[s];
  let t=s;
  for(const suf of SUF){ if(t.toLowerCase().endsWith(suf)){ t=t.slice(0,-suf.length); out.push(t); } }
  t=s.replace(/-\d{2}-\d{4}$/,'').replace(/-\d{6}$/,'').replace(/-\d{4}$/,'');
  if(t!==s) out.push(t);
  return [...new Set(out.map(norm))];
};
const resolved=[],unresolved=[],skippedZero=[];
for(const m of missing){
  const vs=variantsOf(m.model);
  let hit=null, baseVar=null;
  for(const v of vs){ if(idx.has(v)){ hit=idx.get(v); baseVar=v; break; } }
  if(!hit){
    // prefix-match fallback: key starts with a variant, remainder is a known marker
    for(const v of vs){
      for(const [k,x] of idx){
        if(k.startsWith(v)){ const rem=k.slice(v.length); if(rem && [...rem].every(ch=>'abcdefghijklmnopqrstuvwxyz0123456789'.includes(ch)) && MARKER.has(rem)){ hit=x; baseVar=v+'*'+k; break; } }
      }
      if(hit) break;
    }
  }
  if(!hit){ unresolved.push(m); continue; }
  const z=(hit.input==0&&hit.output==0);
  if(z && !/free|preview/i.test(m.model)){ skippedZero.push({provider:m.provider,model:m.model,base:baseVar,src:hit.src}); continue; }
  resolved.push({provider:m.provider,model:m.model,base:baseVar,rates:{input:hit.input,output:hit.output,cached:hit.cached},src:hit.src});
}
const bySrc={}; for(const r of resolved) bySrc[r.src.split(':')[0]]=(bySrc[r.src.split(':')[0]]||0)+1;
console.log('可匹配基座:', resolved.length, ' 跳过0价:', skippedZero.length, ' 无法匹配:', unresolved.length, ' | 来源:', JSON.stringify(bySrc));
const byProv={};
for(const u of unresolved)(byProv[u.provider]=byProv[u.provider]||[]).push(u.model);
console.log('\n== 无法匹配 TOP 22 ==');
for(const [p,v] of Object.entries(byProv).sort((a,b)=>b[1].length-a[1].length).slice(0,22)) console.log(' ',p.padEnd(20),v.length, v.slice(0,5).join(', '));
console.log('\n== 跳过0价示例 10 ==');
for(const s of skippedZero.slice(0,10)) console.log(' ',s.provider.padEnd(18),s.model.padEnd(40),'<-',s.base,s.src);
writeFileSync('round5-dry.json', JSON.stringify({resolved,unresolved,skippedZero},null,1));

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
const SUF=['-ultraspeed','-highspeed','-fast','-thinking-agentic','-extended-thinking','-high-thinking','-thinking','-agentic','-review','-max','-xhigh','-high','-low','-beta','-spark','-preview','-latest','-vision','-exp','-voiceclone','-voicedesign','-native-audio','-audio','-asr','-tts','-image','-live','-translate','-ultra','-extended','-code','-video','-voice','-lite','-medium','-1m','-none','-awq','-fp8','-quantized','-q4','-q8','-int4','-int8','-tf'];
const variantsOf=(name)=>{
  let s=name.split('/').pop().replace(/\[1m\]/g,'').trim();
  const out=[s];
  const cm=s.match(/^claude-(\d+(?:\.\d+)?)-(opus|sonnet|haiku)(.*)$/i);
  if(cm){ out.push('claude-'+cm[2]+'-'+cm[1]+cm[3]); }
  let t=s;
  for(const suf of SUF){ for(let pass=0;pass<3;pass++){ if(t.toLowerCase().endsWith(suf)) t=t.slice(0,-suf.length); } }
  out.push(t);
  return [...new Set(out.map(norm))];
};
const patch={},unresolved=[];
for(const m of missing){
  const vs=variantsOf(m.model);
  let hit=null,baseVar=null;
  for(const v of vs){ if(idx.has(v)){ hit=idx.get(v); baseVar=v; break; } }
  if(!hit){ unresolved.push(m); continue; }
  if(hit.input==0&&hit.output==0) continue;
  (patch[m.provider]=patch[m.provider]||{})[m.model]={input:hit.input,output:hit.output,cached:hit.cached};
}
const total=Object.values(patch).reduce((a,o)=>a+Object.keys(o).length,0);
console.log('最终补丁条数:', total);
if(total){
  for(const [p,o] of Object.entries(patch)) for(const [m,r] of Object.entries(o)) console.log('  ',p.padEnd(18),m.padEnd(44),JSON.stringify(r));
  const ts=new Date().toISOString().replace(/[:.]/g,'-');
  writeFileSync('backups/pricing.bak-'+ts+'.json', JSON.stringify(pricing,null,1));
  let okC=0;
  for(const [p,o] of Object.entries(patch)){
    const r=await req('/api/pricing',{method:'PATCH',body:JSON.stringify({[p]:o})});
    if(r.status===200) okC+=Object.keys(o).length; else console.log('FAIL',p,r.status,r.text.slice(0,100));
  }
  console.log('应用:', okC, '条');
}
const after=JSON.parse((await req('/api/pricing')).text);
const aT=Object.values(after).reduce((a,o)=>a+Object.keys(o).length,0);
const have2=new Set();
for(const [p,o] of Object.entries(after)) for(const m of Object.keys(o)) have2.add(p+'/'+m);
const miss2=models.filter(m=>!have2.has(m.provider+'/'+m.model));
console.log('最终价目:', aT, '条 /', Object.keys(after).length, '供应商; 剩余缺失:', miss2.length, '/', models.length);
const byP={};
for(const m of miss2)(byP[m.provider]=byP[m.provider]||[]).push(m.model);
const catP={tts:0,image:0,audio:0,llm:0};
for(const [p,v] of Object.entries(byP)) for(const m of v){
  const s=m.toLowerCase();
  if(/tts|voice|neural|speech|audio/.test(s)) catP.tts++;
  else if(/image|flux|sd3|stable|video|seedream|hailuo|kling|imagen|kolors|wan|qwen-image|recraft|ideogram|photo|leonardo|lucid|phoenix/.test(s)) catP.image++;
  else if(/whisper|asr|universal|nova|transcrib|nano/.test(s)) catP.audio++;
  else catP.llm++;
}
console.log('剩余缺失构成:', JSON.stringify(catP));
writeFileSync('post-apply5c.json', JSON.stringify({generatedAt:new Date().toISOString(), after:aT, providers:Object.keys(after).length, missing:miss2.length, total:models.length, applied:total||0, categories:catP},null,2));

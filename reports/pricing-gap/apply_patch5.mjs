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
const SUF=['-ultraspeed','-highspeed','-fast','-thinking-agentic','-extended-thinking','-high-thinking','-thinking','-agentic','-review','-max','-xhigh','-high','-low','-beta','-spark','-preview','-latest','-vision','-exp','-voiceclone','-voicedesign','-native-audio','-audio','-asr','-tts','-image','-live','-translate','-ultra','-extended','-code','-video','-voice','-lite','-medium','-1m','-none'];
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
const isFreeName=m=>/(^|\/)free[/-]|:free|-free|^free-/.test(m.model.toLowerCase());
const patch={},unresolved=[],skippedZero=[];
for(const m of missing){
  if(isFreeName(m)){ (patch[m.provider]=patch[m.provider]||{})[m.model]={input:0,output:0,cached:0}; continue; }
  const vs=variantsOf(m.model);
  let hit=null, baseVar=null;
  for(const v of vs){ if(idx.has(v)){ hit=idx.get(v); baseVar=v; break; } }
  if(!hit){
    for(const v of vs){
      for(const [k,x] of idx){
        if(k.startsWith(v)){ const rem=k.slice(v.length); if(rem && MARKER.has(rem)){ hit=x; baseVar=v+'*'+k; break; } }
      }
      if(hit) break;
    }
  }
  if(!hit){ unresolved.push(m); continue; }
  if(hit.input==0&&hit.output==0){ skippedZero.push({provider:m.provider,model:m.model,base:baseVar,src:hit.src}); continue; }
  (patch[m.provider]=patch[m.provider]||{})[m.model]={input:hit.input,output:hit.output,cached:hit.cached};
}
const total=Object.values(patch).reduce((a,o)=>a+Object.keys(o).length,0);
let ok=0,missingKey=[];
for(const [p,o] of Object.entries(patch)) for(const m of Object.keys(o)){
  if(models.some(x=>x.provider===p&&x.model===m)) ok++; else missingKey.push(p+'/'+m);
}
for(const k of missingKey){ const [p,m]=k.split('/'); delete patch[p][m]; if(!Object.keys(patch[p]).length) delete patch[p]; }
console.log('补丁:', total, '条, 命中模型:', ok, ' 过滤不存在:', missingKey.length, ' 跳过0价:', skippedZero.length, ' 无法匹配:', unresolved.length);
writeFileSync('patch5.json', JSON.stringify(patch,null,1));
const ts=new Date().toISOString().replace(/[:.]/g,'-');
writeFileSync('backups/pricing.bak-'+ts+'.json', JSON.stringify(pricing,null,1));
const ok2=[],fail=[];
for(const [p,o] of Object.entries(patch)){
  const r=await req('/api/pricing',{method:'PATCH',body:JSON.stringify({[p]:o})});
  if(r.status===200) ok2.push([p,Object.keys(o).length]); else fail.push([p,r.status,r.text.slice(0,140)]);
}
console.log('应用成功:', ok2.length, '供应商 /', ok2.reduce((a,x)=>a+x[1],0), '条');
if(fail.length) console.log('失败:', JSON.stringify(fail,null,1));
const after=JSON.parse((await req('/api/pricing')).text);
const bT=Object.values(pricing).reduce((a,o)=>a+Object.keys(o).length,0);
const aT=Object.values(after).reduce((a,o)=>a+Object.keys(o).length,0);
console.log('价目条数:', bT, '->', aT, ' 供应商:', Object.keys(pricing).length, '->', Object.keys(after).length);
const have2=new Set();
for(const [p,o] of Object.entries(after)) for(const m of Object.keys(o)) have2.add(p+'/'+m);
const miss2=models.filter(m=>!have2.has(m.provider+'/'+m.model));
const byP={}; for(const m of miss2)(byP[m.provider]=byP[m.provider]||[]).push(m.model);
const zero=Object.entries(byP).filter(([p,v])=>v.length===models.filter(m=>m.provider===p).length);
console.log('剩余缺失:', miss2.length, '/', models.length, ' 整组为零:', zero.length);
writeFileSync('post-apply5.json', JSON.stringify({generatedAt:new Date().toISOString(), before:bT, after:aT, missing:miss2.length, total:models.length, patchApplied:total, skippedZero:skippedZero.length, unresolved:unresolved.length},null,2));
console.log('\n== 无法匹配剩余 TOP 20 ==');
for(const [p,v] of Object.entries(byP).sort((a,b)=>b[1].length-a[1].length).slice(0,20)) console.log(' ',p.padEnd(20),v.length, v.slice(0,5).join(', '));

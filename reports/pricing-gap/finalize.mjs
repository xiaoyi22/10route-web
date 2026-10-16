import { readFileSync, writeFileSync } from 'node:fs';
const rd=f=>{let s=readFileSync(f,'utf8');if(s.charCodeAt(0)===0xFEFF)s=s.slice(1);return JSON.parse(s);};
const models=rd('base-models.json');
const pricing=rd('base-pricing.json');
const oridx=rd('or-index.json');
const patch=rd('patch.json');

// filter invalid entries
let removed=0;
for(const [prov,obj] of Object.entries(patch)){
  for(const [model,r] of Object.entries(obj)){
    const bad = Object.values(r).some(v=>!Number.isFinite(v)||v<0) || (!(r.input>0)&&!(r.output>0));
    if(bad){ delete obj[model]; removed++; }
  }
  if(!Object.keys(obj).length) delete patch[prov];
}
console.log('剔除异常条目:', removed);
console.log('最终 patch:', Object.keys(patch).length, '供应商', Object.values(patch).reduce((a,o)=>a+Object.keys(o).length,0), '条');

// classification by model-kind for the report
const kindOf=(m)=>{
  const s=m.model.toLowerCase();
  if(/tts|voice|af|ar|bg|bn|zh|en-us/i.test(s)&&/tts/.test(m.provider))return 'tts-voice';
  if(/embed/i.test(s)||m.provider.includes('embed'))return 'embedding';
  if(/swe-|swe\b/.test(s))return 'code-agent';
  if(/image|flux|sdxl|dall-e|gpt-5.4-image|seedream|hailuo|kling|runway|gen4/.test(s))return 'image';
  if(m.provider==='google-tts'||m.provider==='gemini-tts-voices'||m.provider==='openai-tts-voices'||m.provider==='openrouter-tts-voices'||m.provider==='edge-tts')return 'tts-voice';
  return 'llm';
};
// Count covered vs still-none by kind
const byKind={covered:{},none:{}};
const modelHash=new Set();
for(const [prov,obj] of Object.entries(patch)) for(const m of Object.keys(obj)) modelHash.add(prov+'/'+m);
for(const m of models){
  const k=kindOf(m);
  const has=modelHash.has(m.provider+'/'+m.model);
  const cat=has?'covered':'none';
  byKind[cat][k]=(byKind[cat][k]||0)+1;
}
console.log('\n== 覆盖 vs 无来源 按模型类型 ==');
console.log('已覆盖(含已有价):', byKind.covered);
console.log('仍未覆盖:', byKind.none);

// write final patch + report
writeFileSync('patch-final.json', JSON.stringify(patch,null,1));

// provider-level report
const lines=['# 模型价格补齐补丁（待审）','',`生成时间: ${new Date().toISOString()}`, `数据源: 复用网关已有价目 + OpenRouter 官方公开价目`, '', '## 汇总', '', '| 指标 | 数值 |','|---|---|',`| 待补模型 | 1230 |`,`| 本次可补 | ${Object.values(patch).reduce((a,o)=>a+Object.keys(o).length,0)} |`,`| 仍无来源 | ${byKind.none.llm||0} LLM / ${Object.entries(byKind.none).reduce((a,[k,v])=>a+(k==='llm'?0:v),0)} 非LLM |`, '', '## 按供应商本次补充', '', '| 供应商 | 本次补 | 示例 |','|---|---|---|'];
for(const [prov,obj] of Object.entries(patch)){
  const ks=Object.keys(obj);
  lines.push(`| ${prov} | ${ks.length} | ${ks.slice(0,3).join('; ')}${ks.length>3?'...':''} |`);
}
lines.push('');
writeFileSync('补丁报告.md', lines.join('\n'));
console.log('\n已写 patch-final.json 与 补丁报告.md');

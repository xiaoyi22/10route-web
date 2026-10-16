const fs=require('fs');
const lit=JSON.parse(fs.readFileSync('litellm-prices.json','utf8'));
const keys=['openai/text-embedding-3-large','openai/text-embedding-3-small','openai/text-embedding-ada-002','openai/tts-1','openai/tts-1-hd','openai/gpt-4o-mini-tts','azure/tts-1-hd','azure/gpt-4o-mini-tts','voyage/voyage-3-large','voyage/voyage-3.5','voyage/voyage-3.5-lite','voyage/voyage-code-3','voyage/voyage-finance-2','voyage/voyage-law-2','voyage/voyage-multilingual-2','gemini/gemini-embedding-2-preview','gemini/gemini-embedding-001','gemini/text-embedding-004','gemini/text-embedding-005','mistral/mistral-embed','perplexity/pplx-embed-v1-4b','perplexity/pplx-embed-v1-0.6b','llamagate/qwen3-embedding-8b','gemini/gemini-3.1-flash-tts-preview','gemini/gemini-2.5-flash-preview-tts','gemini/gemini-2.5-pro-preview-tts'];
for(const k of keys){
  const v=lit[k];
  if(!v){ console.log(k,'=> ABSENT'); continue; }
  const inp = v.input_cost_per_token!=null? v.input_cost_per_token*1e6 : v.input_cost_per_character!=null? v.input_cost_per_character*1e6 : null;
  const outp = v.output_cost_per_token!=null? v.output_cost_per_token*1e6 : v.output_cost_per_character!=null? v.output_cost_per_character*1e6 : null;
  console.log(k.padEnd(42),'in='+inp,'out='+outp,'| src='+(v.source||'-'),'| prov='+(v.litellm_provider||'-'));
}
console.log('\n--- gemini.html gemini-3.1-flash-tts-preview 区块 ---');
const h=fs.readFileSync('gemini.html','utf8');
let i=h.indexOf('gemini-3.1-flash-tts-preview');
if(i>0){ const seg=h.slice(i-200, i+2500); const txt=seg.replace(/<[^>]+>/g,' ').replace(/\s+/g,' '); console.log(txt.slice(0,900)); }

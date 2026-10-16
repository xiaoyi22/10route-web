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

// verified price table: provider/model -> {in,out} per 1M USD (cached=0)
const E=(inp)=>({input:inp,output:0,cached:0});
const T=(i,o)=>({input:i,output:o,cached:0});
const patch={};
const put=(p,m,r)=>{ (patch[p]=patch[p]||{})[m]=r; };
// embeddings — sources: gemini.html paid tier / litellm(vertex,ai.google.dev) / voyage docs / perplexity docs / OpenAI 目录价
put('gemini','gemini-embedding-2-preview',E(0.20));
put('gemini','gemini-embedding-001',E(0.15));
put('gemini','text-embedding-004',E(0.10));
put('gemini','text-embedding-005',E(0.10));
for(const p of ['openai','gh','venice','openrouter']) for(const m of ['text-embedding-3-large','text-embedding-3-small','text-embedding-ada-002']){
  const v={ 'text-embedding-3-large':0.13, 'text-embedding-3-small':0.02, 'text-embedding-ada-002':0.10 }[m];
  put(p,p==='openrouter'?('openai/'+m):m,E(v));
}
put('mistral','mistral-embed',E(0.10));
put('nebius','Qwen/Qwen3-Embedding-8B',E(0.02));
put('openrouter','qwen/qwen3-embedding-8b',E(0.02));
put('openrouter','perplexity/pplx-embed-v1-4b',E(0.03));
put('openrouter','perplexity/pplx-embed-v1-0.6b',E(0.004));
put('openrouter','nvidia/llama-nemotron-embed-vl-1b-v2:free',E(0));
put('voyage-ai','voyage-3-large',E(0.18));
put('voyage-ai','voyage-3.5',E(0.06));
put('voyage-ai','voyage-3.5-lite',E(0.02));
put('voyage-ai','voyage-code-3',E(0.12));
put('voyage-ai','voyage-finance-2',E(0.12));
put('voyage-ai','voyage-law-2',E(0.12));
put('voyage-ai','voyage-multilingual-2',E(0.12));
// TTS — gemini.html paid tier; OpenAI 目录价 (tts-1 15 / tts-1-hd 30 / gpt-4o-mini-tts 0.6)
put('gemini','gemini-3.1-flash-tts-preview',T(1,20));
put('gemini','gemini-2.5-flash-preview-tts',T(0.5,10));
put('gemini','gemini-2.5-pro-preview-tts',T(1,20));
for(const p of ['openai','openai-tts-models','openrouter','openrouter-tts-models']){
  const m0 = p.startsWith('openrouter') ? 'openai/tts-1' : 'tts-1';
  const m1 = p.startsWith('openrouter') ? 'openai/tts-1-hd' : 'tts-1-hd';
  const m2 = p.startsWith('openrouter') ? 'openai/gpt-4o-mini-tts' : 'gpt-4o-mini-tts';
  put(p,m0,T(15,15));
  put(p,m1,T(30,30));
  put(p,m2,T(0.6,0.6));
}
for(const m of ['gemini-3.1-flash-tts-preview','gemini-2.5-flash-preview-tts','gemini-2.5-pro-preview-tts']){
  put('gemini-tts-models',m, m==='gemini-3.1-flash-tts-preview'?T(1,20): m==='gemini-2.5-flash-preview-tts'?T(0.5,10):T(1,20));
}
// validate against live models
const total=Object.values(patch).reduce((a,o)=>a+Object.keys(o).length,0);
let ok=0, missingKey=[];
for(const [p,o] of Object.entries(patch)) for(const m of Object.keys(o)){
  if(models.some(x=>x.provider===p && x.model===m)) ok++;
  else missingKey.push(p+'/'+m);
}
console.log('补丁条数:', total, ' 命中真实模型:', ok, ' 未命中:', missingKey.length);
if(missingKey.length) console.log('未命中:', missingKey.join(', '));
writeFileSync('patch4.json', JSON.stringify(patch,null,1));
// print review
for(const [p,o] of Object.entries(patch)) for(const [m,r] of Object.entries(o)) console.log('  ',p.padEnd(22),m.padEnd(46),JSON.stringify(r));

const ids=['openai/text-embedding-3-large','openai/text-embedding-3-small','openai/text-embedding-ada-002','openai/tts-1','openai/tts-1-hd','openai/gpt-4o-mini-tts'];
for(const id of ids){
  const url='https://openrouter.ai/api/v1/models/'+id;
  try{
    const r=await fetch(url,{signal:AbortSignal.timeout(30000)});
    const j=await r.json();
    const d=j.data||j;
    const p=d.pricing||{};
    console.log(id.padEnd(36),'HTTP '+r.status,'in='+p.prompt,'out='+p.completion, d.name||'');
  }catch(e){ console.log(id.padEnd(36),'ERR',e.message); }
}

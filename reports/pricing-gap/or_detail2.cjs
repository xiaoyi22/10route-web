const { execFileSync } = require('child_process');
const ids=['openai/text-embedding-3-large','openai/text-embedding-3-small','openai/text-embedding-ada-002','openai/tts-1','openai/tts-1-hd','openai/gpt-4o-mini-tts'];
for(const id of ids){
  try{
    const url='https://openrouter.ai/api/v1/models/'+id;
    const out=execFileSync('curl.exe',['-s','-m','40','-x','http://192.168.11.150:7890',url],{encoding:'utf8',maxBuffer:10*1024*1024});
    let j; try{ j=JSON.parse(out); }catch(e){ console.log(id.padEnd(36),'PARSE-FAIL', out.slice(0,120)); continue; }
    const d=j.data||j;
    const p=d.pricing||{};
    console.log(id.padEnd(36),'in='+p.prompt,'out='+p.completion, (d.name||'').slice(0,30));
  }catch(e){ console.log(id.padEnd(36),'ERR', e.message.slice(0,100)); }
}

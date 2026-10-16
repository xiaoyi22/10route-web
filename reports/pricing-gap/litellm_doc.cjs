const fs=require('fs');
const h=fs.readFileSync('litellm-openai-doc.html','utf8');
for(const kw of ['text-embedding-3-large','text-embedding-3-small','ada-002','tts-1','tts-1-hd','gpt-4o-mini-tts']){
  const i=h.indexOf(kw);
  console.log('== '+kw+' @'+i);
  if(i>0){ console.log(h.slice(Math.max(0,i-120), i+260).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,380)); }
}

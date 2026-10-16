const fs=require('fs');
const h=fs.readFileSync('wa-openai.html','utf8');
for(const kw of ['text-embedding-3-large','text-embedding-3-small','ada-002','tts-1-hd','gpt-4o-mini-tts','tts-1']){
  const re=new RegExp(kw,'g'); let n=0; h.replace(re,()=>n++); console.log(kw, 'hits:', n);
}
// try to find price objects: look for JSON blobs with model names
let i=h.indexOf('text-embedding-3-large');
console.log('---context around text-embedding-3-large---');
console.log(h.slice(Math.max(0,i-500), i+400).replace(/\s+/g,' '));

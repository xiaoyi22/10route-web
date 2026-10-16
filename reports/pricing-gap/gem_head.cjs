const fs=require('fs');
const h=fs.readFileSync('gemini.html','utf8');
let i=h.indexOf('id="gemini-embedding-2"');
// find table start before the rows we saw
let tStart=h.lastIndexOf('<table', i);
let tEnd=h.indexOf('</table>', i);
const tbl=h.slice(tStart, tEnd+8);
const txt=tbl.replace(/<[^>]+>/g,'|').replace(/\|+/g,'|').replace(/\s+/g,' ').trim();
console.log('TABLE-HEAD:', txt.slice(0,400));
console.log('\n--- text-embedding 区块标题 ---');
for(const id of ['text-embedding-004','text-embedding-005','gemini-embedding-001','text-embedding-002','embedding-001']){
  const j=h.indexOf('id="'+id+'"');
  if(j>0){ const seg=h.slice(j, j+700).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(); console.log('>>',id,':',seg.slice(0,180)); }
  else console.log('>>',id,': no section');
}

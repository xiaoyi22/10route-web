const fs=require('fs');
const lit=JSON.parse(fs.readFileSync('litellm-prices.json','utf8'));
for(const [k,v] of Object.entries(lit)){
  if(/embedding-004|embedding-005|embedding-001|gemini-embedding/.test(k)){
    const in_=v.input_cost_per_token!=null?v.input_cost_per_token*1e6:null;
    console.log(k.padEnd(46),'in='+in_,'src='+(v.source||'-'));
  }
}
console.log('--- reste ---');
const h=fs.readFileSync('gemini.html','utf8');
// embedding 2 section table
let i=h.indexOf('id="gemini-embedding-2"');
const seg=h.slice(i, i+6000);
const rows=seg.split('<tr>');
for(const r of rows.slice(1,10)){
  const cells=[...r.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m=>m[1].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()).filter(x=>x);
  if(cells.length) console.log(' | '+cells.slice(0,6).join(' | '));
}

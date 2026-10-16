const fs=require('fs');
const h=fs.readFileSync('voyage-docs.html','utf8');
for(const nm of ['voyage-3-large','voyage-3.5','voyage-3.5-lite','voyage-code-3','voyage-finance-2','voyage-law-2','voyage-multilingual-2']){
  const i=h.indexOf(nm);
  if(i<0){ console.log(nm,'NOT FOUND'); continue; }
  const seg=h.slice(i, i+1800);
  const nums=[...seg.matchAll(/\$(\d+(?:\.\d+)?)\s*\/\s*1M/g)].map(m=>m[0]);
  const raw=[...seg.matchAll(/\$(\d+(?:\.\d+)?)/g)].map(m=>m[1]).slice(0,6);
  console.log(nm.padEnd(26),'per-1M:',JSON.stringify(nums),'raw$:',JSON.stringify(raw));
}

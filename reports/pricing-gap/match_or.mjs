import { readFileSync } from 'node:fs';
const rd=f=>{let s=readFileSync(f,'utf8');if(s.charCodeAt(0)===0xFEFF)s=s.slice(1);return JSON.parse(s);};
const models=rd('base-models.json');
const pricing=rd('base-pricing.json');
const oridx=rd('or-index.json');

// Existing price model-name index (from tokenrouter etc, normalized WITHOUT provider prefix)
const existing=new Map();
for(const [prov,obj] of Object.entries(pricing)) for(const [k,v] of Object.entries(obj)){
  for(const key of [k, k.split('/').slice(1).join('/')]) existing.set(key.toLowerCase().replace(/[^a-z0-9]/g,''), v);
}
// OpenRouter index normalized both full path and bare model
const orFull=new Map(), orBare=new Map();
for(const [key,v] of Object.entries(oridx)){
  orFull.set(key.toLowerCase().replace(/[^a-z0-9/]/g,''), v.rates);
  const bare=key.split('/').slice(1).join('/').toLowerCase().replace(/[^a-z0-9]/g,'');
  if(!orBare.has(bare)) orBare.set(bare, v.rates);
}
const norm=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');

let usedExisting=0, usedOR=0, none=0;
const stats={byProvider:{}};
const rows=[];
for(const m of models){
  const bare=norm(m.model);
  const full=(m.provider+'/'+m.model).toLowerCase().replace(/[^a-z0-9/]/g,'');
  let source;
  if(existing.has(bare)){source='existing';usedExisting++;}
  else if(orFull.has(full)){source='or-full';usedOR++;}
  else if(orBare.has(bare)){source='or-bare';usedOR++;}
  else {source='none';none++;}
  (stats.byProvider[m.provider]=stats.byProvider[m.provider]||{})[source]=(stats.byProvider[m.provider][source]||0)+1;
  rows.push({provider:m.provider, model:m.model, name:m.name, source});
}
console.log('existing覆盖:', usedExisting, 'OR覆盖:', usedOR, '无来源:', none, ' 共', rows.length);

// Providers where OR covers a decent chunk but existing doesn't
console.log('\n== 按供应商来源分布（前40） ==');
const ps=Object.entries(stats.byProvider).sort((a,b)=>((b[1].none||0))-((a[1].none||0)));
for(const [p,s] of ps){
  const ex=s.existing||0, or=s['or-full']||0, orb=s['or-bare']||0, no=s.none||0;
  if(ex+or+orb+no>=3) console.log(' ',p.padEnd(22),`e${ex} or${or+orb} n${no}`);
}

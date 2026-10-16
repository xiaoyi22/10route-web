import { readFileSync, writeFileSync } from 'node:fs';
const rd=f=>{let s=readFileSync(f,'utf8');if(s.charCodeAt(0)===0xFEFF)s=s.slice(1);return JSON.parse(s);};
const models=rd('base-models.json');
const pricing=rd('base-pricing.json');
const oridx=rd('or-index.json');

// existing normalized model-name -> rates (from tokenrouter and all current pricing)
const existing=new Map();
for(const [prov,obj] of Object.entries(pricing)) for(const [k,v] of Object.entries(obj)){
  for(const key of [k, k.split('/').slice(1).join('/')]) existing.set(key.toLowerCase().replace(/[^a-z0-9]/g,''), v);
}
const orFull=new Map(), orBare=new Map();
for(const [key,v] of Object.entries(oridx)){
  orFull.set(key.toLowerCase().replace(/[^a-z0-9/]/g,''), v.rates);
  const bare=key.split('/').slice(1).join('/').toLowerCase().replace(/[^a-z0-9]/g,'');
  if(!orBare.has(bare)) orBare.set(bare, v.rates);
}
const norm=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');

// Build patch: {provider: {model: rates}}
const patch={};
const sources={existing:0,'or-full':0,'or-bare':0,none:0};
const samples={existing:[],'or-full':[],'or-bare':[]};
for(const m of models){
  const bare=norm(m.model);
  const full=(m.provider+'/'+m.model).toLowerCase().replace(/[^a-z0-9/]/g,'');
  let rates, source;
  if(existing.has(bare)){rates=existing.get(bare);source='existing';}
  else if(orFull.has(full)){rates=orFull.get(full);source='or-full';}
  else if(orBare.has(bare)){rates=orBare.get(bare);source='or-bare';}
  else {sources.none++;continue;}
  // skip if this provider/model already has its own price
  if(pricing[m.provider]?.[m.model]) continue;
  sources[source]++;
  (patch[m.provider]=patch[m.provider]||{})[m.model]=rates;
  const s=samples[source];
  if(s.length<12) s.push({provider:m.provider, model:m.model, rates, from: source==='existing'?'existing-index': full});
}
console.log('source totals:', sources);
console.log('patch providers:', Object.keys(patch).length, 'patch entries:', Object.values(patch).reduce((a,o)=>a+Object.keys(o).length,0));
console.log('\n== existing 复用抽样 ==');
for(const x of samples.existing) console.log(' ', x.provider.padEnd(22), x.model.padEnd(38), '->', JSON.stringify(x.rates));
console.log('\n== or-full 抽样 ==');
for(const x of samples['or-full']) console.log(' ', x.provider.padEnd(22), x.model.padEnd(38), '->', JSON.stringify(x.rates));
console.log('\n== or-bare 抽样 ==');
for(const x of samples['or-bare']) console.log(' ', x.provider.padEnd(22), x.model.padEnd(38), '->', JSON.stringify(x.rates));
writeFileSync('patch.json', JSON.stringify(patch,null,1));
console.log('\n已写 patch.json');

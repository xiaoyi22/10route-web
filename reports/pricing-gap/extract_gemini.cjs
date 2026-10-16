const h = require('fs').readFileSync('gemini.html','utf8');
const names = ['gemini-embedding-2','gemini-embedding-001','text-embedding-004','text-embedding-005','embedding-001','gemini-3.1-flash-tts-preview','gemini-2.5-flash-preview-tts','gemini-2.5-pro-preview-tts','gemini-3.8-flash-tts','gemini-3.8-flash-lite-tts','gemini-3.1-flash-lite-image'];
for (const nm of names) {
  let i = h.indexOf('>'+nm+'<');
  if (i < 0) i = h.indexOf('translate="no" dir="ltr">'+nm);
  if (i < 0) { console.log('== '+nm+': NOT FOUND'); continue; }
  const seg = h.slice(i, i+4000);
  const dollar = [...seg.matchAll(/\$(\d+(?:\.\d+)?)\s*\/\s*(1M|1m|million|M|1,000,000)/g)].map(m=>m[0]);
  const rawp = [...seg.matchAll(/\$(\d+(?:\.\d+)?)/g)].map(m=>m[1]).slice(0,12);
  console.log('== '+nm+'  per-1M:', JSON.stringify(dollar), ' raw$:', JSON.stringify(rawp));
}

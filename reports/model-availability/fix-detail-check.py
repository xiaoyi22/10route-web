from pathlib import Path
p=Path('/home/meet/10router/deploy.sh')
s=p.read_text()
a='src/lib/usageDb.js:await observeBusinessDetail(detail):1'
assert s.count(a)==1
p.write_text(s.replace(a,'src/lib/usageDb.js:await observeBusinessDetail(recorded):1'))

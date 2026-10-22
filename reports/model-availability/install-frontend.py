from pathlib import Path
import json,hashlib,tarfile,shutil,datetime
root=Path('/home/meet/10router-web')
stage=Path('/tmp/availability-frontend-stage')
manifest=json.loads((stage/'manifest.json').read_text())
def digest(text): return hashlib.sha256(text.replace('\r\n','\n').encode()).hexdigest()
for entry in manifest['existing']:
    assert digest((root/entry['file']).read_text())==entry['before'], 'Source changed: '+entry['file']
provider=root/'src/pages/ProvidersPage.jsx'
s=provider.read_text()
for before,after in manifest['providerOperations']:
    assert s.count(before)==1, 'Provider anchor changed: '+before[:50]
    s=s.replace(before,after)
stamp=datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
backup=Path('/home/meet/backups/10router-web')/('availability-source-'+stamp)
backup.mkdir(parents=True)
with tarfile.open(backup/'source-before.tar.gz','w:gz') as archive:
    for file in [*[e['file'] for e in manifest['existing']], 'src/pages/ProvidersPage.jsx']:
        archive.add(root/file,arcname=file)
for file in [*[e['file'] for e in manifest['existing']],*manifest['added']]:
    target=root/file
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(stage/file,target)
provider.write_text(s)
print('BACKUP='+str(backup))

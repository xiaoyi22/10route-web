import pathlib,json,hashlib,subprocess,sqlite3,shutil,tarfile,datetime,os,time,urllib.request,fcntl,sys
m=json.load(open('/tmp/10router-codex-rescue-current.json')); p=pathlib.Path(m['root']); r=pathlib.Path(m['rescue'])
manifest=json.load(open(r/'rescue-reports/delivery/manifest.json'))
lock=open('/tmp/10router-reviewed-artifact.lock','w'); fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
def sha(f): return hashlib.sha256(f.read_bytes()).hexdigest() if f.exists() else None
def run(args,cwd=None): return subprocess.check_output(args,cwd=cwd,text=True,stderr=subprocess.STDOUT)
def say(x): print(x,flush=True)
assert run(['git','rev-parse','HEAD'],p).strip()==manifest['baseHead']
for f in manifest['files']:
 assert sha(p/f['path'])==f['baseSha256'], 'Production drift: '+f['path']
 assert sha(r/f['path'])==f['sha256'], 'Candidate drift: '+f['path']
checks=json.load(open(r/'rescue-reports/patch-checks.json'))['checks'][:69]
assert len(checks)==69 and all(c['passed'] for c in checks)
comparison=json.load(open(r/'rescue-reports/release-comparison.json'))
assert len(comparison['regressions'])==0
assert json.load(open(r/'rescue-reports/http-e2e-final.json'))['passed']
assert (r/'.next/standalone/public').is_dir() and (r/'.next/standalone/.next/static').is_dir()
assert not list((r/'.next/standalone').glob('.env*'))
stamp=datetime.datetime.now().strftime('%Y%m%d-%H%M%S'); b=pathlib.Path('/home/meet/backups/10router')/('codex-deploy-'+stamp)
b.mkdir(mode=0o700); (b/'sources').mkdir(); (b/'absent.json').write_text(json.dumps([f['path'] for f in manifest['files'] if not (p/f['path']).exists()]))
for f in manifest['files']:
 src=p/f['path']
 if src.exists():
  dst=b/'sources'/f['path']; dst.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(src,dst)
shutil.copy2(p/'.env',b/('.env.bak-'+stamp))
shutil.copy2(r/'rescue-reports/delivery/manifest.json',b/'manifest.json')
(b/'working-tree.patch').write_text(run(['git','diff','HEAD'],p)); (b/'status.txt').write_text(run(['git','status','--short'],p))
srcdb=sqlite3.connect('file:/home/meet/.10router/db/data.sqlite?mode=ro',uri=True); dstdb=sqlite3.connect(b/'data.sqlite'); srcdb.backup(dstdb); dstdb.close(); srcdb.close()
exceptions={'authorizedBy':'User: deploy now, after prior disclosed audit','historicalPatchChecksUnmatched':22,'remainingAssertionFailures':35,'suiteLoadFailures':2,'baselineDifference':'One renamed speed test; inventory left unchanged','newPatchChecksPassed':69,'newAssertionRegressions':0,'method':'Install verified packaged build; deploy.sh not executed and no checks removed'}
(b/'release-exceptions.json').write_text(json.dumps(exceptions,indent=2))
# Package the exact previously built artifact, never rebuild under a released version.
archive=b/'runtime-1.4.1-test.1.tar.gz'
say('BACKUP_READY '+str(b))
with tarfile.open(archive,'w:gz',compresslevel=1,dereference=True) as t:
 def filtered(info):
  if info.name=='.next/cache' or info.name.startswith('.next/cache/'): return None
  return info
 t.add(r/'.next',arcname='.next',filter=filtered)
say('PACKAGE_READY '+str(archive.stat().st_size))
stage=p/('.next-incoming-'+stamp); stage.mkdir()
with tarfile.open(archive) as t: t.extractall(stage,filter='data')
incoming=stage/'.next'; shutil.copy2(p/'.next/standalone/.env',incoming/'standalone/.env')
assert sha(incoming/'standalone/custom-server.js')==sha(p/'custom-server.js')
assert (incoming/'BUILD_ID').read_text()==(r/'.next/BUILD_ID').read_text()
record={'backup':str(b),'root':str(p),'rescue':str(r),'buildId':(incoming/'BUILD_ID').read_text().strip(),'version':'1.4.1-test.1','archiveSha256':sha(archive),'previousPid':run(['systemctl','--user','show','10router.service','-p','MainPID','--value']).strip(),'state':'prepared','startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
(b/'deployment.json').write_text(json.dumps(record,indent=2)); pathlib.Path('/tmp/10router-codex-deployment-current.json').write_text(json.dumps(record))
rollback=b/'rollback.py'
rollback.write_text("""import pathlib,json,shutil,subprocess,sys
b=pathlib.Path(__file__).resolve().parent; d=json.load(open(b/'deployment.json')); p=pathlib.Path(d['root'])
subprocess.run(['systemctl','--user','stop','10router.service'],check=True)
if (b/'old.next').exists():
 if (p/'.next').exists(): (p/'.next').rename(b/'failed.next')
 (b/'old.next').rename(p/'.next')
for f in json.load(open(b/'manifest.json'))['files']:
 dst=p/f['path']; src=b/'sources'/f['path']
 if src.exists(): dst.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(src,dst)
 elif dst.exists(): dst.unlink()
subprocess.run(['systemctl','--user','start','10router.service'],check=True)
d['state']='rolled-back'; (b/'deployment.json').write_text(json.dumps(d,indent=2)); print('ROLLBACK_DONE',str(b))
""")
try:
 subprocess.run(['systemctl','--user','stop','10router.service'],check=True)
 (p/'.next').rename(b/'old.next'); incoming.rename(p/'.next'); stage.rmdir()
 # Overlay only the reviewed file list, preserving all unrelated working files.
 for f in manifest['files']:
  dst=p/f['path']; dst.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(r/f['path'],dst)
  assert sha(dst)==f['sha256']
 subprocess.run(['systemctl','--user','start','10router.service'],check=True)
 # Readiness polling observes startup, it never reissues a failed deployment.
 healthy=False
 for i in range(20):
  try:
   with urllib.request.urlopen('http://127.0.0.1:20128/v1/models',timeout=3) as response:
    payload=json.load(response); healthy=response.status==200 and isinstance(payload,dict)
   if healthy: break
  except Exception: pass
  time.sleep(2)
 assert healthy,'Readiness HTTP/JSON failed'
 record['state']='deployed-awaiting-browser'; record['pid']=run(['systemctl','--user','show','10router.service','-p','MainPID','--value']).strip(); record['http']=200
 (b/'deployment.json').write_text(json.dumps(record,indent=2)); pathlib.Path('/tmp/10router-codex-deployment-current.json').write_text(json.dumps(record))
 say(json.dumps(record))
except BaseException:
 say('DEPLOY_FAILED_RESTORING'); subprocess.run(['python3',str(rollback)],check=True); raise

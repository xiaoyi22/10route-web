import pathlib,json,subprocess,shutil,hashlib,fcntl,urllib.request,time,datetime
b=pathlib.Path('/home/meet/backups/10router/codex-deploy-20261015-102952'); d=json.load(open(b/'deployment.json')); p=pathlib.Path(d['root']); r=pathlib.Path(d['rescue']); man=json.load(open(b/'manifest.json'))
lock=open('/tmp/10router-reviewed-artifact.lock','w'); fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
assert d['state']=='rolled-back'
baseline=json.load(open(r/'rescue-reports/production-v1-models-baseline.json')); assert baseline.get('status')==200 and baseline['elapsedSeconds']>3
for f in man['files']:
 dst=p/f['path']; actual=hashlib.sha256(dst.read_bytes()).hexdigest() if dst.exists() else None
 assert actual==f['baseSha256'],f['path']
assert not (b/'old.next').exists() and (b/'failed.next/standalone/custom-server.js').is_file()
(b/'first-attempt.json').write_text(json.dumps(d,indent=2)); d['attempt']=2; d['healthProbeChange']='Use health/version for readiness then a 45s full /v1/models call; original production returned 200 after 30.638s, exceeding initial probe per-request timeout of 3s'
try:
 subprocess.run(['systemctl','--user','stop','10router.service'],check=True)
 (p/'.next').rename(b/'old.next'); (b/'failed.next').rename(p/'.next')
 for f in man['files']:
  dst=p/f['path']; dst.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(r/f['path'],dst)
 subprocess.run(['systemctl','--user','start','10router.service'],check=True)
 healthy=False
 for i in range(15):
  try:
   with urllib.request.urlopen('http://127.0.0.1:20128/api/health',timeout=3) as x: health=json.load(x); assert x.status==200 and health['ok'] and health['driver']
   with urllib.request.urlopen('http://127.0.0.1:20128/api/version',timeout=3) as x: version=json.load(x); assert x.status==200 and '1.4.1-test.1' in str(version)
   healthy=True; break
  except Exception: time.sleep(2)
 assert healthy,'Local health/version validation failed'
 started=time.monotonic()
 with urllib.request.urlopen('http://127.0.0.1:20128/v1/models',timeout=45) as x:
  models=json.load(x); assert x.status==200 and isinstance(models.get('data'),list)
 d['modelsProbe']={'status':200,'json':True,'models':len(models['data']),'elapsedSeconds':round(time.monotonic()-started,3)}
 d.update(state='deployed-awaiting-browser',pid=subprocess.check_output(['systemctl','--user','show','10router.service','-p','MainPID','--value'],text=True).strip(),health=health,versionResponse=version,restartedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
 (b/'deployment.json').write_text(json.dumps(d,indent=2)); pathlib.Path('/tmp/10router-codex-deployment-current.json').write_text(json.dumps(d)); print(json.dumps(d),flush=True)
except BaseException:
 print('SECOND_DEPLOY_FAILED_ROLLBACK',flush=True); subprocess.run(['python3',str(b/'rollback.py')],check=True); raise

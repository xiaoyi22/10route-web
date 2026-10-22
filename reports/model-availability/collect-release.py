from pathlib import Path
import json,re,subprocess,hashlib
root=Path('/home/meet/10router')
log=Path('/home/meet/backups/10router/deploy-availability-complete-20261022.log').read_text()
match=re.search(r'JSON report written to (\S+)',log)
tests=json.loads(Path(match.group(1)).read_text())
files=['src/lib/availability/core.js','src/lib/availability/service.js','src/lib/usageDb.js','src/shared/utils/businessObservation.js','src/sse/services/auth.js','src/sse/handlers/chat.js','src/app/api/v1/models/route.js','src/app/api/models/distribution/route.js','src/app/api/model-availability/route.js','src/dashboardGuard.js','open-sse/handlers/chatCore/requestDetail.js']
report={
 'backendActive':subprocess.check_output(['systemctl','--user','is-active','10router.service'],text=True).strip(),
 'backendStarted':subprocess.check_output(['systemctl','--user','show','10router.service','-p','ExecMainStartTimestamp'],text=True).strip(),
 'frontendRelease':str(Path('/home/meet/.local/share/10router-web/current').resolve()),
 'backendDeployPassed':'部署成功' in log,
 'offlineGatePassed':'PASS: no new failure' in log,
 'testsPassed':tests.get('numPassedTests'),
 'knownAssertionFailures':tests.get('numFailedTests'),
 'testFilesExecuted':len(tests['testResults']),
 'patchChecksAdded':12,
 'sourceHashes':{file:hashlib.sha256((root/file).read_bytes()).hexdigest() for file in files}
}
Path('/tmp/availability-release-summary.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({key:value for key,value in report.items() if key!='sourceHashes'},ensure_ascii=False))
assert report['backendDeployPassed'] and report['offlineGatePassed'] and report['backendActive']=='active'

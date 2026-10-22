#!/usr/bin/env bash
set -euo pipefail
cd /home/meet/10router
stamp=$(date +%Y%m%d-%H%M%S)
backup=/home/meet/backups/10router/availability-source-$stamp
mkdir -p "$backup"
tar -czf "$backup/source-before.tar.gz" src/lib/usageDb.js src/sse/services/auth.js src/sse/handlers/chat.js src/app/api/v1/models/route.js src/app/api/models/distribution/route.js open-sse/handlers/chatCore/requestDetail.js src/dashboardGuard.js
cp -p deploy.sh "deploy.sh.bak-$stamp"
cp -a /tmp/model-availability-review/src/. src/
cp -a /tmp/model-availability-review/open-sse/. open-sse/
cp -a /tmp/model-availability-review/tests/. tests/
python3 - <<'PY'
from pathlib import Path
p=Path('deploy.sh')
s=p.read_text()
a='PATCH_CHECKS=(\n'
assert s.count(a)==1
entries=[
'src/lib/availability/core.js:export function recordOutcome:1',
'src/lib/availability/service.js:export async function observeBusinessDetail:1',
'src/app/api/model-availability/route.js:export async function POST:1',
'src/shared/utils/businessObservation.js:export function isBusinessRequest:1',
'src/lib/usageDb.js:await observeBusinessDetail(recorded):1',
'src/sse/services/auth.js:const passiveDecisions = await availabilityDecisions:1',
'src/sse/handlers/chat.js:availabilityBusiness: isBusinessRequest:1',
'src/app/api/v1/models/route.js:options.ignoreAvailability === true:1',
'src/app/api/models/distribution/route.js:ignoreAvailability: true:1',
'open-sse/handlers/chatCore/requestDetail.js:observationSource: isBusinessRequest:1',
'src/dashboardGuard.js:/api/model-availability:1']
s=s.replace(a,a+''.join('  "'+entry+'"\n' for entry in entries))
p.write_text(s)
PY
node --check src/lib/availability/core.js
node --check src/lib/availability/service.js
bash -n deploy.sh
cd tests
npx vitest run unit/model-availability-service.test.js unit/stream-detail-finalization.test.js unit/monitor-manual-route.test.js unit/downstream-distribution.test.js unit/distribution-guard.test.js --reporter=dot

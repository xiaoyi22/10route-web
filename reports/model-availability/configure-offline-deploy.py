from pathlib import Path
p=Path('/home/meet/10router/deploy.sh')
s=p.read_text()
a='TEST_DIR="${APP_DIR}/tests"'
assert s.count(a)==1
b=a+'''
# Passive availability changes are verified without live model probes.
TEST_OPTIONS=()
TEST_NODE_OPTIONS="${NODE_OPTIONS:-}"
if [ "${TENROUTER_PASSIVE_TESTS:-0}" = "1" ]; then
  TEST_OPTIONS=(--exclude '**/*live*' --exclude '**/real/**' --exclude '**/*real.test.js')
  TEST_NODE_OPTIONS="$TEST_NODE_OPTIONS --import=$TEST_DIR/helpers/passive-offline-network.mjs"
fi'''
s=s.replace(a,b)
a='npx vitest run --reporter=json'
assert s.count(a)==2
s=s.replace(a,'NODE_OPTIONS="$TEST_NODE_OPTIONS" npx vitest run "${TEST_OPTIONS[@]}" --reporter=json')
a='PATCH_CHECKS=(\n'
s=s.replace(a,a+'  "deploy.sh:TENROUTER_PASSIVE_TESTS:1"\n')
p.write_text(s)

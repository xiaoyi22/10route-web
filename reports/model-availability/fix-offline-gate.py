from pathlib import Path
p=Path('/home/meet/10router/deploy.sh')
s=p.read_text()
a="TEST_OPTIONS=(--exclude '**/*live*' --exclude '**/real/**' --exclude '**/*real.test.js')"
b="TEST_OPTIONS=(--exclude '**/*.live.test.js' --exclude '**/translator/real/**' --exclude '**/monitor-manual-live.test.js')"
assert s.count(a)==1
s=s.replace(a,b)
a='TEST_NODE_OPTIONS="${NODE_OPTIONS:-}"'
assert s.count(a)==1
s=s.replace(a,a+'\nREGRESSION_GATE="$TEST_DIR/__baseline__/verify-no-regression.mjs"')
a='  TEST_NODE_OPTIONS="$TEST_NODE_OPTIONS --import=$TEST_DIR/helpers/passive-offline-network.mjs"'
assert s.count(a)==1
s=s.replace(a,a+'\n  REGRESSION_GATE="$TEST_DIR/__baseline__/verify-passive-regression.mjs"')
a='node "$TEST_DIR/__baseline__/verify-no-regression.mjs"'
assert s.count(a)==2
s=s.replace(a,'node "$REGRESSION_GATE"')
p.write_text(s)

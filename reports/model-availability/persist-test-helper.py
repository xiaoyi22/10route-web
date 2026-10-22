from pathlib import Path
import shutil
root=Path('/home/meet/10router')
helper=root/'tests/helpers/passive-offline-network.mjs'
helper.parent.mkdir(parents=True,exist_ok=True)
shutil.copyfile('/tmp/availability-offline-network.mjs',helper)
p=root/'deploy.sh'
s=p.read_text()
a='--import=/tmp/availability-offline-network.mjs'
assert s.count(a)==1
p.write_text(s.replace(a,'--import=$TEST_DIR/helpers/passive-offline-network.mjs'))

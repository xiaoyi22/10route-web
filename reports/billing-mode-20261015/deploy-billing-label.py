import datetime
import os
import pathlib
import shutil
import subprocess

source = pathlib.Path('/home/meet/10router-web')
stage = pathlib.Path('/home/meet') / ('10router-web-billing-label-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S'))
stage.mkdir()
for name in ['src', 'public', 'scripts']:
    shutil.copytree(source / name, stage / name)
for name in ['index.html', 'package.json', 'package-lock.json', 'vite.config.js']:
    if (source / name).exists():
        shutil.copy2(source / name, stage / name)
(stage / 'node_modules').symlink_to((source / 'node_modules').resolve(), target_is_directory=True)
lines = pathlib.Path('/tmp/10router-billing-label.patch').read_bytes().splitlines(keepends=True)
crlf = b'\r\n' in (stage / 'src/pages/CorePages.jsx').read_bytes()
patch = b''.join(line.rstrip(b'\r\n') + b'\r\n' if crlf and line.startswith((b' ', b'+', b'-')) and not line.startswith((b'+++', b'---')) else line for line in lines)
subprocess.run(['git', 'apply', '--check', '-'], input=patch, cwd=stage, check=True)
subprocess.run(['git', 'apply', '-'], input=patch, cwd=stage, check=True)
env = os.environ.copy()
env.update(TENROUTER_BACKEND_URL='http://127.0.0.1:20128', TENROUTER_ENABLE_MANAGEMENT='1', TENROUTER_MODEL_BASE_URL='http://192.168.11.150:20128/v1')
with open(stage / 'billing-build.log', 'w') as log:
    subprocess.run(['npm', 'run', 'build'], cwd=stage, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
print('BUILD_OK', stage, flush=True)
pathlib.Path('/tmp/10router-web-billing-stage.txt').write_text(str(stage))
# Reuse the reviewed package, backup, atomic switch and rollback procedure.
deploy = pathlib.Path('/tmp/10router-web-deploy-billing.py').read_text()
assert deploy.count('按量计费（推断）') == 1
assert deploy.count('/tmp/10router-billing-20261015.patch') == 1
deploy = deploy.replace('按量计费（推断）', '按量计费').replace('/tmp/10router-billing-20261015.patch', '/tmp/10router-billing-label.patch')
exec(compile(deploy, '/tmp/10router-web-deploy-billing.py', 'exec'))

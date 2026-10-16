import datetime
import hashlib
import json
import pathlib
import shutil
import subprocess
import tarfile
import time
import urllib.request

stage = pathlib.Path(pathlib.Path('/tmp/10router-web-billing-stage.txt').read_text().strip())
source = pathlib.Path('/home/meet/10router-web')
root = pathlib.Path('/home/meet/.local/share/10router-web')
previous = (root / 'current').resolve(strict=True)
stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S') + '-billing'
release = root / 'releases' / stamp
backup = pathlib.Path('/home/meet/backups/10router-web') / stamp
backup.mkdir(parents=True, mode=0o700)
assert 'built in' in (stage / 'billing-build.log').read_text()
assert any('按量计费（推断）' in file.read_text() for file in (stage / 'dist/assets').glob('CorePages-*.js'))
assert any('scrollbar-width:thin' in file.read_text() for file in (stage / 'dist/assets').glob('*.css'))
assert not any('linear-demo' in file.read_text() for file in (stage / 'dist/assets').glob('*.js'))
target = source / 'src/pages/CorePages.jsx'
patch_lines = pathlib.Path('/tmp/10router-billing-20261015.patch').read_bytes().splitlines(keepends=True)
crlf = b'\r\n' in target.read_bytes()
patch = b''.join(line.rstrip(b'\r\n') + b'\r\n' if crlf and line.startswith((b' ', b'+', b'-')) and not line.startswith((b'+++', b'---')) else line for line in patch_lines)
subprocess.run(['git', 'apply', '--check', '-'], input=patch, cwd=source, check=True)
shutil.copy2(target, backup / 'CorePages.jsx')
shutil.copytree(previous, release, symlinks=True)
shutil.copytree(stage / 'dist', release / 'dist', dirs_exist_ok=True)
(release / 'release-id').write_text(stamp + '\n')
with tarfile.open(backup / 'artifact.tar.gz', 'w:gz') as archive:
    archive.add(release, arcname='.')
record = {'release': str(release), 'previous': str(previous), 'backup': str(backup), 'state': 'prepared', 'scope': 'Frontend billing inference; backend unchanged'}
pending = root / ('current-' + stamp)
try:
    subprocess.run(['git', 'apply', '-'], input=patch, cwd=source, check=True)
    pending.symlink_to(release, target_is_directory=True)
    pending.replace(root / 'current')
    subprocess.run(['systemctl', '--user', 'restart', '10router-web.service'], check=True)
    healthy = False
    for attempt in range(10):
        try:
            with urllib.request.urlopen('http://127.0.0.1:4317/dashboard/logs', timeout=3) as response:
                assert response.status == 200 and response.read() == (release / 'dist/index.html').read_bytes()
            with urllib.request.urlopen('http://127.0.0.1:4317/api/health', timeout=3) as response:
                assert response.status == 200 and json.load(response)['ok']
            healthy = True
            break
        except Exception:
            time.sleep(1)
    assert healthy
    record['state'] = 'deployed-http-verified'
except BaseException:
    if pending.is_symlink():
        pending.unlink()
    pending.symlink_to(previous, target_is_directory=True)
    pending.replace(root / 'current')
    shutil.copy2(backup / 'CorePages.jsx', target)
    subprocess.run(['systemctl', '--user', 'restart', '10router-web.service'], check=True)
    record['state'] = 'rolled-back'
    raise
finally:
    (backup / 'deployment.json').write_text(json.dumps(record, indent=2))
    pathlib.Path('/tmp/10router-web-billing-deployment.json').write_text(json.dumps(record, indent=2))
print(json.dumps(record), flush=True)

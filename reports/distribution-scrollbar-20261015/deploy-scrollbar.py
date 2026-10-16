import datetime
import hashlib
from html.parser import HTMLParser
import json
import pathlib
import shutil
import subprocess
import tarfile
import urllib.request


class StylesheetLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == 'link' and values.get('rel') == 'stylesheet':
            self.paths.append(values['href'])


root = pathlib.Path('/home/meet/.local/share/10router-web')
previous = (root / 'current').resolve(strict=True)
stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
release = root / 'releases' / (stamp + '-scrollbar')
backup = pathlib.Path('/home/meet/backups/10router-web') / (stamp + '-scrollbar')
backup.mkdir(parents=True, mode=0o700)
shutil.copytree(previous, release, symlinks=True)
index = release / 'dist/index.html'
html = index.read_text()
parser = StylesheetLinks()
parser.feed(html)
assert len(parser.paths) == 1
href = parser.paths[0]
css = release / 'dist' / href.lstrip('/')
original = css.read_text()
before = '.distribution-selected ul{scrollbar-gutter:stable;max-height:min(560px,60vh);margin:0;padding:0 10px 0 0;list-style:none;overflow-y:auto}'
after = '.distribution-selected ul{scrollbar-gutter:stable;scrollbar-width:thin;scrollbar-color:var(--dim) transparent;max-height:min(560px,60vh);margin:0;padding:0 16px 0 0;list-style:none;overflow-y:auto}'
assert original.count(before) == 1
updated = original.replace(before, after)
digest = hashlib.sha256(updated.encode()).hexdigest()
new_name = 'index-scrollbar-' + digest[:12] + '.css'
(css.parent / new_name).write_text(updated)
index.write_text(html.replace(href, '/assets/' + new_name))
(release / 'release-id').write_text(stamp + '-scrollbar\n')
record = {'release': str(release), 'previous': str(previous), 'backup': str(backup), 'cssSha256': digest, 'changedRule': after}
(backup / 'deployment.json').write_text(json.dumps(record, indent=2))
with tarfile.open(backup / 'artifact.tar.gz', 'w:gz') as archive:
    archive.add(release, arcname='.')
pending = root / ('current-' + stamp)
pending.symlink_to(release, target_is_directory=True)
try:
    pending.replace(root / 'current')
    subprocess.run(['systemctl', '--user', 'restart', '10router-web.service'], check=True)
    import time
    ready = False
    for attempt in range(10):
        try:
            with urllib.request.urlopen('http://127.0.0.1:4317/dashboard/distribution', timeout=3) as response:
                assert response.status == 200 and new_name in response.read().decode()
            with urllib.request.urlopen('http://127.0.0.1:4317/assets/' + new_name, timeout=3) as response:
                assert response.status == 200 and hashlib.sha256(response.read()).hexdigest() == digest
            ready = True
            break
        except Exception:
            time.sleep(1)
    assert ready, 'Frontend HTTP verification failed'
    record['state'] = 'deployed-http-verified'
except BaseException:
    pending.symlink_to(previous, target_is_directory=True)
    pending.replace(root / 'current')
    subprocess.run(['systemctl', '--user', 'restart', '10router-web.service'], check=True)
    record['state'] = 'rolled-back'
    raise
finally:
    (backup / 'deployment.json').write_text(json.dumps(record, indent=2))
print(json.dumps(record), flush=True)

#!/usr/bin/env bash
set -euo pipefail

source_dir=/home/meet/10router-web
deploy_dir=/home/meet/.local/share/10router-web
stamp=$(date +%Y%m%d-%H%M%S)
release=$deploy_dir/releases/$stamp
unit_dir=/home/meet/.config/systemd/user
unit=$unit_dir/10router-web.service
backup=/home/meet/backups/10router-web/$stamp

test "$(id -un)" = meet
test "$(uname -m)" = x86_64
test -f "$source_dir/dist/index.html"
curl --noproxy '*' -fsS --max-time 10 http://127.0.0.1:20128/api/health
printf '\n'
node --test "$source_dir/tests/server.test.mjs" "$source_dir/tests/hermes.test.mjs" "$source_dir/tests/system-info.test.mjs" "$source_dir/tests/checkins.test.mjs" "$source_dir/tests/checkin-bridge.test.mjs"
mkdir -p "$release/scripts" "$release/src/api" "$unit_dir" "$backup"

# Freeze only the accepted compiled frontend and its dependency-free HTTP server.
cp -a "$source_dir/dist" "$release/"
cp "$source_dir/scripts/serve.mjs" "$release/scripts/"
cp "$source_dir/scripts/hermes-bridge.mjs" "$release/scripts/"
cp "$source_dir/scripts/system-bridge.mjs" "$source_dir/scripts/system-info.mjs" "$release/scripts/"
cp "$source_dir/scripts/checkin-bridge.mjs" "$source_dir/scripts/checkin-service.mjs" "$source_dir/scripts/checkin-client.mjs" "$release/scripts/"
cp "$source_dir/src/api/policy.js" "$release/src/api/"
cp "$source_dir/src/api/oauth-catalog.js" "$release/src/api/"
cp "$source_dir/src/api/cli-tools.js" "$release/src/api/"
cp "$source_dir/package.json" "$release/"
cp "$source_dir/scripts/10router-web.service" "$backup/service-next"
node --check "$release/scripts/serve.mjs"
node --check "$release/scripts/hermes-bridge.mjs"
node --check "$release/scripts/system-bridge.mjs"
node --check "$release/scripts/system-info.mjs"
node --check "$release/scripts/checkin-bridge.mjs"
node --check "$release/scripts/checkin-service.mjs"
node --check "$release/scripts/checkin-client.mjs"
TENROUTER_RELEASE_SERVER="$release/scripts/serve.mjs" node --input-type=module -e 'await import(process.env.TENROUTER_RELEASE_SERVER)'
if grep -Rl 'linear-demo' "$release/dist/assets" --include='*.js'; then
  printf 'Demo frontend cannot be deployed\n' >&2
  exit 1
fi
printf '%s\n' "$stamp" > "$release/release-id"
tar -czf "$backup/artifact.tar.gz" -C "$release" .
sha256sum "$backup/artifact.tar.gz" > "$backup/artifact.sha256"
previous=''
if test -f "$deploy_dir/current/dist/index.html"; then previous=$(readlink -f "$deploy_dir/current"); fi
if test -f "$unit"; then cp -p "$unit" "$unit.bak-$stamp"; fi
if test -n "$previous"; then printf '%s\n' "$previous" > "$backup/previous-release"; fi

rollback() {
  local result=$?
  if test "$result" -ne 0; then
    systemctl --user stop 10router-web.service || true
    if test -n "$previous"; then ln -sfn "$previous" "$deploy_dir/current"; fi
    if test -f "$unit.bak-$stamp"; then cp -p "$unit.bak-$stamp" "$unit"; fi
    systemctl --user daemon-reload
    if test -n "$previous"; then systemctl --user start 10router-web.service || true; fi
    printf 'Deployment failed; inspect %s\n' "$backup" >&2
  fi
}
trap rollback EXIT
ln -sfnT "$release" "$deploy_dir/current"
cp "$backup/service-next" "$unit"
systemctl --user daemon-reload
systemctl --user enable 10router-web.service
systemctl --user restart 10router-web.service

ready=0
for attempt in $(seq 1 15); do
  if curl --noproxy '*' -fsS --max-time 3 http://127.0.0.1:4317/api/health > "$backup/health.json"; then ready=1; break; fi
  sleep 1
done
test "$ready" = 1
curl --noproxy '*' -fsS --max-time 10 http://127.0.0.1:4317/dashboard/overview > "$backup/index.html"
curl --noproxy '*' -fsS --max-time 10 http://127.0.0.1:4317/api/auth/status > "$backup/auth-status.json"
node --input-type=module - "$backup/auth-status.json" <<'JS'
import { readFileSync } from 'node:fs';
const auth = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (auth.demo || auth.bootstrapLocal || !auth.requireLogin || auth.authenticated) throw new Error('Authentication boundary failed');
JS
status=$(curl --noproxy '*' -s --max-time 10 -o /dev/null -w '%{http_code}' http://127.0.0.1:4317/api/providers)
test "$status" = 401
printf 'complete\n' > "$backup/status"
systemctl --user show 10router-web.service -p ActiveState -p MainPID -p ExecMainStartTimestamp
printf 'RELEASE=%s\nBACKUP=%s\n' "$release" "$backup"

#!/usr/bin/env bash
set -euo pipefail
backup=$(cd -- "$(dirname -- "$0")" && pwd)
app=/home/meet/10router
previous_frontend=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["frontendPrevious"])' "$backup/state.json")
test -f "$previous_frontend/dist/index.html"
test -f "$backup/previous.next/standalone/custom-server.js"
systemctl --user stop 10router-web.service 10router.service
if test -e "$app/.next"; then mv "$app/.next" "$backup/failed.next-$(date +%Y%m%d-%H%M%S)"; fi
mv "$backup/previous.next" "$app/.next"
ln -sfnT "$previous_frontend" /home/meet/.local/share/10router-web/current
systemctl --user start 10router.service 10router-web.service
printf 'Previous backend build and frontend release restored; source and database unchanged.\n'

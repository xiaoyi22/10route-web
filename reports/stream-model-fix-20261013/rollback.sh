#!/usr/bin/env bash
set -euo pipefail
app=/home/meet/10router
backup=/home/meet/backups/10router/stream-model-release-20261013-145856
previous_frontend=/home/meet/.local/share/10router-web/releases/20261013-133506
test -f "$backup/previous.next/standalone/custom-server.js"
test -f "$previous_frontend/dist/index.html"
test ! -e "$backup/rolled-back.next"
systemctl --user stop 10router.service
mv "$app/.next" "$backup/rolled-back.next"
mv "$backup/previous.next" "$app/.next"
ln -sfnT "$previous_frontend" /home/meet/.local/share/10router-web/current
systemctl --user start 10router.service
systemctl --user restart 10router-web.service
sleep 3
curl --noproxy '*' -fsS --max-time 10 http://127.0.0.1:20128/api/health
printf '\n'
curl --noproxy '*' -fsS --max-time 10 http://127.0.0.1:4317/api/health
printf '\n'

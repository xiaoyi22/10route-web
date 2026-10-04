#!/usr/bin/env bash
# Publish the Windows share source tree (R:\10router-web) to the KN10 production release.
# Manual trigger: bash scripts/publish.sh
set -euo pipefail

src=/home/meet/10router-web
log_dir=/home/meet/.local/share/10router-web/logs

mkdir -p "$log_dir"

cd "$src"
printf "== publish start %s duration=%ss head=%s ==\n" "$(date +%Y-%m-%dT%H:%M:%S%:z)" "$SECONDS" "$(git rev-parse --short HEAD)"
started=$SECONDS

git add -A
if ! git diff --cached --quiet; then
  git -c core.autocrlf=false commit -q -m "share sync $(date +%Y-%m-%dT%H:%M:%S%:z)"
  printf "COMMIT %s\n" "$(git rev-parse --short HEAD)"
else
  printf "NO_SOURCE_CHANGE head=%s\n" "$(git rev-parse --short HEAD)"
fi

if ! node scripts/build.mjs; then
  printf "BUILD_FAILED head=%s; production untouched\n" "$(git rev-parse --short HEAD)"
  exit 1
fi

bash scripts/deploy-kn10.sh

release=$(readlink -f /home/meet/.local/share/10router-web/current)
printf "PUBLISHED commit=%s release=%s duration=%ss\n" "$(git rev-parse --short HEAD)" "$release" "$((SECONDS - started))"

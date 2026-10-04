#!/usr/bin/env bash
# Poll the Windows share source tree and publish it on KN10 when it changes.
# Usage: publish-watch.sh [--once] [--quiet]
set -euo pipefail

src=/home/meet/10router-web
log_dir=/home/meet/.local/share/10router-web/logs
interval=60

for arg in "$@"; do
  case "$arg" in
    --once) interval=0 ;;
    --quiet) exec >>"$log_dir/watch.log" 2>&1 ;;
    *) printf 'unknown argument: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

mkdir -p "$log_dir"

src_hash() {
  cd "$src" || return 1
  find . -path ./node_modules -prune -o -path ./.git -prune -o -path ./dist -prune -o -path ./screenshots -prune -o -type f -print0 \
    | sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1
}

publish() {
  cd "$src"
  git add -A
  if ! git diff --cached --quiet; then
    git -c core.autocrlf=false commit -q -m "share sync $(date +%Y-%m-%dT%H:%M:%S%:z)"
    printf 'COMMIT %s\n' "$(git rev-parse --short HEAD)"
  fi
  if ! node scripts/build.mjs; then
    printf 'BUILD_FAILED head=%s\n' "$(git rev-parse --short HEAD)"
    return 1
  fi
  bash scripts/deploy-kn10.sh
}

previous=$(src_hash)
printf 'watch start head=%s hash=%s interval=%ss\n' "$(cd "$src" && git rev-parse --short HEAD)" "$previous" "$interval"

if [ "$interval" = 0 ]; then
  publish
  exit $?
fi

while true; do
  sleep "$interval"
  current=$(src_hash)
  if [ "$current" = "$previous" ]; then continue; fi
  printf 'change detected hash=%s previous=%s\n' "$current" "$previous"
  if publish; then
    previous=$current
    printf 'published head=%s\n' "$(cd "$src" && git rev-parse --short HEAD)"
  else
    printf 'publish failed, retrying after next change\n'
  fi
done
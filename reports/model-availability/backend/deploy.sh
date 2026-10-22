#!/usr/bin/env bash
# ============================================================================
# deploy.sh — 10Router 一键部署/升级工作流
#
# 用法：
#   bash deploy.sh deploy              普通部署（改完代码 → 测试 → 构建 → 重启 → 冒烟）
#   bash deploy.sh upgrade             升级模式（fetch + merge origin/main → 补丁存活检查 → 部署全流程）
#   bash deploy.sh --rollback          回滚到上一次部署锚点
#
# 选项：
#   --with-tests                       跑全量 vitest（服务器内存 6G，约 5-10 分钟）
#   --force                            跳过未提交改动拦截（危险，仅确认 WIP 无损时用）
#   --skip-build                       跳过构建（仅用于只想重启/冒烟）
#   --dry-run                          只做 体检+备份+测试门禁，不构建/不重启/不冒烟
#   --branch <ref>                     升级时 merge 的 ref（默认 origin/main）
#
# 流程（对应 UPGRADE-SOP-v1.1.4.md 的 P0→P7）：
#   P0 体检(分支/未提交/服务状态) → P0.2 备份(DB+旧.next+git锚点)
#   → P1 升级模式: fetch+merge → 补丁存活 grep → P2 测试门禁
#   → P3 受限内存构建 → P4 重启+冒烟 → 失败自动回滚
#
# 铁律：任何失败即 STOP，保留备份，绝不裸改生产。
#
# 防"部署一半死"三件套：
#   1. flock 互斥锁 —— 上次部署没跑完（SSH 断/构建被杀）时，新部署直接拒绝，
#      避免两个部署叠着跑把 .next 搞成半成品；--force 绕过（自担风险）。
#   2. nohup 常驻 —— 构建等长步骤不依赖调用方终端；SSH 断了部署继续跑完，
#      日志落 $BACKUP_ROOT/deploy-$TS.log，重新 attach 用 --watch。
#   3. 冒烟等待拉长 —— 重试 12×5s（60s），慢启动不再误判死亡触发无谓回滚。
# ============================================================================
set -uo pipefail

# ---------- 配置 ----------
APP_DIR="/home/meet/10router"
SERVICE="10router.service"
PORT="20128"
HEALTH_URL="http://127.0.0.1:${PORT}/v1/models"
BACKUP_ROOT="/home/meet/backups/10router"
LOCK_FILE="/tmp/10router-deploy.lock"
# 注意：必须走 npm run build（触发 postbuild 拷 public/static 进 standalone）。
# 直接调 next build 会跳过 postbuild → standalone 缺资源 → 上线没图片/没多语言。
# 服务器内存 6G：用环境变量 NODE_OPTIONS 覆盖脚本里写死的 24576。
NEXT_BUILD_CMD="npm run build"
# 已知基线红（见 tests/__baseline__/known-fails.txt），门禁用回归基线判定
TEST_DIR="${APP_DIR}/tests"
# Passive availability changes are verified without live model probes.
TEST_OPTIONS=()
TEST_NODE_OPTIONS="${NODE_OPTIONS:-}"
REGRESSION_GATE="$TEST_DIR/__baseline__/verify-no-regression.mjs"
if [ "${TENROUTER_PASSIVE_TESTS:-0}" = "1" ]; then
  TEST_OPTIONS=(--exclude '**/*.live.test.js' --exclude '**/translator/real/**' --exclude '**/monitor-manual-live.test.js')
  TEST_NODE_OPTIONS="$TEST_NODE_OPTIONS --import=$TEST_DIR/helpers/passive-offline-network.mjs"
  REGRESSION_GATE="$TEST_DIR/__baseline__/verify-passive-regression.mjs"
fi
PROXY_UNSET="env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY -u all_proxy -u ALL_PROXY -u NODE_USE_ENV_PROXY"

# 本批次补丁存活检查项（P1.5），按需增删。格式: "文件名:grep词:最少命中数"
# 注意: grep 词含引号/括号时用 grep -F 固定字符串匹配，避免正则解析
PATCH_CHECKS=(
  "deploy.sh:TENROUTER_PASSIVE_TESTS:1"
  "src/lib/availability/core.js:export function recordOutcome:1"
  "src/lib/availability/service.js:export async function observeBusinessDetail:1"
  "src/app/api/model-availability/route.js:export async function POST:1"
  "src/shared/utils/businessObservation.js:export function isBusinessRequest:1"
  "src/lib/usageDb.js:await observeBusinessDetail(recorded):1"
  "src/sse/services/auth.js:const passiveDecisions = await availabilityDecisions:1"
  "src/sse/handlers/chat.js:availabilityBusiness: isBusinessRequest:1"
  "src/app/api/v1/models/route.js:options.ignoreAvailability === true:1"
  "src/app/api/models/distribution/route.js:ignoreAvailability: true:1"
  "open-sse/handlers/chatCore/requestDetail.js:observationSource: isBusinessRequest:1"
  "src/dashboardGuard.js:/api/model-availability:1"
  "src/app/api/models/test/route.js:maxOutputTokens: 1024:1"
  "src/lib/iqMonitor/probe.js:const maxTokens = maxOutputTokens:1"
  "open-sse/services/provider.js:export function resolveClaudeCodePassthrough:1"
  "open-sse/executors/default.js:isClaudeCodePassthrough(credentials, model):1"
  "open-sse/handlers/chatCore.js:const claudeCodePassthrough = resolveClaudeCodePassthrough:1"
  "src/app/api/providers/route.js:providerSpecificData.claudeCodePassthrough:1"
  "src/lib/db/schema.js:SCHEMA_VERSION = 3:1"
  "src/lib/db/repos/apiKeysRepo.js:export function normalizeWhitelist:1"
  "src/sse/services/auth.js:export async function checkApiKeyModelAccess:1"
  "src/sse/handlers/chat.js:const accessResponse = await checkApiKeyModelAccess:1"
  "src/app/api/v1/models/route.js:Filter by API key whitelists if the caller:1"
  "src/app/api/keys/route.js:allowedModels, allowedCombos:1"
  "src/app/api/keys/[id]/route.js:updateData.allowedModels:1"
  "src/app/api/keys/rotate/route.js:key.allowedModels:1"
  "src/lib/db/index.js:allowedCombos: parseJson(r.allowedCombos, null):1"
  "open-sse/translator/request/openai-to-claude.js:reasoningText = extractReasoningText(msg):1"
  "open-sse/executors/codebuddy-cn.js:X-Agent-Intent:1"
  "open-sse/executors/codebuddy-intl.js:X-Agent-Intent:1"
  "src/sse/services/codebuddyCheckin.js:executor.buildHeaders:1"
)

MODE="deploy"
WITH_TESTS=0
FORCE=0
SKIP_BUILD=0
DRY_RUN=0
WATCH=0
UPGRADE_REF="origin/main"
TS=""
ANCHOR=""
NEXT_BACKUP=""
DB_BACKUP=""

# ---------- 工具 ----------
say()  { echo -e "\033[1;34m[deploy]\033[0m $*"; }
warn() { echo -e "\033[1;33m[警告]\033[0m $*"; }
err()  { echo -e "\033[1;31m[失败]\033[0m $*" >&2; }
die()  { err "$*"; exit 1; }

# ---------- 参数解析 ----------
for arg in "$@"; do
  case "$arg" in
    deploy)   MODE="deploy" ;;
    upgrade)  MODE="upgrade" ;;
    --rollback) MODE="rollback" ;;
    --with-tests) WITH_TESTS=1 ;;
    --force)  FORCE=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --force)  FORCE=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --watch)  WATCH=1 ;;
    --branch=*) UPGRADE_REF="${arg#--branch=}" ;;
    --branch) die "--branch 需要一个参数，如 --branch=v1.2.1" ;;
    *) die "未知参数: $arg （用法见文件头）" ;;
  esac
done

cd "$APP_DIR" || die "无法进入 $APP_DIR"

# ---------- P-1 部署互斥锁（防叠跑）----------
# 上次部署中途死掉（SSH 断线杀掉构建）会留下锁文件；用 --force 可越过。
# 判"真在跑"看进程：锁里记录的 PID 存活才拦截，死进程残留锁自动清。
if [ "$MODE" != "rollback" ] && [ "$WATCH" != "1" ]; then
  if [ -f "$LOCK_FILE" ]; then
    OLD_PID=$(cat "$LOCK_FILE" 2>/dev/null)
    if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
      [ "$FORCE" = "1" ] || die "已有部署在运行 (PID $OLD_PID)。跟踪: bash deploy.sh --watch ｜ 强行并行: --force"
    else
      warn "发现残留锁（PID $OLD_PID 已死，上次部署中途被杀），清除后继续"
      rm -f "$LOCK_FILE"
    fi
  fi
  echo $$ > "$LOCK_FILE"
  trap 'rm -f "$LOCK_FILE"' EXIT
fi

# ---------- --watch：重新 attach 一次 nohup 部署的日志 ----------
if [ "$WATCH" = "1" ]; then
  LOGFILE=$(cat "$BACKUP_ROOT/deploy-running.log" 2>/dev/null) || die "没有正在运行/最近一次 nohup 部署（$BACKUP_ROOT/deploy-running.log 不存在）"
  [ -f "$LOGFILE" ] || die "日志文件不存在: $LOGFILE"
  say "跟踪部署日志: $LOGFILE (Ctrl+C 退出，不影响部署)"
  tail -f "$LOGFILE"
  exit 0
fi

# ---------- P-2 nohup 常驻（防 SSH 断线杀部署）----------
# 首次调用时把整个脚本搬到 nohup 后台重跑一遍，调用方终端立刻返回。
# 构建中途 SSH 断开，部署继续跑到回滚/成功为止。REEXEC_GUARD 防递归。
if [ -z "${REEXEC_GUARD:-}" ] && [ "$MODE" != "rollback" ] && [ "$WATCH" != "1" ]; then
  mkdir -p "$BACKUP_ROOT"
  RUN_LOG="$BACKUP_ROOT/deploy-$(date +%Y%m%d-%H%M%S).log"
  echo "$RUN_LOG" > "$BACKUP_ROOT/deploy-running.log"
  say "转入后台常驻执行，日志: $RUN_LOG"
  say "实时跟踪: bash deploy.sh --watch ｜ 本次终端可安全关闭（SSH 断开不影响部署）"
  REEXEC_GUARD=1 nohup bash "$APP_DIR/deploy.sh" "$@" > "$RUN_LOG" 2>&1 &
  disown
  sleep 1
  echo "部署已后台启动 (PID $!)。"
  exit 0
fi

# ---------- 回滚模式 ----------
if [ "$MODE" = "rollback" ]; then
  [ -f "$BACKUP_ROOT/latest-anchor.txt" ] || die "没有可回滚的锚点"
  ANCHOR=$(cat "$BACKUP_ROOT/latest-anchor.txt")
  say "回滚到锚点: $ANCHOR"
  git checkout "$ANCHOR" -- . 2>/dev/null || die "git checkout 锚点失败"
  # next-latest is a directory (cp -a creates one) — a plain-file test would never match.
  if [ -d "$BACKUP_ROOT/next-latest" ]; then
    rm -rf .next && cp -a "$BACKUP_ROOT/next-latest" .next
    say "已恢复旧构建 .next"
  fi
  systemctl --user restart "$SERVICE" && sleep 4
  code=$(curl -s -o /dev/null -w '%{http_code}' "$HEALTH_URL")
  [ "$code" = "200" ] && say "回滚完成，服务健康 (HTTP $code)" || die "回滚后服务不健康 (HTTP $code)"
  exit 0
fi

# ========== P0 体检 ==========
say "========== P0 环境体检 =========="
BRANCH=$(git branch --show-current)
[ "$BRANCH" = "main" ] || warn "当前分支 $BRANCH（预期 main）"
NODE_V=$(node -v)
say "分支=$BRANCH Node=$NODE_V"

# P0.1 未提交改动拦截
UNCOMMITTED=$(git status --short | grep -v '\.bak-' || true)
if [ -n "$UNCOMMITTED" ]; then
  if [ "$FORCE" = "1" ]; then
    warn "检测到未提交改动，已用 --force 跳过（风险自担）:"
    echo "$UNCOMMITTED"
  else
    err "检测到未提交改动，拒绝继续。请先提交或 stash（或确认无损后 --force）:"
    echo "$UNCOMMITTED"
    exit 1
  fi
fi

# 服务当前状态
systemctl --user is-active "$SERVICE" >/dev/null 2>&1 && say "服务当前 active" || warn "服务当前非 active（将被启动）"

# ========== P0.2 备份 ==========
say "========== P0.2 备份（DB + 旧构建 + git 锚点）=========="
TS=$(date +%Y%m%d%H%M%S)
ANCHOR=$(git rev-parse HEAD)
mkdir -p "$BACKUP_ROOT"
echo "$ANCHOR" > "$BACKUP_ROOT/latest-anchor.txt"

# DB 冷备（SQLite online backup）— 先定路径再备份
DB_BACKUP="$BACKUP_ROOT/data-$TS.sqlite"
python3 - "$DB_BACKUP" <<'PYEOF' || die "DB 备份失败"
import sqlite3, sys
src = sqlite3.connect('/home/meet/.10router/db/data.sqlite')
dst = sqlite3.connect(sys.argv[1])
src.backup(dst); dst.close()
print('DB backup OK')
PYEOF
say "DB 已备份 → $DB_BACKUP"

# 旧构建备份
if [ -d .next ]; then
  rm -rf "$BACKUP_ROOT/next-latest"
  cp -a .next "$BACKUP_ROOT/next-latest"
  say "旧构建已备份 → $BACKUP_ROOT/next-latest"
else
  warn ".next 不存在，跳过构建备份"
fi

# ========== P1 升级模式 ==========
if [ "$MODE" = "upgrade" ]; then
  say "========== P1 升级模式 (merge $UPGRADE_REF) =========="
  git fetch origin --tags --prune || die "git fetch 失败"
  BEHIND=$(git rev-list --count HEAD.."$UPGRADE_REF" 2>/dev/null || echo "?")
  say "本地领先 $(git rev-list --count "$UPGRADE_REF"..HEAD 2>/dev/null) 提交，落后 $BEHIND 提交"
  [ "$BEHIND" != "0" ] && [ "$BEHIND" != "?" ] || { say "已是最新，无需 merge，继续部署"; }
  # 若已处于 merge 冲突状态，先中止（上次失败残留）
  if [ -f .git/MERGE_HEAD ]; then
    warn "检测到未完成的 merge 状态，先 git merge --abort 清理"
    git merge --abort
  fi

  git merge --no-ff "$UPGRADE_REF" -m "Merge upstream ($(git rev-parse --short "$UPGRADE_REF")) into local patches" 2>&1 | tail -20
  RC=${PIPESTATUS[0]}
  if [ $RC -ne 0 ]; then
    err "merge 失败 (exit $RC)。中止 merge 恢复原状："
    git merge --abort 2>/dev/null || true
    die "merge 冲突，已 git merge --abort 回滚到 merge 前。请手工解决冲突后重试。"
  fi
  # 确认无残留冲突标记（红线：merge 后必须 git diff --check）
  if ! git diff --check >/dev/null 2>&1; then
    err "merge 后存在 whitespace/冲突残留（git diff --check 未过）:"
    git diff --check 2>&1 | head -10
    die "已中止。请先解决残留标记再重试。"
  fi
  say "  ✓ merge 干净（git diff --check 通过）"
fi

# ========== P1.5 补丁存活检查（deploy/upgrade 都跑） ==========
# 每条 PATCH_CHECKS 对应一次"代码改动登记"，部署时逐条 grep 验收。
# 部署成功后这些改动已上生产,可人工清空本数组为下一批次腾位。
if [ "${#PATCH_CHECKS[@]}" -gt 0 ]; then
  say "========== P1.5 补丁存活检查 =========="
  FAILED=0
  for check in "${PATCH_CHECKS[@]}"; do
    file="${check%%:*}"; rest="${check#*:}"; word="${rest%%:*}"; want="${rest##*:}"
    cnt=$(grep -Fc "$word" "$file" 2>/dev/null || echo 0)
    if [ "$cnt" -ge "$want" ]; then
      say "  ✓ $file 含 $word ($cnt≥$want)"
    else
      err "  ✗ $file 缺 $word（仅 $cnt/$want）——补丁丢失！"
      FAILED=1
    fi
  done
  [ "$FAILED" -eq 0 ] || die "补丁存活检查未通过。若是部署成功后忘清空,请编辑 deploy.sh 把 PATCH_CHECKS=() 重置"
fi

# ========== P2 测试门禁 ==========
say "========== P2 测试门禁 =========="
# 语法体检（快，先抓低级错误）
find src open-sse -name '*.js' -newer package.json -print0 2>/dev/null | head -1 >/dev/null
node --check custom-server.js || die "custom-server.js 语法错误"
say "  ✓ custom-server.js 语法 OK"

# 轻量门禁（默认）：iq-probe 单测 + 回归基线 + capability audit
say "  → 跑核心单测（iq-probe）"
( cd "$TEST_DIR" && timeout 120 npx vitest run unit/iq-probe.test.js 2>&1 | tail -6 )
[ ${PIPESTATUS[0]} -eq 0 ] || die "iq-probe 单测失败"

say "  → 回归基线（known-fails 门禁）"
( cd "$TEST_DIR" && NODE_OPTIONS="$TEST_NODE_OPTIONS" npx vitest run "${TEST_OPTIONS[@]}" --reporter=json --outputFile=/tmp/vitest-$TS.json 2>&1 | tail -3 )
node "$REGRESSION_GATE" /tmp/vitest-$TS.json || die "回归门禁未过"

say "  → capability audit"
node --no-warnings scripts/audit-capabilities.mjs || die "capability audit 未过"

if [ "$WITH_TESTS" = "1" ]; then
  say "  → 全量 vitest（--with-tests）"
  ( cd "$TEST_DIR" && NODE_OPTIONS="$TEST_NODE_OPTIONS" npx vitest run "${TEST_OPTIONS[@]}" --reporter=json --outputFile=/tmp/vitest-full-$TS.json 2>&1 | tail -5 )
  node "$REGRESSION_GATE" /tmp/vitest-full-$TS.json || die "全量回归门禁未过"
fi

# ========== P3 构建 ==========
if [ "$DRY_RUN" = "1" ]; then
  say "========== DRY-RUN：跳过构建 =========="
elif [ "$SKIP_BUILD" = "1" ]; then
  warn "========== 跳过构建（--skip-build）=========="
else
  say "========== P3 受限内存构建 (heap=4096, 约5-10min) =========="
  # 必须走 npm run build：npm 会触发 postbuild → copy-standalone-assets.mjs
  # 把 public/ 和 .next/static 拷进 standalone/（没有它们，服务上线就没图片/没多语言）。
  # 清代理构建（next/font 拉 Google Fonts 需要）；NODE_OPTIONS 覆盖脚本里 24576 的 heap。
  timeout 1200 $PROXY_UNSET NODE_OPTIONS=--max-old-space-size=4096 \
    npm run build 2>&1 | tail -12
  RC=${PIPESTATUS[0]}
  if [ $RC -ne 0 ] || [ ! -f .next/standalone/custom-server.js ]; then
    err "构建失败 (exit $RC)。恢复旧构建并退出。"
    [ -d "$BACKUP_ROOT/next-latest" ] && { rm -rf .next && cp -a "$BACKUP_ROOT/next-latest" .next; }
    die "构建失败，已恢复旧 .next（服务未动）"
  fi
  # 验证 postbuild 确实把资源拷进了 standalone（防"没图片/没多语言"复发）
  if [ ! -d .next/standalone/public ]; then
    err "构建后 standalone/public 缺失（postbuild 未执行或失败）！恢复旧构建退出。"
    [ -d "$BACKUP_ROOT/next-latest" ] && { rm -rf .next && cp -a "$BACKUP_ROOT/next-latest" .next; }
    die "standalone 缺 public，已恢复旧 .next"
  fi
  say "  ✓ 构建完成，standalone/public 资源就绪"
fi

# ========== P4 重启 + 冒烟 ==========
if [ "$DRY_RUN" = "1" ]; then
  say "========== DRY-RUN：跳过 构建/重启/冒烟 =========="
  say "✓ 演练完成：体检✓ 备份✓ 测试门禁✓（构建/重启/冒烟未执行）"
  say "  锚点: $ANCHOR  备份: $BACKUP_ROOT"
  exit 0
fi

say "========== P4 重启服务 + 冒烟 =========="
systemctl --user restart "$SERVICE" || die "服务重启失败"
sleep 4

# 12×5s=60s：Next standalone 冷启动 + 首次路由编译可能 30s+，
# 旧版 20s 等待会误判"启动慢"为"启动失败"，触发无谓回滚。
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$HEALTH_URL")
  [ "$code" = "200" ] && break
  warn "  等待服务就绪 (第${i}/12次, HTTP $code)…"
  sleep 5
done
[ "$code" = "200" ] || {
  err "冒烟失败 (HTTP $code)。尝试回滚…"
  bash "$0" --rollback || err "回滚失败，请手工介入"
  exit 1
}

VERSION=$(curl -s http://127.0.0.1:${PORT}/api/version 2>/dev/null | head -c 120)
say "✓ 部署成功！服务健康 (HTTP $code)"
say "  版本: $VERSION"
say "  锚点: $ANCHOR (回滚: bash deploy.sh --rollback)"
say "  备份: $BACKUP_ROOT"
say "  部署日志: $(cat "$BACKUP_ROOT/deploy-running.log" 2>/dev/null || echo 未知)"

# 提示清理临时备份（保留最近 DB 备份）
say "提示: 观察 ≥1 小时后可清理 $BACKUP_ROOT/next-latest（旧构建备份）"
# ---------- 自动清理（2026-10-01 加入）：防止构建备份堆积撑爆磁盘 ----------
say "清理历史构建备份（保留最近2个 .next-* / 最近10个DB备份 / 7天内回滚目录）..."
(cd "$APP_DIR" && ls -1dt .next-* 2>/dev/null | tail -n +3 | xargs -r rm -rf --   && say "  ✓ 旧构建已清理，保留最近2个")
(cd "$BACKUP_ROOT" && ls -1t data-*.sqlite 2>/dev/null | tail -n +11 | while read -r f; do rm -f -- "$f" "$f-wal" "$f-shm"; done   && say "  ✓ DB 备份已精简，保留最近10个")
(cd "$BACKUP_ROOT" && find . -maxdepth 1 -type d ! -name . ! -name next-latest -mtime +7 -exec rm -rf {} +   && say "  ✓ 7天前的回滚目录已清理")

(sudo -n fstrim -av >/dev/null 2>&1 && say "  ✓ fstrim 已归还空间给宿主机") || true
exit 0

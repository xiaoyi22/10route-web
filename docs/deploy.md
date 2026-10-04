# 10router-web 统一上线手册（手动触发版）

## 一句话流程

改完代码 → 跟我说「上线」→ 我在 KN10 上跑一条命令 → 60 秒内自动完成
打版本、构建、测试、切流、验收；失败自动回滚，线上不动。

## 上线命令（唯一入口）

```bash
ssh -i C:/Users/20449/.ssh/id_ed25519_tscompany meet@192.168.11.150
cd /home/meet/10router-web && bash scripts/publish.sh
```

`scripts/publish.sh` 依次做四件事，任何一步失败立刻停止：

1. 把 `~/10router-web`（= Windows 共享盘 `R:\10router-web` 的镜像）的改动提交成一个带时间戳的 commit，上线永远可追溯到 sha。
2. `node scripts/build.mjs` 构建前端；构建失败就停在这里，线上保持旧版本。
3. `bash scripts/deploy-kn10.sh`：跑 `tests/server.test.mjs` 和 `tests/hermes.test.mjs`，生成新 release 目录，切 `current` 软链，重启服务，验收 `/api/health` 200、`/dashboard/overview` 200、`/api/providers` 401。
4. 打印 `PUBLISHED commit=... release=... duration=...`。

**没有任何定时任务或后台轮询**。不叫我，就不会有任何东西自己上线。

## 前置确认（我会先查这几项）

- 共享盘 `R:\10router-web` 的改动是否已经同步到 KN10 的 `~/10router-web`。共享盘就是镜像源，KN10 那侧只读；如果某次改动没同步过去，得先补同步再上线。
- `curl http://127.0.0.1:20128/api/health`（10router 后端）是否为 200。

## 关键路径

| 用途 | 路径 |
| --- | --- |
| 源码（唯一真相，agent 改这里） | `R:\10router-web` |
| KN10 发布基线仓库 | `/home/meet/10router-web`（git 仓库） |
| 当前线上版本 | `/home/meet/.local/share/10router-web/current`（软链） |
| 历史 release | `/home/meet/.local/share/10router-web/releases/<时间戳>` |
| 每次发布的备份 / 验收记录 | `/home/meet/backups/10router-web/<时间戳>` |

## 排障与回滚

```bash
# 看这次上线了哪些文件
cd ~/10router-web && git log --oneline | head -5 && git show --stat HEAD

# 追某个文件是哪个 agent 哪次改的
git log -p -- src/pages/CorePages.jsx

# 回滚到上一个版本
systemctl --user stop 10router-web.service
ln -sfnT "$(cat ~/backups/10router-web/<时间戳>/previous-release)" ~/.local/share/10router-web/current
systemctl --user start 10router-web.service
curl --noproxy '*' -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4317/api/health
```

`deploy-kn10.sh` 自带失败回滚：测试不过、服务起不来、验收不通过，都会把 `current` 指回上一版并恢复 systemd 单元，同时把过程留在 `/home/meet/backups/10router-web/<时间戳>/`。

## 已知边界与风险

1. 共享盘 `R:\10router-web` 没有版本控制，agent 之间仍可能互相覆盖文件；git 只记录结果，不记录谁覆盖了谁。要根治需改成分支制（每个 agent 独立 worktree + 分支）。
2. 构建能过但界面有 bug 的新版本仍会正常上线，用上面的回滚命令处理。
3. 只服务 KN10，不推 GitHub（本机直连 github.com 的 KEX 协商不兼容）。
4. `dist/` 是构建产物，被 git 忽略，不参与发布。

## 本机开发（Windows）

共享盘的 `node_modules` 装的是 Windows 原生依赖，本机直接 `node scripts/build.mjs` 会因为缺 `@rollup/rollup-win32-x64-msvc` 而失败。请用专用工具链目录：

```powershell
$env:TENROUTER_TOOLCHAIN_DIR = 'C:\Users\20449\.codex\tmp\10router-web-runtime'
$env:CHOKIDAR_USEPOLLING = 'true'
node scripts/build.mjs
```

KN10 侧构建工具链已修好：`~/10router-web/.npmrc` 设了 `omit=optional`，`package.json` 显式声明了 `@rollup/rollup-linux-x64-gnu`、`@esbuild/linux-x64`、`lightningcss-linux-x64-gnu`、`@tailwindcss/oxide-linux-x64-gnu` 四个 Linux 原生依赖；构建约 7 秒完成。
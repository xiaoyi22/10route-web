# 10router-web 统一上线手册（手动触发版）

## 一句话流程

改完代码 → 跟我说「上线」→ 我在 KN10 上跑一条命令 → 60 秒内自动完成
同步已验收源码、构建、测试、切流、验收；切流后失败自动回滚，构建或测试失败不动线上。Git 提交、部署重启和真实签到分别授权，部署授权不默认包含 Git 提交或真实签到。

## 上线命令（不自动提交 Git）

```bash
ssh -i C:/Users/Meet/.ssh/id_ed25519 meet@192.168.11.150
cd /home/meet/10router-web && node scripts/build.mjs && bash scripts/deploy-kn10.sh
```

上线前先备份并同步已验收改动，核对源文件哈希。上述命令依次构建、测试、发布和验收，任何一步失败立刻停止：

1. 将当前 Windows 工作目录的已验收改动同步到 `~/10router-web`，记录基线 commit、改动文件哈希及源码备份；没有单独确认时不提交 Git。2026-10-08 实测当前目录为 `E:\10reoute-web`，本机没有 `R:` 映射，不能假定共享盘自动同步。
2. `node scripts/build.mjs` 构建前端；构建失败就停在这里，线上保持旧版本。
3. `bash scripts/deploy-kn10.sh`：运行服务、Hermes、系统信息及签到相关测试，生成新 release 目录，切 `current` 软链，仅重启前端服务，验收 `/api/health` 200、`/dashboard/overview` 200、`/api/providers` 401。
4. 打印 `RELEASE=...` 和 `BACKUP=...`；上线后核对运行时代理配置、源码哈希、真实页面与只读接口。`scripts/publish.sh` 会自动提交 Git，只有 Git 提交已单独授权时才可使用。

**没有任何定时任务或后台轮询**。不叫我，就不会有任何东西自己上线。

## 前置确认（我会先查这几项）

- 当前工作目录的改动是否已同步到 KN10 的 `~/10router-web`，远端是否存在其他未提交改动；以文件哈希实测为准，不依赖旧共享盘路径。KN10 源码只接收已验收文件，不在远端顺手改代码。
- `curl http://127.0.0.1:20128/api/health`（10router 后端）是否为 200。

## 关键路径

| 用途 | 路径 |
| --- | --- |
| 当前 Windows 源码（agent 改这里） | `E:\10reoute-web`；换机后先实测，不假定共享盘映射 |
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
$env:TENROUTER_TOOLCHAIN_DIR = 'C:\Users\Meet\.codex\tmp\10router-web-runtime'
$env:CHOKIDAR_USEPOLLING = 'true'
node scripts/build.mjs
```

KN10 侧构建工具链已修好：`~/10router-web/.npmrc` 设了 `omit=optional`，`package.json` 显式声明了 `@rollup/rollup-linux-x64-gnu`、`@esbuild/linux-x64`、`lightningcss-linux-x64-gnu`、`@tailwindcss/oxide-linux-x64-gnu` 四个 Linux 原生依赖；构建约 7 秒完成。

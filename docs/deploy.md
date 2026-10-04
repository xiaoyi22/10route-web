# 10router-web 多 Agent 统一部署手册

## 现状（2026-10-04 建立）

- 源码目录：Windows 共享盘 `R:\10router-web`（`\\192.168.11.150\meet\10router-web`），多个 agent 直接改这里的文件。
- KN10 上的 `~/10router-web` 是**从共享盘同步过来的副本**，不是独立工作区。
- 之前没有版本控制：`R:\10router-web` 和 KN10 上都没有 `.git`，无法追溯哪次上线是哪份代码。
- 现在 KN10 的 `~/10router-web` 已初始化为 git 仓库，作为**发布基线**，自动流水线每 60 秒对比一次共享盘，只读取、不修改共享盘。

## 部署链路

```
agent 改 R:\10router-web 的文件
        ↓ (共享盘，agent 无需做任何额外操作)
KN10 上的 publish-watch 服务每 60s 计算源码树 sha256
        ↓ 有变化才继续
git add -A && git commit        ← 每次上线都有 commit sha 可追溯
        ↓
node scripts/build.mjs          ← 构建失败则不上线，线上保持旧版
        ↓
bash scripts/deploy-kn10.sh     ← 全量测试 + release 目录 + 软链切换 + 失败自动回滚
        ↓
4317 端口验收：/api/health 200、/dashboard/overview 200、/api/providers 401
```

一次完整发布约 2~3 分钟（构建 ~10s，测试 ~1s，起服务 + 验收 ~10s，其余为 60s 轮询间隔）。

## 关键路径

| 用途 | 路径 |
| --- | --- |
| 源码（唯一真相，agent 改这里） | `R:\10router-web` |
| KN10 发布基线仓库 | `/home/meet/10router-web`（git 仓库） |
| 当前线上版本 | `/home/meet/.local/share/10router-web/current`（软链） |
| 历史 release | `/home/meet/.local/share/10router-web/releases/<时间戳>` |
| 每次发布的备份/验收记录 | `/home/meet/backups/10router-web/<时间戳>` |
| 自动发布日志 | `/home/meet/.local/share/10router-web/logs/watch.log` |

## 常用操作

```bash
ssh -i C:/Users/20449/.ssh/id_ed25519_tscompany meet@192.168.11.150
```

```bash
# 看最近发布了什么
tail -40 ~/.local/share/10router-web/logs/watch.log

# 看某次上线的代码
cd ~/10router-web && git log --oneline | head -10
git show --stat HEAD

# 追问某个文件是谁哪次改的
git log -p -- src/pages/CorePages.jsx

# 手动立即发布一次（不用等 60 秒）
cd ~/10router-web && bash scripts/publish-watch.sh --once

# 暂停自动发布
systemctl --user stop 10router-web-publish.service

# 恢复自动发布
systemctl --user start 10router-web-publish.service

# 回滚到上一个版本
systemctl --user stop 10router-web.service
ln -sfnT "$(cat ~/backups/10router-web/<时间戳>/previous-release)" ~/.local/share/10router-web/current
systemctl --user start 10router-web.service
curl --noproxy '*' -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4317/api/health
```

## 已知边界与风险

1. **共享盘没有版本控制**。agent 仍可能互相覆盖文件，覆盖之后 git 只记录“结果”，不记录“谁覆盖了谁”。若要彻底避免，需要改成分支制（每个 agent 独立 worktree + 分支，人工合并后再发布）。
2. **构建成功但界面有 bug 时新版本仍会上线**。回滚办法见上，release 目录和 `previous-release` 记录都在。
3. **暂存时间窗**：文件正在被写入的瞬间如果刚好触发发布，会把写了一半的代码构建上去。构建通常失败并自动中止（线上保持旧版）；若恰好构建成功，回滚即可。
4. **只同步到 KN10，不推 GitHub**。本机 git 连不上 github.com（服务端 KEX 协商不兼容），10router 主仓库走的是 https + 本机 7890 代理。
5. **KN10 上的 `dist/` 是构建产物**，被 git 忽略；Windows 共享盘的 `dist/` 是本机构建结果，不参与发布。

## 本机开发

共享盘上的 `node_modules` 在当前这台机器上装的是 Windows 原生依赖（rollup 是 `@rollup/rollup-win32-x64-msvc`），且本机 `node_modules/rollup/package.json` 缺少 `optionalDependencies`，因此**本机直接跑 `node scripts/build.mjs` 会失败**（`Cannot find module @rollup/rollup-win32-x64-msvc`）。

本机构建请使用专用工具链目录：

```powershell
$env:TENROUTER_TOOLCHAIN_DIR = 'C:\Users\20449\.codex\tmp\10router-web-runtime'
$env:CHOKIDAR_USEPOLLING = 'true'
node scripts/build.mjs
```

该目录下的依赖与本机架构匹配，构建产物经逐文件 MD5 比对与 KN10 上的构建结果完全一致。

KN10 侧的构建工具链已经修好：`~/10router-web/.npmrc` 里设置了 `omit=optional`，并在 `package.json` 中显式声明了 `@rollup/rollup-linux-x64-gnu`、`@esbuild/linux-x64`、`lightningcss-linux-x64-gnu`、`@tailwindcss/oxide-linux-x64-gnu` 四个 Linux 原生依赖，避免共享盘上 Windows 的 `node_modules` 把 Linux 构建卡死。
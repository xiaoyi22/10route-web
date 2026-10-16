# 第一批移植实施记录（v1.5.0 → 现网 1.4.0）

日期：2026-10-16
范围：第一批 5 项（视觉能力兜底、Qoder 视觉、AG 精确冷却、Gemini 能力声明、耗尽包提取器）
上游目标：`689be5c9f408eabc22bc65a8faa203a8d490f3b2`（v1.5.0）
生产基线：分支 `upgrade-v1.4.0-run`，改动前 HEAD `baae1a49a64bfa72764ea614eeaa85ce45c54adf`，BUILD_ID `ABVOEyMzMRnVWFiD6ak4d`

## 改动文件

| 文件 | 来源提交 | 处理方式 | 结果哈希（前16位） |
| --- | --- | --- | --- |
| `open-sse/services/usage/expiryExtractor.js` | `47f5d132a9c7`（仅提取器部分） | 整体取目标版，不含接力调度 | `89f2c382086764c0` |
| `open-sse/providers/capabilities.js` | `e578dcd045d1` + `fdfacf290fbc` | 整体取目标版（本地=基线，无定制） | `82eebfd4cdc12e54` |
| `open-sse/providers/registry/antigravity.js` | `bb92dad23e81` | 整体取目标版（本地=基线） | `7616f23aea0b6b07` |
| `open-sse/executors/antigravity.js` | `bb92dad23e81` | 人工合并：保留本地更完整的 `parseError`，补入上游 409 分支 | `7d871713cfeaa38b` |
| `scripts/audit-capabilities.mjs` | `e578dcd045d1` | 补入 `canonical_ci` 解析步骤，与解析器保持一致 | `0f3a27f7ae55733` |
| `deploy.sh` | 本批登记 | 新增 7 条 PATCH_CHECKS（文件被 .gitignore 忽略） | — |

## AG 执行器合并说明

本地 `parseError` 已支持：429 严格消息校验、`quotaResetTimeStamp`、`quotaResetDelay`（Go 时长）、`retryDelay`、消息文本兜底。上游新增版是其子集，仅多出 409 状态码。合并只在本地版上补 409 分支，不降级本地能力。

行为验证（真实调用合并后的类）：
- 409 + 重置时间戳 → `resetsAtMs` 正确提取，`status:409`
- 429 瞬时错误（无配额文案）→ 不锁定账号，走退避
- 429 配额错误 → `resetsAtMs` 正确提取，`status:429`

## 验证结果

- 定向测试：6 个文件 42 项通过（capabilities / qoder-capabilities / earliest-expiry-first / expiry-countdown-format / antigravity-retry-hook / antigravity-quota-policy）
- 上游新测试：`earliest-expiry-first` 14 项、`qoder-capabilities` 7 项通过；`gemini4-argon-caps` 的能力断言通过，2 项定价断言因 `pricing.js` 未在本批移植而失败（属预期，`pricing.js` 由 `a7f3f444` River AI 提交引入）
- 全量单元测试：改动前 112 失败 / 改动后 112 失败，新增 0、消失 0
- 构建：`npm run build` 成功，无错误，BUILD_ID `7G3Jb2mm8xihLn3535UFk`
- PATCH_CHECKS：本批新增 7 条全部命中源码

## 一处中途回归及修复

首次全量测试出现 1 个新增失败：`capability-floor-allowlist.test.js` 的"审计链与解析器一致"断言。原因是 `scripts/audit-capabilities.mjs` 的 `resolveStep` 是解析链副本，未同步上游新增的大小写兜底步骤。补入 `canonical_ci` 后该测试通过，全量对比回到零新增失败。

## 备份

目录 `/home/meet/10router-adopt-v150-20261016-batch1/`：
- `baseline-repo.bundle`（改动前全量 Git）
- `standalone-backup.tar.gz`（改动前运行包）
- `standalone-batch1-new.tar.gz`（新构建运行包）
- `db/data-consistent.sqlite`（SQLite backup API，integrity_check ok，12 表）
- `systemd/`（两个用户级单元）、`env.bak`
- `pre-change/`、`batch1-changed/`（4 个源码文件前后副本）
- `after-change-hashes.txt`

## 上线记录（2026-10-16 10:10:33）

用户确认后执行 `systemctl --user restart 10router.service`：

| 项目 | 结果 |
| --- | --- |
| 重启前 PID | 182869（旧构建，10-15 16:04 启动） |
| 重启后 PID | 557654，`ExecMainStartTimestamp` 10:10:33 CST |
| 服务状态 | `10router.service` 与 `10router-web.service` 均 active |
| 运行构建 | BUILD_ID `7G3Jb2mm8xihLn3535UFk`，进程 cwd 指向 `.next/standalone` |
| 健康接口 | HTTP 200，`{"ok":true,"driver":"better-sqlite3"}` |
| 前端入口 | HTTP 200 |

上线后只读核对：
- `GET /api/settings` HTTP 200，`codebuddy-cn` 仍为 `earliestExpiryFirst=true`、`round-robin`、sticky 3，调度策略未被本次改动影响（C04 冲突点未被误触）。
- `GET /api/models/distribution` HTTP 200，`mode=allowlist`，31 条。
- 模型目录 HTTP 200，381559 字节；`gemini-4` 未出现（AG 注册表未收录，符合预期）。

端到端真实生成（走网关，使用活跃 API Key）：
- `nexa/deepseek-v4.1-flash` → HTTP 200，2.52s，返回 `OK`，usage 10 tokens。
- `ag/gemini-3.8-flash` → HTTP 200，4.37s，返回 `OK` 并带 `reasoning_content`，证明 Antigravity 执行器（含本批合并的 `parseError`）在线正常。
- `fs/gemini-4-argon` → HTTP 503，上游 fs 线路无可用通道（上游侧状态，非网关缺陷）。

稳定性：重启后 4 分钟内发起 28 次请求、完成 26 次；未完成 2 次为代理连接超时自动回退直连，属既存容错路径。日志中的 `Controller is already closed` 在重启前旧进程上同样存在，为客户端主动断开（`ResponseAborted`）时的既存行为，非本批引入。

回退入口：`/home/meet/10router-adopt-v150-20261016-batch1/standalone-backup.tar.gz`（改动前运行包）与 `baseline-repo.bundle`（改动前 Git）。
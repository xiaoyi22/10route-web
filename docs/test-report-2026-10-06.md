# 全量测试报告（2026-10-06）

分支 master · HEAD `4df6e2e`（share sync）· Node v24.21.0 · 入口：4317/4321 真实网关、4318 隔离演示（测后已关闭）

## 一、结论

| 判定 | 内容 |
| --- | --- |
| ✅ 产品代码 | 单元、构建、演示浏览器回归、生产冒烟、真实网关只读巡检全部通过，未发现产品缺陷 |
| ⚠️ 测试过期 ×2 | `tests/client.test.mjs:56` 断言过期（npm test 必失败 1 项）；`core-browser.mjs` 等待时长与 30 秒自动刷新不匹配（全量跑必超时） |
| ⛔ 环境阻塞 ×4 | cli-live / oauth-live / settings-recovery-live / distribution-e2e 依赖 KN10 隔离验收副本（4319/4320/20129），本次未拉起 |
| ❓ 待定 ×1 | provider-routing-live 两次在 codebuddy-intl 截图步骤挂起，最小复现无法重现，疑似环境抖动 |

## 二、执行明细

### 单元测试 `npm test`
35 通过 / 1 失败。失败项 `core management permits only verified routes and methods`：
- 根因：今日 share sync `87b902d` 合入 PricingPage，并在 `src/api/policy.js:50` 放行 `/api/pricing` 的 PATCH/DELETE（`management` 门槛内，与后端语义一致，**无越权风险**）；`tests/client.test.mjs:56` 仍断言 `PATCH → false`。
- 定性：断言过期，非安全问题。修复方向：改为断言 `true`，并补一条 `PATCH false（未登录管理）→ false` 的负例。

### 生产构建
`npm run build` 通过（2m31s），无 650kB 体积警告（上次验收记录中的警告已消除）。

### 隔离演示后端（4318）浏览器回归 —— 14 项
browser、balances、balances-cards、model-usage、models-disabled、monitor、provider-errors、provider-routing、token-cache、tps、upstream-models-ui、usage-log、hermes-browser、proxy-performance：**全部 PASS**。

core-browser 全量跑 FAIL，五个 section（keys/providers/models/logs/layout）单独跑全 PASS。
- 根因：`CorePages.jsx:202` 概览自动刷新间隔 30 秒（`94bc443` 2026-10-04 引入），`core-browser.mjs:253` 修改 mock 数据后仅等待 8 秒即断言新值。
- 定性：测试时序缺陷。修复方向：等待窗口调到 35 秒，或给测试提供可控刷新触发。

`hermes-vite-worker.mjs` 是 IPC worker，仅能经 `fork` 调用（已被 hermes-browser 等覆盖通过），单跑报 `process.send is not a function` 属预期，不计缺陷。

### 真实网关（只读）
- `production-smoke http://127.0.0.1:4317`：PASS（健康、登录保护、深链、桌面/移动、资源、无未捕获异常）。
- `real-backend-browser`：PASS（真实登录 UI、桌面/移动、无 JS 错误）。
- `admin-live-browser`、`settings-live-browser`：PASS（写操作前自动备份，符合红线 4）。
- `quota-live-browser`：PASS（只读；须 `--password-stdin` 传凭据——脚本默认路径 `R:/10router/.env` 的 INITIAL_PASSWORD 已失效，属已知问题）。
- `subscription-live-browser`：PASS（`SUBSCRIPTION_VERIFY_ONLY=1` 只读模式；真实更新机场订阅未执行，避免动生产节点）。
- `provider-routing-live-browser`：**待定**。两次运行均停在 `codebuddy-intl` 的视口/主题截图步骤（超 10 分钟无输出），期间服务端 `/api/providers`、`/api/settings` 均 0.1 秒响应；最小复现（登录→导航→表单可见 939ms，无控制台错误）正常。前 3 个供应商（codebuddy-cn/antigravity/qoder，7 个真实账号）核对全部通过。建议单独重跑该脚本或把截图步骤拆细定位。

### 环境阻塞（4 项）
`cli-live-browser`、`oauth-live-browser` 强制 4319，`distribution-e2e` 强制 4320+20129，`settings-recovery-live` 强制 4319。4319/4320 为 KN10 隔离验收副本（`10router-web-acceptance-20261005-051141.service` + SSH 隧道，见 docs/full-integration.md），当前未启动，脚本硬断言拒绝在生产 4317/4321 上跑写测试（保护逻辑符合预期）。

### 过程事件
本地 4317 端口转发进程在测试中途退出（502/ECONNREFUSED），远端 `192.168.11.150:4317` 全程正常；quota/subscription/routing 改经 4321（`scripts/dev.mjs` 后端接入模式，better-sqlite3 真实网关）完成，未影响结论。

## 三、测试计划

### P0 —— 修复过期测试（约 2 行改动）
1. `tests/client.test.mjs:56`：`/api/pricing` PATCH 断言 `false → true`，并补 `management=false` 负例；跑 `npm test` 验证 36/36。
2. `tests/core-browser.mjs:253`：等待 8000ms → 35000ms（或注入即时刷新钩子）；全量 `node tests/core-browser.mjs` 验证一次通过。

### P1 —— 补齐被阻塞的 live 验收
1. 拉起 KN10 隔离副本：确认 `10router-web-acceptance-*.service` 与 SSH 隧道（20129/20131 → 本地 4319/4320）。
2. 依次跑 `settings-recovery-live`（4319）、`cli-live-browser`（4319）、`oauth-live-browser`（4319）、`distribution-e2e`（4320）。
3. `provider-routing-live` 单独重跑一次；若仍在同一处挂起，把 `setViewportSize + selectOption + screenshot` 拆步加日志，区分 Playwright 截图与主题切换。
4. `subscription-live` 全量（真实更新订阅）模式需工程师确认后执行。

### P2 —— 防回归改进（需工程师确认后再动）
1. `package.json` 增加分层入口：`test:unit` / `test:demo-browser` / `test:live-readonly`，避免误在生产入口跑写测试或漏跑。
2. `quota-live-browser` 默认凭据路径从失效的 `R:/10router/.env` 改指 `~/.codex/credentials/10router-web.env`（与其他 live 脚本对齐）。
3. 4317 隧道进程加守护或告警（本次测试中静默死亡，靠 502 才发现）。
4. 概览自动刷新间隔提为常量并在测试中引用，消除 30 秒/8 秒这类魔数耦合。

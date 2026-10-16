# 第二批移植实施记录（接力调度，2026-10-16）

范围：接力调度（C04 冲突的核心项）
上游来源：`47f5d132a9c79f4c0c65239038c9c6608b2ccbf4`（v1.5.0）
本批前基线：BUILD_ID `7G3Jb2mm8xihLn3535UFk`，PID 557654

## C04 冲突的处理决定

上游把"到期优先排序"和"单点接力死磕"绑在同一个开关 `earliestExpiryFirst` 上。直接照搬会让 `codebuddy-cn`（现网唯一开启该开关的供应商，3 个账号、轮询粘性 3）立刻从"分摊负载"变成"单账号死磕"。

现网实测又确认了一个关键事实：**CodeBuddy 三个账号的 `earliestPackageRemaining` 均为空**（其配额是一次性赠送包，没有百分比信号）。接力算法在信号为空时把账号一律视为健康，因此接力会长期粘在同一账号直到上游 429 —— 与现有轮询行为差异极大，属于不可接受的行为突变。

处理方式：**把接力拆成独立开关 `relayScheduling`**。

- `earliestExpiryFirst` 保留原义：仅决定环的排序（按到期时间升序）。
- `relayScheduling` 是接力的显式开关，默认关闭。
- 上游那条"开关开启时优先于 round-robin"的分支改为由 `relayScheduling` 触发。

这样既拿到接力能力，又不动任何现有供应商的行为。上游的接力实现本身是纯函数，无歧义，直接采用。

## 改动文件

| 文件 | 处理 | 结果哈希（前16位） |
| --- | --- | --- |
| `open-sse/services/relaySelection.js` | 新增，整体取上游目标版（109 行纯函数） | `9e791e6b702e36b3` |
| `src/sse/services/auth.js` | 加 import、加 `relayScheduling` 开关、加接力分支（条件改为 `relayScheduling`）、补红区信号持久化 | 见 `batch2-hashes.txt` |
| `src/lib/db/repos/connectionsRepo.js` | `OPTIONAL_FIELDS` 增加 `earliestPackageRemaining` | 见 `batch2-hashes.txt` |
| `deploy.sh` | 新增 5 条 PATCH_CHECKS | — |

未移植：`open-sse/services/usage/minimax-code.js`（国内版无此文件，且 CodeBuddy 走不到该路径）。

## 验证结果

接力纯函数 13 项通过（上游 `relay-carrier-selection`），覆盖：无历史选环首、健康保持、红区前滚、已回血不插队、无剩余信号、单账号。

集成测试 6 项通过（改写自上游 `relay-auth-wiring`），其中新增一条 C04 防回归用例：仅开 `earliestExpiryFirst` 时必须走轮询（写入 `consecutiveUseCount`）而非接力（只写 `lastUsedAt`）。

手工行为核对（直接调用纯函数）：

| 场景 | 结果 |
| --- | --- |
| 无历史 | 选环首，stepped=false |
| 承运账号剩余 60% | 保持，不切回更早账号 |
| 承运账号剩余 3%（红区） | 前滚到下一个，stepped=true |
| 环中账号承运、前序已回血 100% | 仍保持当前，不插队 |
| 剩余信号为空（CodeBuddy 现状） | 持续承载直到 429 |
| 单账号 | 直接返回 |

全量单元测试：本批前 107 失败 / 本批后 107 失败，新增 0、消失 0。

构建：`npm run build` 成功，BUILD_ID `XMVseKZnsbELP5FkvobpS`。
PATCH_CHECKS：本批新增 5 条全部命中源码。

## 上线记录（10:28:51）

| 项目 | 结果 |
| --- | --- |
| 重启前 PID | 557654（第一批构建） |
| 重启后 PID | 573650，10:28:51 CST |
| 服务状态 | 两服务 active |
| 构建 | `XMVseKZnsbELP5FkvobpS` |
| 健康 | HTTP 200 |

上线后核对：

- `GET /api/settings` HTTP 200，`relayScheduling` 在全部供应商上**未设置**，接力未被自动开启。
- `codebuddy-cn` 仍为 `earliestExpiryFirst=true`、`round-robin`、sticky 3，与上线前一致。
- 重启后 2 分钟内 11 次请求全部完成（11/11），无新增错误类型。
- 真实生成：`cbcn/deepseek-v4.1-flash` → 200（1.27s，返回 OK）；`ag/gemini-3.8-flash` → 200（5.87s，返回 OK 带 reasoning_content）。CodeBuddy 在调度改动后首次真实调用成功，证明轮询路径完好。

回退点：`standalone-batch1-live.tar.gz`（第一批构建）。

## 后续

接力已具备但不启用。若要为某供应商开启，需在设置中显式设 `relayScheduling: true`，并注意：该供应商必须有可用的 `earliestPackageRemaining` 信号，否则会退化为"单账号烧到 429"。开闸前建议先在隔离环境验证红区换手。
# 第三批实施记录（Rerank 与接入缺口盘点，2026-10-16）

范围：C06 Rerank（完成）、C05 Key 白名单（待决策）、C07 外部额度（待决策）、C08 MiniMax Code（待决策）
本批前基线：BUILD_ID `XMVseKZnsbELP5FkvobpS`，PID 573650

## 现状盘点（决定顺序的依据）

| 项 | 上游规模 | 现网条件 | 判断 |
| --- | --- | --- | --- |
| C06 Rerank | 3 新文件 + 4 处 provider 配置 + 前端放行 | 无 Cohere/Jina/SiliconFlow 连接 | 纯新增能力，无副作用，已做 |
| C05 Key 白名单 | schema 2→3 加 2 列 + repo + 路由 + 前端编辑界面 | 4 个活跃 API Key | 有数据可验收，但含 DB 结构变更 |
| C07 外部额度 | 2 个新文件 486 行 + 多处改动 | 近 7 天零外部推送，无推送方 | 做了无法验收，建议等推送方就位 |
| C08 MiniMax Code | 4 个新文件约 400 行 + 前端 OAuth | 无任何 MiniMax 连接 | 做了无法验收，建议等订阅就位 |

## C06 Rerank 实施

上游提交 `ae0c6571`（重排序类别与 /v1/rerank 端点）。

新增：
- `open-sse/handlers/rerankCore.js`（139 行，整体取上游）
- `src/sse/handlers/rerank.js`（149 行，整体取上游后加分发闸门）
- `src/app/api/v1/rerank/route.js`（21 行，整体取上游）

修改（均为本地=基线的干净文件，直接取目标版）：
- `open-sse/providers/index.js`：导出字段表加 `rerankConfig`
- `open-sse/providers/registry/cohere.js`：加 `serviceKinds` 与 `rerankConfig`
- `open-sse/providers/registry/jina-ai.js`：同上
- `open-sse/providers/registry/siliconflow-cn.js`：同上 + 两条 rerank 模型

C06 修复（上游缺口）：上游 v1.5.0 的 rerank handler 未调用 `enforceDistribution`，与 systemone/tts/videoGeneration 不一致，会让 rerank 调用绕过分发白名单直达上游账号。已在 `getModelInfo` 校验之后、凭据循环之前补上闸门，位置与其它 handler 相同。

独立前端（本仓库）：`src/api/policy.js` 只放行了 `/api/v1/chat/completions` 与 `/api/v1/audio/speech`，未放行 `/api/v1/rerank`。已加一行放行。网关侧 `/home/meet/10router-web/src/api/policy.js` 同步同一行（该仓库为独立历史，仅最小插入，未改动其它差异）。

## 验证结果

- `rerank-core` 15 项通过（上游测试）
- 全量单元测试：本批前 107 失败 / 本批后 107 失败，新增 0、消失 0
- 后端构建：成功，BUILD_ID `VdQnPykNJCoKeRQf05TIn`
- 前端测试：138 项通过；前端构建成功
- PATCH_CHECKS：本批新增 7 条全部命中源码

## 上线记录（10:44:32）

| 项目 | 结果 |
| --- | --- |
| 重启前 PID | 573650 |
| 重启后 PID | 588857 |
| 服务 | 两服务 active |
| 健康 | HTTP 200 |
| Rerank 路由 | `OPTIONS /api/v1/rerank` 200（路由存在）；无 Key POST 返回 401 鉴权拦截（非 404） |
| 重启后请求 | 14 发起 / 13 完成，无新增错误 |

回退点：`standalone-batch2-live.tar.gz`（第二批构建）。

## 待决策

**C05 Key 白名单**：改动会让 API Key 的模型/Combo 白名单真正生效（当前 schema 无这两列，功能不存在）。schema 变更为纯增列（`ALTER TABLE ADD COLUMN`，由 `syncSchemaFromTables` 在启动时自动执行），不改动现有数据。需要确认后再做，并需同时补独立前端的编辑界面，否则无法配置。

**C07 外部额度**：现网无推送方，近 7 天零请求。建议等 CreditDaddy / LongCat 等伴侣服务确定要接时再做，否则无法验收。

**C08 MiniMax Code**：现网无任何 MiniMax 连接。建议有订阅后再做。

另需注意：Rerank 端点已上线，但现网**无 Cohere / Jina / SiliconFlow 连接**，因此当前无模型可用；配置任一供应商的 Key 后即可使用。
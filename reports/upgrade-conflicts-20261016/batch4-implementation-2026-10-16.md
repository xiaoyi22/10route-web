# 第四批实施记录（C05 Key 白名单 + 上游幽灵节点过滤，2026-10-16）

范围：C05 API Key 模型/Combo 白名单（完成，前后端）、上游幽灵节点过滤（完成，前端 161a293d 移植）共两层。
本批前基线：BUILD_ID `VdQnPykNJCoKeRQf05TIn`，PID 588857（第三批末）

## C05 Key 白名单（后端）

上游提交 `161a293d` 相关能力（schema 2→3 两列）。本地可服务 `689be5c9` 目标实现核对后最小移植：

- `src/lib/db/schema.js`：`SCHEMA_VERSION = 3`，`api_keys` 增 `allowedModels`/`allowedCombos` 两列；`syncSchemaFromTables` 启动自动 `ALTER TABLE ADD COLUMN`，不动现有数据
- `src/lib/db/apiKeysRepo.js`：`normalizeWhitelist`（支持换行/逗号分隔、通配与 `*` 语义、空名单=不限制）+ 创建/修改/读取/旋转（rotate 路由同样携带白名单）
- `src/lib/db/index.js`：export/import 备份路径枚举新列（迁移前 `backupSchemaVersion=3` 已备份）
- `src/sse/services/auth.js`：`checkApiKeyModelAccess`，拒绝时 403 + `x-router-error: model_not_allowed`
- `src/sse/handlers/chat.js`：聊天入口接入（分发 allowlist 之后、bypass 之前）
- `/api/v1/models`：按 Key 白名单过滤目录（buildModelsList 之后）
- `/api/keys` POST/PUT：接收白名单字段
- `deploy.sh` PATCH_CHECKS 追加 9 条

验证：
- 全量回归：本批前 112 失败 / 本批后 112 失败，新增 0、消失 0（combo-sticky-handlers 16 条为历史既存失败）
- 定向：`_b4-whitelist.test.js`（上游版）4 项通过；`api-key-daily-limit-wiring.test.js`（上游版）15 项通过
- 后端构建成功，BUILD_ID `8_2d95tPjd3V5sHZaBckp`，健康 200
- 端到端：创建 201 / 删除 200；目录过滤 34→2；未授权已发布模型 403 + `model_not_allowed`；授权模型真实生成 200

## C05 Key 白名单（独立前端）

- `src/api/providers.js`：幽灵节点过滤（`if (!info.custom && !providerNames[info.id]) continue`，上游 161a293d 行为移植）
- `src/pages/CorePages.jsx`：CreateKey 增加“允许模型/允许 Combo”两个 textarea；新增 EditKey 组件（每 Key 行“编辑权限”按钮打开独立编辑弹窗）；`splitLines` 辅助
- 前端测试 138 项通过；前端构建成功；policy.js 同步到网关（含 Rerank 放行）

## 上线记录（12:29-12:30）

| 项目 | 结果 |
| --- | --- |
| 前端 release | `20261016-122957`（`deploy-kn10.sh` 发布，46 项部署测试通过，health 200） |
| 后端 | 已上线，PID 658171 |
| 服务 | 两服务 active，健康 200 |
| 备份 | 后端 `/home/meet/10router-adopt-v150-20261016-batch1/batch4-pre/` + `deploy.sh .bak-20261016-1205`；前端 `/home/meet/backups/10router-web/pre-b4-20261016-1220/` |

## 编辑 UI 最终验收（12:45，真实入口 192.168.11.150:4317）

早期巡检报 `endpoint_has_edit_permission: false`，复查确认为旧验收脚本断言缺陷：`IconButton` 文案只渲染进 `title`/`aria-label`，`body.inner_text` 取不到；按钮实际存在。改为按 aria-label 断言后全绿：

| 断言 | 结果 |
| --- | --- |
| 创建带白名单 Key（模型+Combo） | 201，回读白名单一致 |
| 端点页“创建密钥”按钮 | 存在（管理 UI 生效） |
| 每 Key 行“编辑权限”按钮 | 存在，共 5（4 现有 + 1 临时） |
| 编辑弹窗标题/回填 | `编辑权限 · <名>`，允许模型/允许 Combo 与创建值一致 |
| 弹窗改白名单保存 | PUT 200，API 回读新增模型已生效，Combo 保留 |
| providers 页幽灵节点 | 无 gorouter 卡片（过滤生效），供应商页正常加载 |
| 控制台 | 无未捕获错误 |
| 清理 | 临时 Key 已删（200），现有 4 个 Key 未动、白名单均为空（不限制） |

真实 4 个 Key（Default Key / dsh / mirasim / codex）未配置白名单，保持原“不限制”语义，无行为变化。

回退点：后端 `standalone-batch3-live.tar.gz`；前端 release `pre-b4` 备份与 `deploy-kn10.sh` 的 rollback 分支。
# 账号模型范围验收

2026-10-21：已上线到 `http://192.168.11.150:4317`，完成真实账号范围保存、DeepSeek 发布及路由验收。DeepSeek 上游仍间歇返回 HTTP 429，不能据此宣称所有调用始终可用。

发布版本：`20261021-095519`。线上源码提交：`534239660e40f7432d8164d9583b7d9c9f79fa9a`。生产源码 `main` 已快进到该提交，构建产物与已发布版本保持一致。

## 已实现

- 自建 OpenAI / Anthropic 兼容节点支持逐账号查看、编辑、解除模型范围。
- 供应商列表和详情页支持按所选账号批量同步，分别保存各 key 的完整模型列表。
- 导入模型时默认同步当前账号范围，可以取消勾选；已登记的模型也能单独同步账号范围。
- 空列表、无效列表、上游错误和超时不会覆盖旧范围；单个失败不阻断其他账号。
- 上游目录、供应商模型登记、账号范围和下游发布分别处理，模型表显示发布状态。

模型范围使用现有 `PUT /api/providers/:id` 的 `providerSpecificData.enabledModels`，后端已有筛选功能，无需修改或重启网关后端。`null` 表示未限定；限定模式禁止保存空列表，因为现有后端也把空数组视为未限定。内置 OAuth 供应商不在本次同步范围内。上游返回全站目录时需手动限定账号范围。

## 验证结果

- `npm.cmd test`：156 / 156 通过，记录在 `unit-tests.log`。
- `npm.cmd run build`：通过，记录在 `build.log`。
- `node tests/account-models-browser.mjs`：批量、手动编辑、空列表保护、导入完整范围、三种屏宽和深浅主题通过，无未捕获异常。
- `node tests/upstream-models-ui-browser.mjs`：既有导入、失败重试、搜索、筛选和布局回归通过。
- `node tests/account-models-live-browser.mjs`：通过。真实网关读取均为 HTTP 200；DP 返回 `deepseek-v4.1-flash`，Default 返回 7 个 GPT 模型。浏览器拦截并审查了三次范围保存请求，没有把配置写入生产；验证前后账号范围和分发清单一致。
- 真实前端 `http://192.168.11.150:4317/api/auth/status` 返回 HTTP 200，要求密码登录，非演示模式。
- 服务器独立工作区在构建后执行 148 项测试全部通过；发布脚本的 46 项检查全部通过。首轮测试与构建并行，因缺少尚未生成的 `dist` 失败；已修正执行顺序并通过回归。
- 线上页面真实写入：Default 保存 7 个 GPT 模型，DP 保存 `deepseek-v4.1-flash`，三个保存接口均返回 HTTP 200。发布清单保留原有 39 项并追加 DeepSeek，合计 40 项。

| 真实调用 | 状态 | 回答 | 日志命中账号 |
|---|---|---|---|
| DeepSeek / Chat 流式 | 200 | OK | DP |
| DeepSeek / Responses 非流式 | 200 | OK | DP |
| DeepSeek / Responses 流式 | 200 | OK | DP |
| GPT-6.1-sol / Chat 非流式 | 200 | OK | aiapi-Default |

完整证据见 `deployment-acceptance.json`、`deployed-browser-acceptance.json` 和各 `routing-*-acceptance.json`。成功请求的连接 ID 已与账号逐一匹配。

DeepSeek / Chat 非流式的两次请求返回上游 HTTP 429 `server_busy`，这一项没有通过；Responses 和直接上游诊断也曾遇到同类 429，之后有成功调用，失败记录保留。未为规避错误改动后端或放宽账号模型范围。日志异步落库约需 5 秒，早期过早读取导致的断言失败已通过读取原请求日志补核，没有为补日志重复发起推理。

## 审查与上线

- `account-models.patch` 只包含本次 11 个文件的改动，已排除工作区原有改动。
- 补丁基于任务开始前的工作区内容，已在独立副本执行 `git apply --check`、应用补丁，并对全部文件逐一校验内容一致。记录见 `patch-acceptance.json` 和 `source-manifest.json`。
- `real-data-import.png` 为真实数据预览截图；`editor-*.png` 为隔离浏览器界面测试截图。
- 部署时发现 5 个线上文件使用 CRLF，已生成保留换行格式的 `account-models-deploy.patch`，检查通过后在独立工作区构建，使用现有发布脚本发布。`account-models-deployed.patch` 对应实际上线源码的完整改动。
- 前端回滚备份：`/home/meet/backups/10router-web/20261021-095519`，其中 `previous-release` 指向 `/home/meet/.local/share/10router-web/releases/20261021-091047`。
- 网关配置备份位于用户私有凭据目录，具体路径记录在 `deployment-state.json`，未放入仓库或报告目录。
- 用户已明确授权“上线然后验证”。仅重启 `10router-web.service`；网关后端未修改、未重启。服务检查为 `active`、`NRestarts=0`，原生产源码工作区保持干净。

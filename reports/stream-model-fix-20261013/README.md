# 流式返回模型与日志色板修复验证

日期：2026-10-13。前端分支 `main`；真实后端 `/home/meet/10router` 分支 `feat/downstream-distribution`，运行架构 x86-64。保留两端已有未提交改动，没有提交。用户随后明确授权上线，前后端均已发布并通过现网验收。

## 修复内容

- 前端 `src/styles.css` 将延迟色板提升到主题变量；日志成功/警告/失败分别使用青绿/明黄/橙色，Token 输入/输出/缓存分别使用明黄/橙色/青绿，覆盖表格和挂载到页面根节点的 Token 浮层。
- 后端 `open-sse/utils/stream.js` 在上游 SSE 事件解析后、过滤和翻译前提取 `model`、`message.model`、`response.model`、`modelVersion`、`response.modelVersion`。非字符串和空白值不覆盖有效模型。
- 正常结束、EOF、客户端取消及断流回调传递 `responseModel`；`streamingHandler.js` 将它交给现有入库及模型差异计算逻辑。未提供上游模型时保持未知，不使用请求模型补造。
- `deploy.sh` 新增 2 条 `PATCH_CHECKS`，关键词 `captureResponseModel` 实测命中 3 次，`contentObj?.responseModel` 实测命中 1 次。
- 项目 `AGENTS.md` 与 Mem0 已记录 Windows PowerShell 使用 `npm.cmd` / `npx.cmd` 的环境约定。

## 验证结果

| 验证 | 结果 |
| --- | --- |
| 修复前流式模型用例 | 14 项失败，1 项通过，复现模型丢失 |
| 后端流式回归 | 5 个测试文件、46 项通过，包括真实临时 SQLite 入库及日志路由读取；测试使用受控流事件，不调用商业上游 |
| 后端语法 | 两个 JS 文件 `node --check` 通过；`deploy.sh` 的 `bash -n` 通过 |
| 后端隔离生产构建 | `NEXT_DIST_DIR=.next-stream-model-20261013 npm run build` 通过，含 standalone 资源复制 |
| 前端单元回归 | `npm.cmd test`：121 项通过 |
| 前端生产构建 | `npm.cmd run build` 通过 |
| 真实数据浏览器布局 | `tests/request-latency-browser.mjs --live`：16 组主题、价格开关与屏宽组合通过 |
| 真实数据浏览器颜色 | 深浅主题的成功、失败、类型、Token 输入/输出/缓存及浮层计算颜色全部通过 |
| 浏览器异常及业务写入 | 无控制台错误，无业务写入 |
| 真实后端及预览认证 | `/api/health`、`/api/auth/status`、`/api/auth/login` 均为 HTTP 200；数据库驱动 `better-sqlite3`，非演示模式 |
| 发布前生产服务状态 | 前端 PID 3216485、后端 PID 3218836 保持运行；修复代码验证期间未重启 |

## 上线结果

- 后端于北京时间 15:01 上线，PID `3256547`；前端于 15:02 上线，PID `3257310`。两个服务均为 `active`，两端 `/api/health` 均返回 HTTP 200。
- 后端直接发布已验证的完整隔离构建包，保留原构建用于回滚。没有使用后端旧发布脚本中会覆盖未提交源码的回滚步骤。部署前全部 60 条 `PATCH_CHECKS` 通过，本次新增项为 2 条。
- 前端执行 `scripts/deploy-kn10.sh`，发布脚本内 46 项测试通过。当前版本为 `/home/meet/.local/share/10router-web/releases/20261013-150242`；上一版 `20261013-133506` 已保留。
- 两个 systemd 服务配置文件的 SHA256 与发布前一致。
- 在真实入口 `http://192.168.11.150:4317` 完成 16 组主题、价格开关和屏宽验收；状态、Token 及浮层深浅颜色全部通过，无控制台错误或业务写入。
- 发布后检查了 6 条已完成的真实流式成功请求，6 条均保存了 `responseModel`。实际模型包含 `gpt-6.1-sol`、`deepseek-v4.1-flash`，与请求模型一致，未出现模型差异提醒。
- 真实日志接口返回 HTTP 200。浏览器读取 20 行日志，其中 6 行带返回模型；逐行提醒显示与模型比较结果一致，详情页能显示实际返回模型。本次现网样本没有不一致记录，不将这次检查描述为现网不一致提醒的阳性验收。
- [发布状态](deployment-state.json)、[现网颜色断言](colors-live.json)、[现网模型断言](models-live.json)、[深色现网截图](colors-live-dark.png)、[浅色现网截图](colors-live-light.png)。

## 交付物与当前边界

- [后端补丁](backend.patch)：仅包含本次后端源码、测试和部署验收登记增量。
- [前端样式补丁](frontend.patch)：仅包含本次样式增量。
- [颜色断言记录](colors.json)、[深色截图](colors-dark.png)、[浅色截图](colors-light.png)。截图使用真实网关数据。
- 前端产物：`E:/10reoute-web/dist`。
- 后端产物：`/home/meet/10router/.next-stream-model-20261013/standalone`。
- 后端修改前备份及测试、构建日志：`/home/meet/backups/10router/stream-model-20261013`。
- 完整构建包、数据库在线备份、旧后端构建和发布日志保存在 `/home/meet/backups/10router/stream-model-release-20261013-145856`；前端发布备份位于 `/home/meet/backups/10router-web/20261013-150242`。
- [回滚脚本](rollback.sh) 已通过 `bash -n`，同时保存在上述后端发布备份目录。脚本恢复旧构建和旧前端指针，不覆盖源码或恢复数据库；未执行回滚。
- 修复已在现网新请求中验证。旧记录缺少原始模型元数据，无法自动补回；上游未提供模型字段时保持未知。

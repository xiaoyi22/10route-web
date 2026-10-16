# 请求日志生成速度修复

已修复并于 2026-10-13 16:40 随完整版本上线。修复验证阶段未重启生产服务，也未修改生产数据库记录；用户授权后完成前后端发布。

## 问题与修复

旧算法在首包后速率超过 300 tok/s 时，突然改用包含等待时间的总耗时，导致更快的响应显示成更慢。

现场两条同模型记录均输出 175 Token：

| 总耗时 / 首包耗时 | 旧显示 | 修复后 |
| --- | --- | --- |
| 67742 / 67121 ms | 281.8 tok/s | 281.8 tok/s |
| 68845 / 68306 ms | 2.5 tok/s | 324.7 tok/s |

- 前端 `src/api/data.js`：流式请求固定使用输出 Token ÷（总耗时 − 首包耗时）。缺少有效首包数据、首包后时长不足 50 ms、输出量无效时显示「—」。非流式保留平均速度并在提示中说明包含等待时间。
- 提示明确说明首包后接收速率受上游缓冲和网络影响，首包不一定包含正文 Token。
- 后端 `/home/meet/10router/src/lib/db/repos/usageRepo.js`：请求详情和长期历史统计共同使用 `outputSpeedDurationMs`，取消两处超过 300 的回退，并尊重明确的非流式模式。旧历史没有 responseMode 时，依据是否记录 ttftMs 识别首包计时，无法由旧数据进一步确定真实正文首 Token 时间。
- 后端 `deploy.sh` 新增 **1 条 PATCH_CHECKS**：`src/lib/db/repos/usageRepo.js:outputSpeedDurationMs:3`，实测命中 3 次。
- 保留此前供应商批量操作及其他未提交改动。

## 验证

- `npm.cmd test`：125 项全部通过。
- `npm.cmd run build`：成功，无构建警告。
- 后端语法校验：`node --check src/lib/db/repos/usageRepo.js`、`bash -n deploy.sh` 通过。
- 后端 4 个相关测试文件：51 项全部通过，失败测试和失败测试套件均为 0。包含 299/300/301 边界、现场 175 Token 样本、缺失/无效计时、零输出、非流式、旧历史记录和数据库聚合。
- 后端 HTTP 验证：隔离临时数据库 → 实际 `/api/usage/dashboard` 路由 → HTTP 客户端，返回 200，节点和模型均返回 324.7 tok/s。所有测试写入都在临时数据库中。
- `tests/request-latency-browser.mjs --live`：真实网关数据，16 种主题/价格/屏宽组合通过，无控制台错误和业务写入。
- `tests/request-speed-live-browser.mjs`：开发预览 4330 和构建预览 4333 均通过；逐项核对 100 条真实日志，其中 3 条超过 300 tok/s；深浅主题均符合源数据，认证状态、健康、登录、页面和日志接口均返回 HTTP 200，无控制台错误和业务写入。
- 前端当前实际运行 Node v24.21.0；命令全程使用 npm.cmd，未修改 PowerShell 执行策略。

## 交付文件

- `backend.patch`：仅本次后端源码、部署检查和测试差异，不包含后端原有未提交改动。
- `backend-tests.json`：51 项后端回归结果。
- `live-acceptance.json`：构建预览 4333 的真实日志数值和断言记录，不含提示词或凭据。
- `live-dark.png`、`live-light.png`：构建预览截图。

正式入口：http://192.168.11.150:4317/dashboard/logs 。上线后验证 100 条真实日志（其中 22 条超过 300 tok/s），以及 18 个包含高速样本的后端模型聚合，全部符合新公式。[完整发布与验收记录](../full-release-20261013/README.md)。

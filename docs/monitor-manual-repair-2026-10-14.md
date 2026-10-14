# 模型检测手动执行修复

## 原因及修改

手动智商检测通过 `/api/models/test` 把 `high` 等档位拼入模型名，随后内部请求进入下游分发白名单。白名单只发布基础模型 `nexa/gpt-6.1-sol`，因此带档位的模型被拒绝为 404。自动检测使用 `probeTarget` 直接调用已验证供应商的执行器，不经过这处名单判断。

前端现在发送基础模型路由、独立 `thinkingLevel` 和 `monitorTarget`。后端校验目标与路由一致、模型在监控目录且档位受支持，再复用自动检测执行器。普通供应商模型行测试仍使用原有调用方式。

手动检测结果原先仅在页面内存保存，统计和历史只读取自动记录。现在后端把手动记录写入 `iqMonitor/manualHistory`，读取监控状态时与自动记录合并；前端同步更新状态、历史点、统计并重新读取后端。手动记录带 `manual` 和 `persisted` 标识，刷新后仍保留。独立存储避免正在运行的自动检测覆盖手动结果，并串行写入手动历史，防止并发丢失记录。自动检测计划、下次运行时间及后台退避保持原值。

旧后端不支持新能力时，前端提示尚未安装修复，避免悄悄忽略用户选择的思考强度。

## 验证

- 前端 125 项单元测试、构建通过。
- 后端 36 项针对性单元测试通过：路由与目标匹配、旧单模型调用、手动记录持久化、并发写入、账号排除、限流与超时、自动检测既有行为。
- `tests/monitor-manual-browser.mjs`、`tests/monitor-thinking-browser.mjs`、`tests/monitor-summary-browser.mjs`、`tests/monitor-browser.mjs` 通过，覆盖档位传参、状态更新、统计、刷新保留、计划不变、HTTP 故障及桌面/手机布局。
- 在网关的私有数据库快照中直接执行新后端路由，以 HTTP 调用真实 Nexa 上游：基础路由 `nexa/gpt-6.1-sol`，档位 `high`，HTTP 200、`ok:true`、答题正确、耗时 28522 ms。随后读取监控路由，确认同一手动记录存在、自动计划不变。
- 首次隔离联调缺少凭据解密材料，返回上游 401；补齐私有快照的解密材料后通过。这是验收环境问题，未修改生产凭据。
- 真实调用未修改生产监控数据库；使用私有快照。生产进程仍为原 PID，尚未发布或重启。

后端源码备份：`/home/meet/backups/monitor-manual-20261014/`。

交付补丁：`patches/monitor-manual-backend.patch`，基于 v1.4.0 的 `f47a870c`。最初修复涉及 2 个业务文件；升级丢失监控功能后，另补回 8 个必要业务文件，共新增 10 条 `PATCH_CHECKS`，已实测命中。

预发布验收记录：`reports/monitor-manual/browser.json`、`reports/monitor-manual/live-result.json`。

## v1.4.0 合并与上线

2026-10-14 14:26，另一 Hermes 升级任务切换后端仓库到 v1.4.0，覆盖了检测修复，并移除了原监控模块。用户明确选择先完成升级，再合并检测功能。本次使用独立工作目录 `/home/meet/10router-monitor-release`，补回监控接口、执行器、题目评分、默认设置、定时检查及令牌鉴权，保留 v1.4.0 的路由缓存修复等代码。

原分支的全量回归门禁存在历史基线差异；并发升级还使运行中的回归读到了不同版本源码，因此这些结果未作为发布通过依据。v1.4.0 独立目录的 58 项模型相关测试、6 项路由缓存测试通过。Next.js 生产构建及 `postbuild` 静态资源打包通过，日志为 `/home/meet/.codex/tmp/monitor-manual-20261014/v140-build.log`。

首次切换因 `/v1/models` 查询上游目录超出 15 秒时限自动回滚；新进程的健康接口已返回 200。随后使用健康与认证接口进行启动检查，再以真实模型调用验收，完成发布。

- 生产入口：`http://192.168.11.150:4317/dashboard/monitor`。
- 前端版本：`20261014-144550`；后端版本：v1.4.0。
- 后端回滚目录：`/home/meet/backups/monitor-manual-release-20261014-144523/`。
- 前端回滚目录：`/home/meet/backups/10router-web/20261014-144550/`。
- 登录、页面、Nexa `gpt-6.1-sol` + `high` 检测均为 HTTP 200，耗时 31480 ms。该次最终文本为空，旧判定把它记成答错；当时验收未检查文本非空，不能据此认定模型答错。状态、统计及历史点更新，刷新保留同一手动记录。
- 自动检测配置保持原值。未登录的监控读取和定时检查调用均返回 401；页面无未捕获异常，1440/375 像素布局已检查。

生产验收记录：`reports/monitor-manual/production/acceptance.json`，复现脚本：`tests/monitor-manual-live-browser.mjs`。

## 单次详情文本修复（15:27 发布）

真实 Nexa `gpt-6.1-sol(high)` 响应包含 `IQ-ANSWER: 21`，上游返回 Responses SSE。v1.4.0 仅在注册表标记强制流式时使用 Responses 聚合器；这条自定义供应商路径进入普通同步解析器，文本与用量丢失，旧评分函数又把空文本判为答错。

- 同步请求收到 SSE 时，按供应商实际协议复用既有聚合器，保留最终文本和用量。恢复监控已有的执行器覆盖参数，使 60 秒检测期限实际生效。
- 空白最终文本返回 `ok:false`、`replyIssue:empty_final_text`，不评分；真正的错误答案仍保留正文并判为答错。旧空白历史的原文已经丢失，没有伪造或补写历史。
- 后端 101 项回归通过，语法及差异检查通过，Next.js 生产构建和 postbuild 资源打包通过。前端 125 项测试及构建通过，本轮没有前端业务代码改动。
- 捕获的真实 Nexa 响应在私有快照中通过完整监控路由回放：HTTP 200、正文 `IQ-ANSWER: 21`、得分 100、记录持久化、自动计划不变。回放不等于新的上游实测成功。
- 两次隔离 Nexa high 实测分别遇到连接超时和检测期限超时；生产 Nexa low 实测也超时，保存为错误。本轮没有声称 Nexa 实时成功。
- 生产 CodeBuddy CN `glm-5.3-flash` 默认思考强度实测：登录、页面、检测均 HTTP 200，耗时 8760 ms，正文 `IQ-ANSWER: 26`。标准答案为 21，因此有正文且判为答错；单次详情正文、刷新保留、状态及统计更新、自动计划不变均通过浏览器断言。1440/375 像素无横向溢出，无控制台异常。

后端 PID：`3805161`；前端沿用 `20261014-144550`。回滚目录：`/home/meet/backups/monitor-text-release-20261014-152713/`，含切换前源码和构建。新增 2 条 PATCH_CHECKS，实际命中数为 2 和 1。

增量补丁：`patches/monitor-text-backend.patch`，在上一轮监控补丁应用后使用。证据：`reports/monitor-manual/text-tests.json`、`reports/monitor-manual/text-replay.json`、`reports/monitor-text/production-cbcn-default/acceptance.json`。浏览器脚本支持 `MONITOR_PROVIDER_PREFIX`、`MONITOR_MODEL`、`MONITOR_THINKING_LEVEL`（`default` 表示沿用默认）、`MONITOR_REPORT_DIR`；默认仍验收 Nexa high。

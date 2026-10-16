# v1.5.0 与现有定制的落地冲突核对

日期：2026-10-16。对应 [升级 SOP](upgrade-sop-v1.5.0-2026-10-16.md)。本报告核对代码、文本合并和真实只读配置；没有实施升级或宣称候选版功能回归通过。

## 1. 核对结论

不能直接覆盖升级。已确认 2 处文本冲突、1 处依赖锁文件冲突，以及 CodeBuddy 国内版会立即改变调度行为的兼容性冲突。其余问题分为新增功能接入缺口和现有定制保留项；后两者不能全部算作已经发生的故障。

| 类别 | 实际结果 | 对落地的影响 |
| --- | --- | --- |
| 文本冲突 | AG 执行器、账号配额接口，共 2 个文件，各 1 块 | 必须人工合并；不能整文件取上游 |
| 依赖冲突 | 本地与上游各有不同的 package-lock.json | 完整升级须固定一套锁及构建环境 |
| 可自动合并 | 13 个现有定制文件 | 仍须检查行为；CodeBuddy 调度变化就在可自动合并的 auth.js 中 |
| 行为冲突 | CodeBuddy 国内版旧到期优先开关触发新接力分支 | 现有轮询 3 次策略被接力策略优先取代 |
| 新功能接入缺口 | Key 权限、Rerank、外部额度、MiniMax OAuth | 后端升级不能自动完成现有独立前端与分发规则适配 |
| 部署链冲突 | 后端与独立前端分属两条部署链，服务都在用户级 systemd | 升级后端不更新前端；上游页面类收益需在 React 前端单独实现，发布时分别切换与回滚 |

建议调整：第一批保留视觉与协议修复；AG 冷却修复须保留现有保护并人工合并；资源包提取器修复与接力算法拆开。接力、Key 权限、Rerank 和外部额度各自完成兼容改造后再列入候选发布。所有批次都按 C13 分别处理后端与独立前端两条部署链。

## 2. 核对方法与边界

- 生产分支 `upgrade-v1.4.0-run`，HEAD `baae1a49a64bfa72764ea614eeaa85ce45c54adf`；运行版本仍为 `1.4.0`，BUILD_ID 仍为 `ABVOEyMzMRnVWFiD6ak4d`。
- 三方基线 `f47a870cdf40be840dc46f38d79a6bc86e11271c`，上游目标 `689be5c9f408eabc22bc65a8faa203a8d490f3b2`，本地侧使用生产当前实际文件，包含未提交定制。
- 在临时 bare 副本中读取固定上游对象；用 `git cat-file blob <commit>:<path>` 精确读取带方括号的路由路径，避免路径模式匹配误判缺失文件。
- 对 144 个上游变更路径检查本地差异，对其中双方已有的文件执行 `git merge-file -p --diff3`；没有修改生产工作树或执行 Git merge。
- 16 个重叠路径包含 15 个已跟踪定制文件和 1 个被忽略的本地锁文件。未跟踪运行模块的保留要求另列，不冒充文本冲突。
- 真实 GET `/api/settings` 为 200；仅提取调度字段，没有输出密码、Cookie、Token 或完整配置。检查前后生产 Git HEAD/status 相同。

此方法证明文本冲突和分支选择条件，不证明合并后的后端可构建或运行。没有执行候选版全量测试、真实模型生成、配置写入或服务重启。

证据摘要：[本轮核对结果](../reports/upgrade-conflicts-20261016/summary.json)。

## 3. 必须人工解决的三项

### C01：AG 冷却解析与现有隔离检查插入位置冲突

文件：`open-sse/executors/antigravity.js`。当前第 112 行起新增 `beforeAttempt`，第 134 行起新增 `inspectResponse`；上游在同一位置新增 `parseError`，三方检查返回 1 块冲突。

本地职责：发请求前拒绝已隔离/禁用账号；真实 403 按 ToS 分类持久化隔离，并停止该层重试。上游职责：从 429/409 的 `quotaResetTimeStamp` 或 `retryDelay` 提取精确冷却时间。

处理规则：三个方法并存，保留本地 import 与请求前后检查，只加入上游解析函数；两项功能本身可并存，不需要二选一。不能用上游整文件替换本地文件。

通过标准：隔离账号生成请求数为 0；403 不进入同层重试；429/409 冷却时间传到本地 `markAccountUnavailable`；本地 25 小时信任上限和普通 403 冷却规则不变。使用假账号与可控响应验证。

### C02：账号配额接口 import 冲突

文件：`src/app/api/usage/[connectionId]/route.js`，当前第 11-12 行。三方检查返回 1 块冲突。

本地多引入了 `assertAntigravityAllowed`；上游把 `USAGE_APIKEY_PROVIDERS` 扩为同时引入 `USAGE_COOKIE_PROVIDERS`。上游同时扩展 Cookie 类型配额与外部额度认领，不能因解 import 冲突而丢掉本地保护。

处理规则：合并两个供应商常量，保留 AG 保护 import 和刷新前校验；保留当前刷新前重读数据库的逻辑，避免用旧 refresh token 快照。仅移植第一批时不必同时引入整套外部额度逻辑。

通过标准：模块可加载；Cookie 配额分支仅对适用供应商生效；隔离 AG 账号不刷新、不查询上游；刷新后凭据正确持久化。

### C03：本地依赖锁文件与上游新增锁文件冲突

文件：`package-lock.json`。本地文件存在但被 Git 忽略，基线未跟踪该文件，上游目标新增同名文件；属于实际磁盘文件的 add/add 内容冲突，普通 tracked diff 会漏掉。

| 核对项 | 当前本地锁 | 上游目标锁 |
| --- | --- | --- |
| 项目版本 | 1.4.0 | 1.5.0 |
| lockfileVersion | 3 | 3 |
| packages 数量 | 1132 | 1137 |
| next | 16.3.2 | 16.3.3 |
| @noble/hashes | 1.4.0 | 1.8.0 |
| better-sqlite3 | 12.11.1 | 12.11.1 |

处理规则：A 路线第一批不涉及新增依赖时保留当前锁和依赖；B 路线在隔离 Linux 环境验证选定的 package/lock 组合，不混用 Windows node_modules 或用 npm install 任意漂移版本。以上是锁内版本差异，不是已经验证了所有在运行的模块版本。

通过标准：锁与包声明一致、可重复构建、postbuild 成功，运行健康接口仍返回预期 SQLite 驱动；不因安装可选依赖策略改变而静默降级。发布包带实际依赖，不引用临时路径。

## 4. 不报文本冲突但会改变业务的项目

### C04：CodeBuddy 国内版的轮询 3 次被新接力分支取代

真实配置核对结果：

| 供应商 | earliestExpiryFirst | 调度 | 单账号连续次数 |
| --- | --- | --- | --- |
| Antigravity | false | round-robin | 3 |
| Qoder | false | round-robin | 1 |
| CodeBuddy 国内 | true | round-robin | 3 |
| CodeBuddy 国际 | false | round-robin | 3 |

当前 `src/sse/services/auth.js` 第 302 行按 round-robin 进入计数轮询。目标文件第 296 行新增 `earliestExpiryFirst && orderedConnections.length > 1` 分支，位于第 312 行轮询分支之前。

结果：多个账号可用、没有优先固定账号时，CodeBuddy 国内版沿用原配置升级就会进入接力，原“连续 3 次再轮换”不再决定选账号。AG 当前不会因旧配置自动进入接力，因此不能把这项说成只影响 AG 或升级后 AG 自动改用新策略。

处理规则：第一批不带入接力分支。第二批为接力明确独立启用与配置迁移规则，旧 true 值不自动代表同意新策略；保留原轮询路径。Combo 成员轮转和账号选择属于两层，现有 Combo 补丁没有文本冲突，需组合测试，不能直接断言 Combo 次数也被覆盖。

通过标准：旧配置下 CodeBuddy 国内版仍保持原轮询；只有明确选择新策略才接力；分别验证账号计数、Combo 计数和错误后回退，统计实际选中的账号及调用次数。

### C05：新 Key 白名单与我们的全局分发限制不能互相替代

文件：`src/sse/services/auth.js`、`src/sse/handlers/chat.js`、`src/app/api/v1/models/route.js`；均可自动合并。

当前聊天入口有自定义全局 allowlist，未发布模型返回 404；公开目录也受分发过滤。上游新增每 Key 的模型/Combo 名单和目录过滤，但校验异常会放行，空的模型名单与空的 Combo 名单分别表示不限制对应类别。仅填模型名单，不等于所有 Combo 都被限制。

处理规则：保留全局分发，Key 权限仅进一步缩小范围；明确 Combo 和别名语义，并补异常分支。独立前端 `CorePages.jsx` 目前创建 Key 只提交名称，需要单独补权限编辑与刷新读回。

通过标准：Key 允许而全局未发布仍拒绝；全局已发布而 Key 不允许返回 403；所有拒绝均为上游 0 请求；模型目录与调用结果一致。业务语义明确前不启用该功能。

### C06：新 Rerank 入口不经过我们的分发闸门

文件：上游新增 `src/sse/handlers/rerank.js` 和 `/api/v1/rerank`。它有 Key 有效性和每日额度检查，但未调用 `checkApiKeyModelAccess`，也未调用本地 `enforceDistribution`。我们的图像、语音等独立入口已经单独接了分发闸门，Rerank 不能自动继承聊天入口保护。

处理规则：如接入 Rerank，先补全局分发与每 Key 权限，再按需开放前端真实路径。没有 RAG 需求时本批不接入，不为它扩大现有管理代理白名单。

通过标准：未发布模型返回既定 404，越 Key 权限返回 403，均不请求上游；合法请求、参数错误、fallback 和用量记录各自验证。

## 5. 新功能与现有接口的接入缺口

### C07：外部额度卡和刷新不走当前前端的数据路径

已核对三个位置：

- 当前 `src/pages/BalancesPage.jsx` 第 32/60 行，读取 `/api/usage/quotas` 的 `connections`。
- 当前后端同名路由第 104 行，仅遍历数据库连接并筛选 `isUsageEligible`。
- 目标 `/api/providers/client` 引入 `buildExternalConnectionRows`、`filterClaimedExternalRows`、`attachClaimRefreshUrls`，把非数据库的外部快照卡合进去并携带 `refreshUrl`。

因此，只升级后端或在前端多读一个字段，不会自动把未认领外部卡放到当前页面。当前 QuotaCard 也没有调用伴侣 `refreshUrl` 的交互，现有“刷新余额与配额”不等于通知推送方重新测量。

处理规则：采用此功能时明确配额聚合接口与前端适配范围，保留当前余额分组、自动更新和历史资源包显示。外部卡不写成可路由账号；同名认领按供应商及账号匹配，处理重名、重命名和数据过期。外部写入使用独立受控身份，不复用下游普通客户端 Key。

通过标准：未认领卡可见、认领后不重复计数；刷新确实通知伴侣并收到新快照；失败显示旧数据及时间；原渠道余额与配额开关保存读回正常。没有伴侣服务时本批不接入。

### C08：MiniMax Code 的设备码登录入口未接到独立前端

当前 `src/api/oauth-catalog.js` 的设备码集合和 OAuth 供应商数组均没有 `minimax-code`、`minimax-code-global`，`src/api/policy.js` 以该目录限制 OAuth 路径。新后端具备刷新方法，不等于当前页面可以新增和授权这两类账号。

处理规则：有订阅接入需求时，按真实后端流程补目录、动作和 UI，不添加猜测的别名路由；保留国内/国际区分。当前未发现这两类现有连接，属于接入缺口，不是已发生的业务回退。

通过标准：设备码获取、轮询、取消、过期与刷新在隔离环境验证；真实授权在所需账号具备后执行。没有账号时不标为已接入。

## 6. 自动合并时仍须保留的现有定制

### C09：AG 保护分散在请求、刷新、配额和持久化多层

相关可自动合并文件包括 `base.js`、`tokenRefresh.js`、`tokenRefresh/providers.js`、`usage.js`、`testUtils.js`、`auth.js`、`connectionsRepo.js`。当前包含以下可定位行为：

- BaseExecutor 传递并消费 `agRequestBudget`，请求前调用 `beforeAttempt`，响应后调用 `inspectResponse`。
- Token 与配额入口检查隔离状态，传递 `antigravityCredentials`；测试账号入口也有保护。
- connectionsRepo 的 `protectQuarantine` 保留隔离与禁用状态，普通刷新和配额写入不能解除隔离。
- auth.js 保留普通 403 冷却、精确重置时间的 25 小时信任上限及渠道熔断判断。

处理规则：以上文件采用保留本地逻辑的精确合并，不以“可自动合并”为理由整文件覆盖；上游新增 MiniMax 刷新和接力字段只是扩展，不能替换 AG 防护。

通过标准：隔离账号在生成、刷新、探测、配额四类入口均不出网；预算耗尽不跨账号/Combo 继续重试；配额与刷新写入不解除隔离。当前审计没有运行这些候选版测试。

### C10：兼容节点强制流式与 Responses 字段必须保留

文件：`open-sse/executors/default.js` 可自动合并。当前 `transformRequest` 包含 `resolveForceStream`、Responses 的 `prompt_cache_key`、`reasoning.encrypted_content` 和移除不兼容 temperature。上游同文件新增 MiniMax 刷新、移除旧 minimax-free 分支。

这不是已确认的自动合并故障，但如果整文件取上游，会丢掉现有补丁。

处理规则：保留当前 transformRequest 及 chatCore 的流聚合实现，只吸收选定的新分支。首批不为未接入的新供应商替换执行器。

通过标准：现有兼容节点即便上游只支持 SSE，同步下游仍返回完整 JSON 和真实用量；工具 ID、加密推理连续性及原请求体不受污染。

### C11：schema 3 和新字段要与分发、余额、隔离持久化共存

上游 schema 2 -> 3 增加 Key 权限列；`db/index.js` 新增白名单归一化导出；`connectionsRepo.js` 增加 `earliestPackageRemaining` 的持久化字段。当前 db/index.js 还导出自定义分发函数和余额偏好，connectionsRepo.js 则包含隔离持久化保护。

处理规则：保留上述本地导出及保护，再添加新列/字段；采用 Key 权限或整体升级时才进入对应迁移范围。schema 改动与运行包一起验收，不把“上游无人工迁移”理解为不用备份。

通过标准：既有分发白名单、余额偏好和隔离状态迁移后读回一致；Key 名单和接力剩余量可持久化；旧代码读取迁移后的副本经过验证后，才能确定代码回滚是否不需要回退数据库。

### C12：从干净 HEAD 重建会漏掉当前未跟踪的功能模块

生产状态确认未跟踪的运行模块包含：`antigravityQuarantine.js`、`agRequestBudget.js`、分发路由与 distributionRepo、distributionGuard、channel-balances 路由及适配器、iq-monitor 路由和服务等。

这些路径不一定与 v1.5.0 的新文件同名，因此三方合并不会为其报警。若以干净 Git 树打包或仅叠加 tracked diff，这些现有能力会被遗漏；昨日修复补丁也不能代替今天完整源码清单。

处理规则：备份和候选副本显式纳入必要的未跟踪运行文件；凭据、数据库、备份副本和临时日志排除在公开源码包外。不执行 blanket `git add .`，不自动提交生产修改。

通过标准：候选包包含这些模块和路由；分发、余额、检测均为正确的 JSON；行为验证通过，不能只以文件存在计为成功。


### C13：两套部署链不能混用，且服务是用户级 systemd

本轮复核生产部署方式，纠正此前“系统 systemd”与“前端同机服务”的模糊说法：

- 后端 `10router.service` 与前端 `10router-web.service` 都安装在 `~/.config/systemd/user/`，用 `systemctl --user` 管理，`Linger=yes` 保证未登录也常驻。用系统级 `systemctl status 10router` 会得到 not-found/inactive，不能据此判断服务已停。
- 后端运行原生仓库的 `.next/standalone/custom-server.js`（`PORT=20128`，Next 16.3.2）；前端是独立仓库 `E:\10reoute-web`（React 19 + Vite），按 release 目录加 `current` 软链发布，当前 release-id 为 `20261016-vision-settings`。
- 两条链各有自己的部署脚本与产物：后端随 `10router` 仓库重建 standalone；前端走本仓库 `scripts/deploy-kn10.sh` 的 staging/releases/current 流程。升级后端不会自动更新前端，反之亦然。
- 因此上游 v1.5.0 的 Next.js 页面改动不会出现在我们的 React 前端；凡是上游改了页面/路由的收益项，都要在独立前端单独实现并验证。改动发布时必须分别切换、分别记录、分别回滚。

## 7. 全部 16 个重叠文件处理表

| 文件 | 三方结果 | 必须保留或处理 |
| --- | --- | --- |
| open-sse/config/errorConfig.js | 自动合并 | 流式错误常量、AG 403 冷却与 25h 信任上限 |
| open-sse/executors/antigravity.js | 1 块文本冲突 | 隔离两方法与新增 parseError 并存 |
| open-sse/executors/base.js | 自动合并 | AG 预算、请求前/响应后钩子 |
| open-sse/executors/default.js | 自动合并 | 强制流式、Responses 连续性字段 |
| open-sse/services/tokenRefresh.js | 自动合并 | 隔离判断、完整账号对象与 connectionId |
| open-sse/services/tokenRefresh/providers.js | 自动合并 | 刷新保护、凭据上下文与去重链路 |
| open-sse/services/usage.js | 自动合并 | 配额查询前隔离检查与 credentials 传递 |
| package-lock.json | add/add 内容不同 | 选定依赖锁并验证 Linux 构建 |
| src/app/api/providers/[id]/test/testUtils.js | 自动合并 | 探测/刷新保护、隔离错误不吞掉 |
| src/app/api/usage/[connectionId]/route.js | 1 块文本冲突 | 合并 import，保留 AG 检查与刷新前重读 |
| src/app/api/v1/models/route.js | 自动合并 | 分发过滤与新增每 Key 过滤共同生效 |
| src/dashboardGuard.js | 自动合并 | 原认证限制及新推送入口的授权边界 |
| src/lib/db/index.js | 自动合并 | 分发/余额偏好导出与新增 Key 导出 |
| src/lib/db/repos/connectionsRepo.js | 自动合并 | protectQuarantine 与接力新字段并存 |
| src/sse/handlers/chat.js | 自动合并 | 全局分发、AG 状态/预算和新增 Key 检查 |
| src/sse/services/auth.js | 自动合并 | CodeBuddy 策略冲突、AG 冷却和 Key 异常边界 |

## 8. 本次修正的判断

- 原 SOP 的“15 文件交集”未包含被忽略的实际锁文件；现修正为 16 个实际重叠路径，不能把 16 全部说成文本冲突。
- 原 SOP 尚未核实各供应商到期优先开关；现已确认 CodeBuddy 国内版开启、AG 关闭，并把前者列为直接策略冲突。
- 外部额度不是只缺前端字段，后端聚合入口和伴侣刷新路径也不同。
- Gemini 4 不列为 AG 升级收益。当前白名单中的 `fs/gemini-4-argon` 属 fs 线路；当前及目标 AG 注册表均无 Gemini 4，未实测生成。
- 视觉大小写兜底、Qoder 视觉补齐、Gemini 工具 ID 修复和耗尽包提取器未发现本地文本冲突；没有因此宣称它们已通过当前环境的业务回归。


## 9. 落地顺序

1. 第一批：保留现有调度，移植视觉/协议/耗尽包修复；AG 冷却按 C01 和 C09 精确合并；不动生产锁、schema 与外部入口。
2. 第二批：先解决 C04 的旧开关语义，明确选择新策略后再验证和启用接力。
3. 后续按需：Key 权限处理 C05/C11；外部额度处理 C02/C07；MiniMax 处理 C08；Rerank 处理 C06。每项独立形成通过记录。
4. 所有批次继承 C09-C12 的定制保留要求，并按 C13 分别处理两条部署链，再走 SOP 中的构建、隔离验收、统一打包和发布流程。

5. 全部批次都在用户级 systemd 下操作：`systemctl --user` 查看与重启 `10router.service`、`10router-web.service`；系统级 `systemctl` 查询不到属正常。上线与重启仍按项目约定单独取得授权。

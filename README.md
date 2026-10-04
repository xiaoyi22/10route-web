# 10router-web

独立的 Vite + React 网关控制台，采用石墨灰、薄荷绿与浅色双主题。首页展示请求用量、Token 趋势、模型分布、供应商连接及最近请求。沿用 10router 后端接口，支持核心管理功能及只读访问模式。

## KN10 生产访问

已部署到 KN10，由用户级 `10router-web.service` 常驻运行并开机自启。

- 公司局域网：`http://192.168.11.150:4317/dashboard/overview`。
- Tailscale：`http://100.70.78.33:4317/dashboard/overview`，客户端须登录同一 Tailscale 网络。
- 使用原网关管理密码登录。生产前端通过服务器代理读取 `127.0.0.1:20128`；原 `10router.service` 独立运行。

生产入口为 `scripts/serve.mjs`，只依赖 Node 标准库，提供编译文件、页面深链接、登录 Cookie 及 SSE 代理，并沿用核心接口白名单。部署不使用 Vite 开发服务器。原网关通过真实转发标记识别代理访问，不授予本机免登录权限。

`scripts/deploy-kn10.sh` 在 KN10 打包已构建的 `dist`、服务入口和接口白名单，发布到 `/home/meet/.local/share/10router-web/releases/<时间>`，由 `current` 软链接选择当前版本。部署包和校验记录位于 `/home/meet/backups/10router-web/<时间>`。已有 systemd 单元在覆盖前备份一次。

当前验收发布为 `20261003-054746`，归档位于 `/home/meet/backups/10router-web/20261003-054746`，上一版本为 `20261003-042510`。后续部署记录 `previous-release`，回滚时停止前端服务，将 `current` 指向该记录中的旧发布，再启动服务并验收；原网关数据库无需回滚。首次发布可停止并禁用 `10router-web.service`。

生产地址已验证页面、静态资源、健康接口、登录状态和未登录访问保护；真实账号的业务读写需登录后验收。家中终端的网络连通性尚未现场验证。

## 启动并实时查看

需要 Node.js 22.12+（当前验证使用 24.21.0）。

```powershell
npm install
npm run dev
```

打开 `http://localhost:4317/dashboard/overview`。Vite 支持页面/样式热更新；默认只监听本机，不对局域网或公网开放。

默认启动隔离的内存演示接口，不连接生产服务，不读取真实数据库或凭据。演示登录密码为 `linear-demo`。演示 Cookie 与生产 `auth_token` 使用不同名称，避免覆盖同域现有会话。

当前机器的 `.env.local` 已配置真实后端 `http://192.168.11.150:20128` 并开启核心管理功能。启动后使用原网关管理密码登录，读取实际连接、密钥、模型、日志及用量；不会在失败时回退到演示数据。概览和供应商列表均显示全部返回的连接。

Windows 在 UNC 共享目录下运行 npm 脚本可能被 cmd 工作目录限制影响，可以直接执行：

```powershell
node scripts/dev.mjs
node scripts/build.mjs
node --test tests/client.test.mjs tests/fixture.test.mjs
```

若共享盘启动报 `UNKNOWN: unknown error, watch`，在启动前设置 `$env:CHOKIDAR_USEPOLLING = 'true'`，使用轮询监听文件变更。

Vite 在 Windows 上不能可靠处理原始 UNC 根路径，请从映射到同一共享目录的盘符进入项目后运行。例如本机已将 `\\192.168.11.150\meet` 映射为 `W:`，可在 `W:\10router-web` 执行上述命令；源码仍保存在原共享目录。请勿覆盖机器已有盘符映射。

## 当前完成范围

- 供应商提供“添加供应商”入口：OpenAI 兼容（Chat Completions / Responses）或 Anthropic 兼容，填写名称、路由前缀、地址与 API Key 后创建节点及账号；支持修改地址、追加账号和删除供应商。已有内置供应商/OAuth 账号继续保留。“新增连接”用于给已有节点添加账号。
- 模型页支持登记自定义模型、发布/停用、删除和设置上下文/最大输出；已启用模型会进入下游 `/v1/models`。上下文配置是声明与网关限制，不提升上游能力。上下游不同调用名称可通过单成员组合提供。
- `/dashboard/combos` 支持创建、编辑、删除组合模型、成员顺序调整和顺序回退/轮询策略；组合名进入下游模型列表。
- `/dashboard/balances` 分开展示上游钱包余额、密钥额度、订阅窗口和账号配额，支持刷新、搜索及渠道查询开关。账号配额置于页面前部，按账号展示卡片、剩余比例、进度条及重置/到期时间，支持账号邮箱搜索；保留零值、未知、无限额、错误及过期数据的区别。不支持余额查询的上游明确显示未提供数据。
- 请求日志用橙色、蓝色、绿色、紫色与青色分别区分输入、输出、缓存读取、缓存写入和 TPS，支持深浅主题。
- React Router 独立路由、侧栏与移动导航。
- 深色、浅色、跟随系统主题，Zustand 保存偏好。
- 演示登录/退出、Cookie 刷新及请求错误处理。
- 供应商按注册供应商或自定义节点分组，点击进入账号连接列表，再查看账号详情；支持搜索、正常连接筛选、API Key 连接新增、编辑、启停、连接测试和确认删除。测试状态来自历史记录。
- 连接详情读取真实代理池与全局规则，显示代理池名称、地址、绕过规则及强制代理状态；支持绑定代理池、专用代理与继承全局规则。显示的是当前配置，历史请求的实际出口节点未由后端提供；未接入 Hermes 的实时代理节点接口。
- 端点展示、OpenAI/Anthropic 客户端配置复制、API 密钥创建、隐藏/显示、复制、启停和确认删除。
- 供应商、模型和日志复用原网关品牌图标；自定义或未知供应商显示通用连接图标。
- 模型默认显示已启用连接对应的模型；可切换全部目录。通过供应商 ID、路由别名和自定义节点前缀关联，支持搜索、供应商筛选、分页、路由 ID 复制和能力字段；目录不代表上游实时可用性。
- 模型供应商显示注册名称或自定义节点名称；同一供应商的路由别名合并筛选，有连接的供应商可跳转详情。模型调用的路由 ID 保持原值。
- 请求日志按供应商、模型、连接、状态、时间筛选，支持 20/50/100 条分页；列表与详情展示缓存读取/写入、首 Token 延迟、响应模式、连接及请求 ID，并提供元数据复制和当前页 CSV 导出。对话正文由后端脱敏，不展示；导入记录的延迟不作为实测延迟显示。
- 请求日志列表、详情与 CSV 共用输出 TPS（Token/s）计算：流式请求使用输出 Token ÷（总耗时 − 首 Token 延迟）；非流式或缺少有效首 Token 时间时使用总耗时。沿用网关短突发统计规则，首 Token 后不足 50 ms 或计算速率超过 300 时使用总耗时，详情和导出注明实际口径。导入、无正数输出 Token、缺少有效耗时或总耗时不足 50 ms 时显示未知。
- 周期统计、Token 流量图、模型分布；SSE 触发所选周期重新读取，最多每五秒刷新一次，可暂停自动更新。
- Token 与缓存共用今日、24 小时、7 天、30 天、60 天的统计周期，并记住选择；图表显示周期名称，切换时不展示旧周期缓存。
- 日志提供价格显示开关及默认开启的 30 秒自动刷新，记住开关选择；后台标签暂停轮询，刷新保留筛选和页码。价格读取 `/api/pricing` 的当前供应商/模型价目表估算，缺少价格或完整 Token 显示未知，不是实际扣费；CSV 和详情随价格开关显示费用。
- Token 与缓存合并为一张时间趋势图，显示输入、输出、缓存读取、缓存创建四条曲线；右上角展示所选周期的缓存率，悬停显示时间桶数值与缓存率。数据来自 `/api/usage/chart` 的 `promptTokens`、`completionTokens`、`cachedTokens`、`cacheCreationTokens`；今日与 24 小时按小时分桶，7/30/60 天按日分桶。历史每日缓存创建只在请求记录覆盖完整日汇总时返回数值，缺失显示未知，曲线保留断点。
- 点击图例只显示所选指标，再次点击同一项恢复全部，点击其他项直接切换；纵轴按当前曲线缩放，悬停明细随选择过滤。周期切换及数据刷新保留选择，支持键盘与触屏操作。
- 图例单选发布于 KN10 前端 `20261003-025436`，源码与最终产物通过单选、切换、恢复、纵轴缩放、悬停过滤、周期与刷新保留选择及桌面/手机检查。仅重启前端；回滚记录 `/home/meet/backups/10router-web/20261003-025436`。内网与 Tailscale 健康、登录保护和登录界面通过检查，生产登录后的完整图表未代验。
- 模型检测入口 `/dashboard/monitor` 读取 `/api/iq-monitor`，按供应商、模型分别展示测活与智商检测、最近最多 30 条后台记录、正确率、耗时、退避状态和逐题详情；无记录显示未检测，缺少评分显示未知。后台全局最多保留 500 条历史，因此不保证每个模型都有 30 条。
- 检测汇总跟随供应商、模型搜索与模型范围筛选，采用各模型最新的后台或本页单次测试结果；未检测/未评分单独统计，不混入异常。
- TPS 与检测汇总发布 `20261003-042510` 通过 22 项单元测试、源码与最终构建产物的浏览器测试、日志价格/自动刷新/分页回归。内网与 Tailscale 页面、资源、健康及登录保护通过，线上脚本校验值与构建产物一致；生产登录后的真实数据页面尚未代验。
- 自动检测配置支持模型测活/智商检测独立勾选、15～10080 分钟周期、1～20 道数字答案题目和排除账号，通过 `PUT /api/iq-monitor` 保存。编辑期间刷新不会覆盖未保存内容；只有用户保存启用后才会启动后台计划。
- 单次测试调用 `POST /api/models/test`，由网关路由选择账号；单次智商检测使用网关单题，自动检测使用题库。单次结果保留在当前页面，不写入自动检测历史。配置保存与测试仅在管理模式开放。
- 检测交互参考 [New API 渠道测试](https://github.com/QuantumNous/new-api/blob/main/web/src/features/channels/components/dialogs/channel-test-dialog.tsx) 与 [Sub2API 定时测试](https://github.com/Wei-Shaw/sub2api/blob/main/backend/internal/handler/admin/scheduled_test_handler.go)，评分沿用 10Router 已有题库判定。
- 模型检测发布 `20261003-040723` 通过 21 项单元测试、源码与最终产物的浏览器配置/检测流程、四种屏宽及原图表交互回归。内网与 Tailscale 的页面、健康和登录保护通过检查；Tailscale 浏览器测试设置 `BROWSER_DIRECT=1` 绕过 Windows 系统代理。生产登录后的检测与配置写入未代验，本次只重启前端。
- 模型用量明细保留全部模型合计及逐模型请求、输入、输出、总 Token、缓存读取与命中率，超过 20 个模型分页。总 Token 为输入加输出，缓存读取是输入的子集；缓存率为缓存读取 / 输入，无输入、缺失字段或口径异常时显示未知。
- 接口返回 401 时回到登录页；错误不会被当作成功处理。
- 快速跳转仅包含已实现页面。
- `/` 和 `/dashboard` 默认进入网关概览；供应商摘要支持跳转到完整列表。
- 概览展示后端最近请求记录；最近请求不受统计周期筛选影响。

供应商新增当前支持 OpenAI、Anthropic、OpenRouter、DeepSeek，以及原网关已配置的兼容节点。已有 OAuth 连接支持编辑、启停、测试与删除；新建 OAuth 授权及 SSO 流程尚未迁移。组合路由、配额、余额和其他模块不在本次核心功能范围内。

供应商图标来自原项目 `public/providers`，别名映射 `src/api/provider-aliases.json` 和名称映射 `src/api/provider-names.json` 来自其 `open-sse/providers/registry/index.js` 的 143 个注册项（2026-10-02）。原网关更新供应商标识时，应同步该映射；前端运行时无需访问后端源码。

KN10 前端服务为 `10router-web.service`，入口为 `http://192.168.11.150:4317`，Tailscale 入口为 `http://100.70.78.33:4317`。2026-10-03 发布 `20261003-010426`，产物保存在 `/home/meet/.local/share/10router-web/releases/20261003-010426`，回滚记录保存在 `/home/meet/backups/10router-web/20261003-010426`。部署仅重启前端，后端 `10router.service` 未重启。两个入口的健康、未登录访问保护和桌面/手机登录界面均已实测；认证后的真实账号读写仍需登录验收。

当前发布为 `20261003-013810`，增加周期标识、日志价格开关和 30 秒刷新；回滚记录位于 `/home/meet/backups/10router-web/20261003-013810`。源码和构建产物分别通过周期、费用估算、开关持久化、30 秒轮询及四个屏宽的浏览器验收；KN10 内网和 Tailscale 入口通过健康、登录保护及页面资源验收，后端未重启。

发布 `20261003-022245` 统一模型供应商的名称、别名筛选和详情入口，将周期 Token、缓存读取和命中率合并为一张模型用量表。源码与最终产物通过名称映射、路由 ID 保留、周期统计、45 模型分页及桌面/手机浏览器验收；内网和 Tailscale 的登录保护、页面及静态资源实测通过。仅重启前端，回滚记录位于 `/home/meet/backups/10router-web/20261003-022245`。

发布 `20261003-024322` 将主图替换为四系列 Token 与缓存趋势。后端 `/api/usage/chart` 保留原有总 Token、费用与模型分布字段，补齐输入、输出、缓存读取和缓存创建时间桶。正式后端构建产物通过真实数据库只读核对，今日输入、输出与 SQL 汇总相符；60 天内有两个日期的创建历史不完整，返回未知。后端通过 148 项发布测试，保留 `1.3.0+kn10.20261001` 版本标识；前端通过 18 项接口测试与桌面/手机图表验收。两个入口健康、未登录保护与登录界面通过检查，生产登录后的完整业务界面未代验。后端回滚产物位于 `/home/meet/backups/10router/release-token-chart-20261003/next-before`，数据库备份在同目录；前端回滚记录位于 `/home/meet/backups/10router-web/20261003-024322`。

## 后端接入

### Hermes 接入

2026-10-03 发布 `20261003-195058`，包含代理控制、订阅/看护操作、链路健康、配额卡片和页面按需加载；只重启 `10router-web.service`，后端进程未变化。正式产物通过 26 项接口测试、隔离代理操作、配额卡片和页面/图表跳转验收。KN10 内网通过健康、登录保护、三个新页面入口及桌面/手机浏览器检查；内网和 Tailscale 的 164 个 JS/CSS 资源均返回 200。Tailscale 在本机无头 Chromium 的页面请求未收到响应，浏览器验收未通过；HTTP 检查不能代替该项。生产登录后的业务读写未代验。产物位于 `/home/meet/.local/share/10router-web/releases/20261003-195058`，回滚记录位于 `/home/meet/backups/10router-web/20261003-195058`，上一版为 `20261003-140036`。

新增 `/dashboard/proxy` 代理控制和 `/dashboard/chain-health` 链路健康页面，沿用现有导航、表格、弹窗及深浅主题。代理控制支持组/节点查看、Selector 运行时切换并回读确认、单节点测速、7890/7891/7892 出口检测，以及已有看护状态/告警展示。供应商账号根据实际代理地址和入口配置关联到代理组；不会按端口关联其他主机上的代理。

在 `.env.local` 配置 `TENROUTER_HERMES_URL` 和 `TENROUTER_HERMES_TOKEN_FILE`；文件保存原 Hermes dashboard 的令牌，读取发生在服务端。KN10 服务模板使用 `http://127.0.0.1:8888` 和 `%h/.hermes/dashboard_token`。服务端先通过网关登录接口验证会话，再使用 Hermes 令牌调用固定接口；不会把浏览器 Cookie 转发到 Hermes，也不会把 Hermes 令牌返回浏览器。管理模式才能切节点、测速、检测出口和主动检测健康。

健康页打开和刷新只读服务端最近记录，首次没有记录显示未检测。手动检测调用现有 Mem0/Icarus 接口，同一进程内合并并发检测，两次检测至少间隔 30 秒；结果超过 5 分钟标记过期。服务重启后检测记录清空。模型检查显示接口可达，配置检查显示已配置，记忆检查显示数据新鲜度；目前不验证某次 Hermes 请求的完整调用链或某次提取的入库结果。

代理控制的“机场与订阅”页签支持新增机场、编辑订阅地址、更新节点、选择 GLOBAL 机场和删除机场。新增仅保存订阅记录，更新和应用须分别确认；编辑框不回填原始 URL 或脱敏占位符。更新/删除沿用 Hermes 的配置校验、原子安装和回滚流程，显示备份路径、警告及回滚成功/失败，失败后刷新实际状态。GLOBAL 选择不改变 Mihomo 运行模式或独立入口绑定。

“故障看护”页签支持 ai-谷歌、AI-优选的观察/自动模式切换、手动检查、采用建议节点及确认告警。模式切换、手动检查和采用建议须确认，继续调用原有看护接口，不创建第二个定时器或配置写入器。看护检查失败及新节点验证失败会明确提示。订阅和看护状态仅在对应页签打开时读取。

`node --test tests/hermes.test.mjs` 检查访问边界、手动探测缓存、节点回读、代理映射、订阅脱敏及回滚失败。Windows 可运行 `node tests/hermes-browser.mjs` 验证隔离环境下的订阅/看护操作、主题和手机弹窗，并只读核对 KN10 的代理组、节点、订阅与看护状态；显式增加 `--live-health` 才会对真实 Mem0/Icarus 执行一次主动检测。浏览器测试使用本机 Edge 和标准 CDP，无新增依赖；如 Edge 的首次运行/同步窗口阻塞测试，可用 `HERMES_BROWSER_EXE` 指定已有的独立 Chromium 可执行文件。

设置 `TENROUTER_TEST_DIST=1` 后，`tests/hermes-browser.mjs` 与 `tests/balances-cards-browser.mjs` 使用正式 HTTP 服务验收现有 `dist`，无需重复构建。`node tests/production-smoke.mjs http://192.168.11.150:4317` 只读检查线上健康、登录保护、页面资源与桌面/手机登录界面，不提交生产密码。

只有显式配置 `TENROUTER_BACKEND_URL` 才连接外部后端，地址须为不含凭据的 http(s) origin。默认保留只读模式；`TENROUTER_ENABLE_MANAGEMENT=1` 开放下列核心管理请求。新增、编辑、启停、测试和删除只在用户操作时发送。本项目的自动管理验收仅连接隔离演示环境。

`TENROUTER_MODEL_BASE_URL` 可指定实际客户端访问的模型 Base URL；未指定时，真实后端模式使用后端 origin 加 `/v1`，演示环境显示未配置。模型入口不经过开发代理。`TENROUTER_PORT` 可修改本地预览端口，默认为 4317。

开发代理仅开放：

- GET `/api/auth/status`、`/api/health`、`/api/providers`、`/api/providers/:id`、`/api/provider-nodes`、`/api/proxy-pools`、`/api/settings`、`/api/pricing`、`/api/keys`、`/api/keys/:id`、`/api/models`、`/api/models/custom`、`/api/usage/stats`、`/api/usage/chart`、`/api/usage/stream`、`/api/usage/request-details`。
- POST `/api/auth/login`、`/api/auth/logout`（用户显式登录/退出）。
- 管理模式：POST `/api/keys`、`/api/providers`、`/api/providers/:id/test`；PUT/DELETE `/api/keys/:id`、`/api/providers/:id`。

其他 API 请求会被代理拒绝。客户端与代理共用请求白名单，修改请求检查 Origin。Cookie/会话检查由后端完成；前端不注入 CLI token，也不绕过本机权限。真实后端业务读写、OAuth、SSO、Cookie 续期和本机访问矩阵仍需认证环境验证，演示接口测试不能代替真实网关验收。

当前不代理模型入口，也不提供生产反向代理方案。模型客户端继续使用原端点。部署切换、代理信任、权限、SSE 缓冲及回调配置需单独评审。

## 构建与验证

```powershell
npm test
npm run build
npm run preview
```

`preview` 默认使用隔离演示服务，可验证已构建产物；独立 Vite CLI 预览没有演示 API，不能替代启动器。生产产物只包含前端，不包含内存演示服务器；仍需真实同源后端接入。

浏览器测试使用 Playwright（测试工具，不属于运行依赖）。若机器已有该模块，指定其绝对位置：

```powershell
$env:PLAYWRIGHT_MODULE = 'C:\path\to\node_modules\playwright'
$env:BROWSER_CHANNEL = 'msedge'
node tests/browser.mjs
node tests/core-browser.mjs --section=keys
node tests/core-browser.mjs --section=providers
node tests/core-browser.mjs --section=models
node tests/core-browser.mjs --section=logs
node tests/core-browser.mjs --section=layout
node tests/token-cache-browser.mjs
node tests/monitor-browser.mjs
node tests/tps-browser.mjs
node tests/balances-cards-browser.mjs
node tests/balances-browser.mjs
```

测试覆盖登录、访问白名单、错误接口类型、Token 口径、SSE、自动刷新与暂停、搜索、筛选、主题、默认概览、连接摘要、最近请求、深链接、导航，以及六个核心页面的五个屏宽。管理验收覆盖密钥与供应商生命周期、测试失败反馈、模型复制、日志分页/筛选/导出/详情、手机弹窗及登录失效。真实网关仅完成健康和登录状态接口探测，业务读写验收尚未执行。

设置 `SCREENSHOT_DIR` 后，浏览器测试会生成概览深浅主题、手机概览、端点、供应商、模型、日志和手机密钥弹窗截图。当前页面截图保存在 `screenshots/`。

真实后端未登录检查可运行 `node tests/real-backend-browser.mjs`，只检查健康、登录状态、未登录访问保护和登录界面，不提交密码或修改业务数据。`tests/browser.mjs` 和 `tests/core-browser.mjs` 使用演示登录，须在隔离演示服务上运行；40 个连接的完整显示由演示浏览器测试中的模拟响应验证。

在已配置真实后端的机器上，可显式启动另一个隔离测试服务：`$env:TENROUTER_PORT = '4318'; node scripts/dev.mjs --demo`。浏览器验收前设置 `$env:PREVIEW_URL = 'http://127.0.0.1:4318'`；测试会先检查演示模式，再提交演示密码。

## Windows 共享盘运行依赖

若系统拒绝从 UNC 目录加载 Rollup/Tailwind 等 `.node` 原生模块，可将安装好的 `node_modules` 复制到本机专用缓存目录，设置 `TENROUTER_TOOLCHAIN_DIR` 为该目录（包含 `node_modules` 的父目录）。启动器和构建脚本只从缓存加载构建工具；源码和业务依赖仍由本项目管理，不依赖后端源码。该设置仅解决开发机器限制，不属于生产部署配置。

设置 `TENROUTER_TOOLCHAIN_DIR` 后，Vite 优化依赖也保存在本机 `node_modules/.vite/10router-web-<数据模式>`，避免每次导航读取共享盘缓存。开发服务器复用经过 Vite 转换的页面入口，修改 `index.html` 会使入口缓存失效；源码继续热更新。供应商图标按需加载，代理组和默认节点并行读取；刷新状态仍读取实际接口，不缓存登录权限或代理选择。服务启动后首次访问需要预热模块，后续导航不再重复处理入口文件。

页面与统计图表按需加载，代理控制首屏不再加载其他页面或 Recharts。订阅和看护组件在打开对应页签时加载；开发服务启动时预热这两个组件，减少共享盘首次编译导致的点击等待。`node tests/proxy-performance.mjs` 测量本机代理首屏、资源和页签耗时，使用隔离网关会话只读调用真实 Hermes；可设置 `PREVIEW_URL` 和 `PERFORMANCE_REPORT` 指定预览入口与报告路径。该测量不代替真实网关登录验收。

本机预览中的配额卡片按供应商标识分组排列，CodeBuddy CN 与 CodeBuddy 保留独立分组；卡片固定 340px 高。Antigravity 按模型族展示 5 小时、每周的独立进度条和重置倒计时；CodeBuddy、Qoder 展示剩余额度、资源包分段条、可用包数量及最近重置/到期时间，汇总与明细不重复相加。普通账号显示前三项摘要。明细使用独立弹窗，资源包明细默认隐藏已耗尽和已到期的非循环包，可勾选查看；手机使用全屏明细和较大字号，长列表在明细区域内滚动，标题和关闭操作固定。`tests/balances-cards-browser.mjs` 使用模拟账号验证模型分组、资源包汇总、32 项配额、五个供应商分组、固定卡片布局、关闭/键盘焦点、四个屏宽及深浅主题；模拟数据不代替真实请求验收。此布局调整尚未发布，真实配额接口需要有效会话。

`tests/quota-live-browser.mjs` 正常登录真实网关后，检查浏览器实际收到的 `/api/usage/quotas` 响应、真实账号数量、各类账号卡片及明细、三种屏宽的深浅主题截图；不拦截或替换接口。可通过 `TENROUTER_TEST_COOKIE_FILE` 使用已有会话，或用 `TENROUTER_TEST_LOGIN_ENV` 指定包含登录凭据的配置文件；`--password-stdin` 从标准输入读取密码，不写入凭据文件。2026-10-04 使用有效凭据完成本机真实验收：配额接口返回 200，读取 9 个账号，CodeBuddy CN、Antigravity、Qoder 的卡片和明细通过 1440、375、320px 深浅主题检查，控制台错误和未捕获异常均为 0。截图以 `C:/Users/20449/.codex/tmp/quota-real-` 为前缀，验收报告为同目录 `quota-live-acceptance.json`。关闭明细后等待焦点恢复，再定位下一张卡片，保证截图对应实际目标。脚本遇到登录失败立即退出，不自动重试。历史接口快照只用于核对数据结构，不能算作本次实时请求验收。此验收不表示已部署上线。

```powershell
$env:TENROUTER_TOOLCHAIN_DIR = 'C:\Users\20449\.codex\tmp\10router-web-runtime'
$env:CHOKIDAR_USEPOLLING = 'true'
node scripts/dev.mjs
node scripts/build.mjs
```

# KN10 网关每日签到

入口为 /dashboard/checkins。签到运行在前端独立服务桥内，不修改模型请求进程、供应商模型 Key 或原网关数据库。默认实现是原生 Node.js 适配；仅 AnyRouter 因站点防护使用 KN10 本机 Playwright Chromium 子进程（见下文），不引入 anyrouter-check-in 仓库源代码。

## 当前支持范围

- 多个公网 HTTPS 站点、每站多个账号（总计最多100个）；New API 默认 POST /api/user/checkin，旧版 Sign In 默认 POST /api/user/sign_in。
- 允许指定 /api/user/ 下的签到路径；不允许请求任意内网、非标准端口、携带查询参数或跨站转发登录凭据。出站 DNS 检查全部解析结果，连接固定到已验证的公网地址，保留 TLS 主机校验，不跟随重定向。
- Cookie + 数字用户 ID 或网站登录 Bearer 令牌；网站登录令牌不是模型调用 sk- Key。站点账号由用户自行登录并提供凭据，本版不保存密码、不刷新令牌、不处理 OAuth/验证码。
- 手动单账号签到、批量签到及重试失败账号；执行前二次确认，批次串行执行，任务返回后可在页面跟踪进度。
- 分别记录成功、今日已签到、登录过期、需要人工验证、接口不兼容和失败；混合结果为“部分失败”，不会把一个账号成功当全部成功。
- 仅展示站点实际返回的 quota_awarded 原始额度，不猜测美元、不从余额变化推算奖励。保留最近500条记录。
- 服务重启后未确认的执行显示“结果未确认”，不自动重试，避免重放已经成功的签到。

这不是全站点兼容承诺。启用验证码、特殊接口、异步奖励或不同鉴权方式的站点须逐个验证；需要验证时请到原站点处理，不绕过安全检查。本版没有通知、用户名密码登录或 Cookie 自动获取。

## AnyRouter 浏览器签到

AnyRouter 站点防护要求真实浏览器执行 JavaScript，普通 HTTP 请求只会拿到防护页。该站点改用 KN10 本机 Playwright Chromium：独立 Python 子进程以持久化 profile（TENROUTER_ANYROUTER_PROFILE_DIR 默认 TENROUTER_CHECKIN_DIR/anyrouter-profile）经签到代理打开原站、等待防护页自行解决，再在同一 Cookie 罐内 POST 签到接口；只回传白名单 RESULT 行（success/already/expired/verification/unsupported/error），不输出 Cookie 或异常原文。90 秒强制终止。其他站点仍走原生 HTTP 路径，不受影响。

依赖：KN10 需 python3 + playwright（chromium 已安装于 /home/meet/.cache/ms-playwright，服务单元设置 PLAYWRIGHT_BROWSERS_PATH）。浏览器无法绕过验证码；若 profile 未通过防护验证，账号记为人工验证失败，需要人工在浏览器中过一次验证（可在 KN10 上以有头模式打开一次该 profile）。

自动调度：服务单元设置 TENROUTER_CHECKIN_AUTOMATIC=1 后，桥每小时检查一次，北京时间 09:00 后自动对“当天 08:00 后未确认成功或已签到”的启用账号执行一轮任务；08:00 前的确认不算当日成功（AnyRouter 每日额度 08:00 重置）。执行仍走同一加密记录与结果分类，页面历史记录可核对。设为 0 或不设置则关闭自动签到，行为回到纯手动。

## AnyRouter 配置与失败诊断

AnyRouter（https://anyrouter.top）使用旧版 Sign In，签到路径为 /api/user/sign_in，不是 New API 的 /api/user/checkin。编辑器识别精确站点地址后提供“应用 AnyRouter 推荐配置”，仅修改表单，保存和真实签到仍须分别确认。已有错误配置不会自动迁移；页面阻止执行并提示编辑，服务端也拒绝向已知错误接口发送凭据。更换协议或接口时须重新填写登录凭据。

Cookie 字段必须填写完整请求头（如 session=会话值），不能只粘贴会话值或带 Cookie: 前缀；服务端校验每个 Cookie 的名称和值分隔符，拒绝裸会话值，不会自行猜测 Cookie 名称。

执行记录只保存白名单诊断码与固定提示，区分 DNS、代理连接、TLS、超时、非公网地址、响应异常、错误接口、限流和防护验证。异常原文、响应正文、Cookie 和 Token 不写入记录。HTML 防护页（包括 HTTP 200、acw_tc/cdn_sec_tc/acw_sc__v2）标记为人工验证，不视为签到成功；请求优先使用未压缩响应，兼容 gzip/deflate/br 并限制解压后大小。

遇到防护验证请到原站人工处理，再更新完整 Cookie；代理可通不等于登录有效。超时或响应中断先到原站核对是否已签到，确认后再手动重试，不自动重放。

## 存储与权限

设置服务端 TENROUTER_CHECKIN_DIR 指向仓库外的独立目录。所有账号凭据、历史及任务都通过 AES-256-GCM 加密写入 vault.json，32字节密钥保存在同目录 vault.key。Linux目录权限0700、文件0600；Windows须由操作系统ACL限制该目录。不要把目录、备份或密钥放进Git，不要发送凭据给在线配置生成器。机器管理员可读取密钥，因此加密不是主机失陷防护。

已有 systemd 单元配置了 StateDirectory=10router-checkins 和 %h/.local/state/10router-checkins，此目录独立于只读的发布目录，随版本切换保持不变。运行时必须单实例、单写入者；不要让预览服务和正式服务共享同一凭据目录。备份需一起保存密文和密钥到受保护目录，缺少密钥会拒绝读取，不能重建密钥解密旧数据。

未设置目录时页面可打开，但显示“存储未启用”，不会创建账号文件、执行签到或把凭据代理给模型后端。开发模式需显式设置独立测试目录；演示模式默认不启用真实存储。

API使用现有网关登录校验，读请求也需登录。写操作同时要求管理模式、同源Origin、JSON内容类型及有限请求大小；接口不返回Cookie或Token。上游错误正文不存储、不显示，以免凭据出现在日志。自动调度仅在 TENROUTER_CHECKIN_AUTOMATIC=1 时启用，见上文。

## 签到专用出站代理

服务端可设置 TENROUTER_CHECKIN_PROXY_URL 为不含凭据、路径或查询参数的 HTTP 代理 origin。KN10 服务单元设为 http://127.0.0.1:7890（此地址是网关本机，不是 Windows 本机）。此设置仅影响签到，不修改 mihomo、模型请求代理或账号凭据；未设置时保持原有直连行为，配置代理后连接失败不会回退直连。

代理模式使用原生 HTTP CONNECT 和 TLS，保留证书及站点主机名校验，不新增依赖。为避免重复使用本机异常 DNS，A/AAAA 记录由固定的 Cloudflare DoH 端点通过同一代理查询；查询只包含站点域名，不发送账号 Cookie、Token 或用户 ID。全部地址仍须通过公网校验，签到 CONNECT 固定到已校验的公网 IP，不让代理再次解析签到域名，不跟随重定向。加密 DNS 不可用或返回内网地址时拒绝执行。

代理接通不代表站点允许签到；WAF 验证页仍须到原站人工处理。本设置不会修正账号 Cookie 或签到路径，也不会绕过验证码。回滚时恢复服务单元及代码到修改前版本；不需要修改或清理签到存储。

## 验证

- node --test tests/checkins.test.mjs tests/checkin-bridge.test.mjs tests/checkin-proxy.test.mjs
- node tests/checkins-browser.mjs 使用临时加密目录、隔离演示登录和受控模拟站点执行器；不会访问真实签到站点或原网关数据库。
- node tests/checkins-live-browser.mjs 在 Windows 上使用已有 Edge 和私有网关登录凭据，只读验收真实页面、账号显示、手机布局和控制台。除已有授权的网关登录外不发写请求，不调用真实签到、不修改账号或历史，也不访问外站；PREVIEW_URL 和 TENROUTER_TEST_LOGIN_ENV 可指定已实测入口与凭据文件。
- npm test、npm run build；上线前需提供实际站点地址及私有凭据，再逐站验证。

## 上线

源码与构建、签到服务桥及全部签到模块（checkin-service/checkin-client/checkin-bridge/checkin-runner/checkin-schedule/anyrouter-browser-checkin 的 mjs 与 py）须一起发布。原部署脚本已补齐模块复制、语法检查（含 py_compile 与 playwright 导入检查）及签到测试；上线应安装新服务单元并检查独立StateDirectory权限。浏览器 profile 目录位于 StateDirectory 内，随版本切换保留。不要仅更新页面而遗漏服务桥或可写数据目录。部署授权与自动调度需要单独确认。

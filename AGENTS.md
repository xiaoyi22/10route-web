# 真实网关与登录凭据

> 本文件只补充本项目细节，不得削弱 `C:/Users/Meet/.codex/AGENTS.md` 的全局铁律；冲突时以全局为准。

- 用户要求页面预览和业务验收使用真实数据。真实后端为 `http://192.168.11.150:20128`，真实前端入口为 `http://192.168.11.150:4317`（与后端同机的 systemd 服务）。
- 2026-10-08 本机 Windows（用户 `Meet`）没有监听 `127.0.0.1:4317`；2026-10-10 实测该端口已由本地开发工具启动隔离演示服务，`/api/auth/status` 返回 `demo:true`。本地端口会随开发服务变化，不能作为真实网关入口；真实数据验收使用 `192.168.11.150:4317`，并先实测端口与认证模式。出口代理仍在网关上，不假定本机存在 `7890/7891/7892`。
- 当前登录凭据保存在 `C:/Users/Meet/.codex/credentials/10router-web.env` 的 `TENROUTER_TEST_PASSWORD` 字段；用户已授权登录真实网关进行验收。旧路径 `C:/Users/20449/.codex/credentials/10router-web.env` 在本机已不存在。
- `R:/10router/.env` 的 `INITIAL_PASSWORD` 已实测登录返回 401，不能作为当前网关密码使用。
- 凭据文件不在项目仓库中。不要输出密码、会话 Cookie 或上游 Token，也不要将其提交到版本控制。
- `tests/provider-routing-live-browser.mjs` 默认读取上述私有凭据文件，也支持 `TENROUTER_TEST_LOGIN_ENV` 或 `TENROUTER_TEST_COOKIE_FILE` 指定有效凭据。

## 运行与验证

- Windows PowerShell 下执行 npm/npx 命令使用 `npm.cmd` / `npx.cmd`；本机执行策略会拦截 `npm.ps1`，不要先尝试裸 `npm` / `npx`，也不为运行测试修改执行策略。
- 运行时为 Node `v22.22.2`：`node:https` 与全局 `fetch` 都不读 `HTTPS_PROXY`，也不导出 `undici`。需要走出口代理必须自建 HTTP CONNECT 隧道或显式传 agent，只设环境变量无效。
- 服务端签到等持久化由 `TENROUTER_CHECKIN_DIR` 决定目录；未设置时页面显示“存储未启用”，不会写任何凭据。
- 改动后必须回归再交付：`npm test` + `npm run build`；涉及真实网关行为时补跑对应 `tests/*-live-browser.mjs`，并给出真实 HTTP 状态码与断言输出。
- 上线（`scripts/deploy-kn10.sh`、systemd 重启）与真实签到等对外写操作需用户单独确认后才执行。\r\n

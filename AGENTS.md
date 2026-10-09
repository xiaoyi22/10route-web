# 真实网关与登录凭据

> 本文件只补充本项目细节，不得削弱 `C:/Users/Meet/.codex/AGENTS.md` 的全局铁律；冲突时以全局为准。

- 用户要求页面预览和业务验收使用真实数据。真实后端为 `http://192.168.11.150:20128`，真实前端入口为 `http://192.168.11.150:4317`（与后端同机的 systemd 服务）。
- 本机 Windows（用户 `Meet`）没有监听 `127.0.0.1:4317`，本机也没有 `7890/7891/7892`；出口代理与前端都在网关 `192.168.11.150` 上（2026-10-08 端口探测实测）。验收前先实测端口，不要再照抄旧的 `127.0.0.1:4317`。
- 当前登录凭据保存在 `C:/Users/Meet/.codex/credentials/10router-web.env` 的 `TENROUTER_TEST_PASSWORD` 字段；用户已授权登录真实网关进行验收。旧路径 `C:/Users/20449/.codex/credentials/10router-web.env` 在本机已不存在。
- `R:/10router/.env` 的 `INITIAL_PASSWORD` 已实测登录返回 401，不能作为当前网关密码使用。
- 凭据文件不在项目仓库中。不要输出密码、会话 Cookie 或上游 Token，也不要将其提交到版本控制。
- `tests/provider-routing-live-browser.mjs` 默认读取上述私有凭据文件，也支持 `TENROUTER_TEST_LOGIN_ENV` 或 `TENROUTER_TEST_COOKIE_FILE` 指定有效凭据。

## 运行与验证

- 运行时为 Node `v22.22.2`：`node:https` 与全局 `fetch` 都不读 `HTTPS_PROXY`，也不导出 `undici`。需要走出口代理必须自建 HTTP CONNECT 隧道或显式传 agent，只设环境变量无效。
- 服务端签到等持久化由 `TENROUTER_CHECKIN_DIR` 决定目录；未设置时页面显示“存储未启用”，不会写任何凭据。
- 改动后必须回归再交付：`npm test` + `npm run build`；涉及真实网关行为时补跑对应 `tests/*-live-browser.mjs`，并给出真实 HTTP 状态码与断言输出。
- 上线（`scripts/deploy-kn10.sh`、systemd 重启）与真实签到等对外写操作需用户单独确认后才执行。\r\n
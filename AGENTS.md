# 真实网关与登录凭据

- 用户要求页面预览和业务验收使用真实数据。真实后端为 `http://192.168.11.150:20128`，本地真实入口为 `http://127.0.0.1:4317`。
- 当前登录凭据保存在 `C:/Users/20449/.codex/credentials/10router-web.env` 的 `TENROUTER_TEST_PASSWORD` 字段；用户已授权登录真实网关进行验收。
- `R:/10router/.env` 的 `INITIAL_PASSWORD` 已实测登录返回 401，不能作为当前网关密码使用。
- 凭据文件不在项目仓库中。不要输出密码、会话 Cookie 或上游 Token，也不要将其提交到版本控制。
- `tests/provider-routing-live-browser.mjs` 默认读取上述私有凭据文件，也支持 `TENROUTER_TEST_LOGIN_ENV` 或 `TENROUTER_TEST_COOKIE_FILE` 指定有效凭据。

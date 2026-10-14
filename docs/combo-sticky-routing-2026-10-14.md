# 组合模型独立调度设置

## 状态

已于 2026-10-14 17:17 上线前后端并完成生产验收。本轮前端由真实 10Router 模型路由 `ag/gemini-3.8-flash` 生成，流式响应 HTTP 200，返回模型标识 `gemini-3.8-flash-n`。Codex 审查并修正整数校验、继承状态显示及复选框尺寸。

## 设置约定

```json
{
  "comboStrategies": {
    "my-primary": {
      "fallbackStrategy": "fallback"
    },
    "my-sticky": {
      "fallbackStrategy": "round-robin",
      "comboStickyRoundRobinLimit": 9
    }
  }
}
```

每组合的策略和次数分别继承全局。次数读取顺序为组合内的 `comboStickyRoundRobinLimit`、全局同名字段、默认 1；供应商账号的 `stickyRoundRobinLimit` 不变。次数必须是安全正整数。继承时删除对应覆盖键；切到主备模式保留已有非活动次数；改名迁移覆盖设置，保留其他字段。

粘性次数按组合请求计数，工具调用也会产生请求；不是单个会话的对话轮数。计数存在进程内，重启或更新组合调度设置会重置。现有算法在主备模式下不轮换；轮询中失败仍可回退后续成员。缓存命中率与实际速度取决于上游缓存和请求内容。

## 改动范围

- 前端：`src/pages/CombosPage.jsx`。
- 后端补丁：`patches/combo-sticky-backend.patch`，涵盖 5 个调用文件（聊天含两个入口）、设置校验、部署检查与 3 个单元测试文件。
- 新增 `PATCH_CHECKS`：6 条，已应用到生产并实测命中；反向 `git apply --check` 通过。

## 验证结果

- 前端 `npm.cmd test`：125 通过；`npm.cmd run build`：通过。
- 后端组合专项：35 通过，涵盖所有调用入口、嵌套聊天、9次、继承、独立计数、非法设置与重置。
- 隔离后端：`/home/meet/10router-combo-release-20261014`，版本 `1.4.0-test.combo.20261014`，生产构建与资源复制通过，数据目录独立。
- `tests/backend-combo-sticky-e2e.mjs`：实际隔离 HTTP 服务验证 9 次 A / 9 次 B / A、全局 3 次、主备故障回退；设置与聊天 HTTP 200，非法次数 HTTP 400 且原设置保持。
- `tests/combo-sticky-live-browser.mjs`：真实网关认证及读取 HTTP 200，无 demo 标记。保存测试在浏览器内拦截，生产配置零写入。覆盖保存刷新、改名、分别继承、未知策略、并发新增字段保留、两阶段失败重试。
- 桌面 1440 和手机 375 截图已审查，无溢出、无未捕获异常。证据：`reports/combo-sticky/`。
- 发布时检测到另一任务新增实际响应模型记录，首次校验停止并回退本轮源码，原生产服务保持运行。随后完整保留该任务的 5 个改动文件，在隔离目录重新构建；组合、监控、请求详情及响应模型验证共 94 项通过。
- 发布脚本再跑前端 125 项与服务边界 46 项测试，均通过。
- `tests/combo-sticky-production-browser.mjs`：在真实生产临时组合上保存 9 次并刷新保持、切换主备保留次数、次数与策略分别继承均通过。认证和保存 HTTP 200，非法次数 HTTP 400，临时组合与其覆盖配置已删除，原有组合和全局次数未修改。证据：`reports/combo-sticky/production/acceptance.json`。
- 本地真实数据预览：`http://127.0.0.1:4326/dashboard/combos`；页面操作可写入真实网关，验收脚本自身拦截了组合及设置保存。

## 发布记录

用户于本轮明确授权“上线”。已通过现有前端部署脚本发布，并重启两个用户级 systemd 服务，状态均为 active。

- 生产入口：`http://192.168.11.150:4317/dashboard/combos`。
- 后端构建标识：`Q7MjYCQUU1IYZj3-Y1uIv`。独立构建携带原验收版本戳 `1.4.0-test.combo.20261014`；上游源码分支保持 `upgrade-v1.4.0-run`。
- 后端进程：`3867554`；前端进程：`3868410`。
- 前端发布目录：`/home/meet/.local/share/10router-web/releases/20261014-171746`。
- 统一回滚备份：`/home/meet/backups/combo-routing-release-20261014-171711/`，包含旧构建、限定源码备份及发布前在线 SQLite 备份。
- 前端部署备份：`/home/meet/backups/10router-web/20261014-171746/`。
- 首次停止的预备备份：`/home/meet/backups/combo-routing-release-20261014-170846/`。

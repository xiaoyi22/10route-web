# WindHub 请求日志结算

流式请求以解析器识别的协议终止事件判定完成，不以 HTTP 200 或控制台的 DONE 结算行判定成功。正常终止后客户端关闭或传输层关闭，不再把已结算的请求详情覆盖成零 Token 的失败记录。真正中途断流仍标为失败，同时保留已取得的用量和首字延迟。

实测 usage 优先于估算。带空 delta 的 usage 帧不再被空内容过滤器跳过。Chat 结束帧本身缺少 usage 时，不覆盖此前已取得的实测用量；实测尾包到达时，也不使用估算值与实测值取最大值。缺少上游 usage 时保留既有估算兜底，并在详情、元数据和 CSV 中明确标注，不把估算当作上游计费值。历史记录缺少来源信息显示“未记录”，不按非零 Token 推断为实测。

请求详情的 error 字段仅保留脱敏、限长的状态码、错误码和原因；原始请求、响应内容继续由 API 脱敏。WindHub 的 channel_daily_success_limit_exceeded 是真实 HTTP 429，界面显示“渠道当日成功次数已达上限”，不会将其改成成功或补造 Token。

验证：node --test tests/request-observation.test.mjs；node tests/windhub-log-browser.mjs 使用隔离演示入口。后端行为测试为 tests/unit/stream-detail-finalization.test.js、tests/unit/stream-usage-provenance.test.js，数据库测试使用临时 SQLite，不改生产历史数据。

2026-10-08 隔离真实验收：WindHub 的 qwen3.8-flash-next 分别通过 Chat 和 Responses 入口请求，均返回 HTTP 200，日志状态 success、用量来源 upstream、输入 55 Token、输出 16 Token；收到终止事件后关闭客户端不会改写成失败。两条链路实际出口均为 /v1/chat/completions，不混淆入口与出口。gpt-6-luna 的真实请求返回 HTTP 429，错误码 channel_daily_success_limit_exceeded；此类拒绝未提供用量，不补造 Token。后端相关 11 个测试文件共 69 项通过，前端单元测试 77 项通过。

真实调用脚本 tests/windhub-logs-live.mjs 要求显式设置 TENROUTER_SANDBOX_URL=http://127.0.0.1:20129，使用隔离数据库及已有网关 Key；设置 TENROUTER_SANDBOX_SKIP_LUNA=1 可跳过已经确认限额的 Luna 请求。修复不会回填历史记录，也不改变供应商 API 类型或凭据。

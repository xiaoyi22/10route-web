# 10router-web 测试用例与 UI 矩阵（重建版）

> 本目录根据当前仓库与 Mem0 摘要重建，不是家庭电脑的原始文件。历史汇总没有逐条 ID 映射，不会猜填用例结果。

## 历史执行快照

本次重建保留两份不一致的 Mem0 历史快照：较新记录为 26 passed、87 partial、7 failed、368 unexecuted；较早记录为 2 passed、66 partial、5 failed。不能在缺少原始逐项数据时将其合并或猜测归属。

- Mem0 最新摘要：488 条中 26 passed、87 partial、7 failed、368 unexecuted。
- 另有更早的快照：2 passed、66 partial、5 failed；与后续快照不同，保留为独立历史记录。
- 明确点名的历史通过共 8 条 AUTH/NAV；其他历史计数未分配到重建 ID。
- 本文档中 480 条标为 not-run-reconstructed，表示本次重建未运行，不代表家用电脑历史未测。
- UI 矩阵：288 项；19 路由 x 3 宽度 x 2 主题 x 2 认证态 = 228；15 个关键页在 320/1920 宽度下加测 60 项。

## 风险与执行边界

- read-only：可用于真实网关仅读验收。
- isolated-fixture / isolated-auth / isolated-upstream：须在隔离测试数据与固定响应环境执行。
- destructive-isolated：仅限隔离数据库；真实业务写入和破坏性操作须单独确认。

## 488 条用例

| ID | Page/group | Category | Scenario | Route | Risk | Status |
|---|---|---|---|---|---|---|
| `OVERVIEW-01` | Overview | route | Overview: route | `/dashboard/overview` | read-only | not-run-reconstructed |
| `OVERVIEW-02` | Overview | initial-load | Overview: initial-load | `/dashboard/overview` | read-only | not-run-reconstructed |
| `OVERVIEW-03` | Overview | refresh | Overview: refresh | `/dashboard/overview` | read-only | not-run-reconstructed |
| `OVERVIEW-04` | Overview | empty | Overview: empty | `/dashboard/overview` | isolated-fixture | not-run-reconstructed |
| `OVERVIEW-05` | Overview | api-error | Overview: api-error | `/dashboard/overview` | isolated-fixture | not-run-reconstructed |
| `OVERVIEW-06` | Overview | filter | Overview: filter | `/dashboard/overview` | read-only | not-run-reconstructed |
| `OVERVIEW-07` | Overview | search | Overview: search | `/dashboard/overview` | read-only | not-run-reconstructed |
| `OVERVIEW-08` | Overview | pagination | Overview: pagination | `/dashboard/overview` | read-only | not-run-reconstructed |
| `OVERVIEW-09` | Overview | sort | Overview: sort | `/dashboard/overview` | read-only | not-run-reconstructed |
| `OVERVIEW-10` | Overview | detail | Overview: detail | `/dashboard/overview` | read-only | not-run-reconstructed |
| `OVERVIEW-11` | Overview | copy | Overview: copy | `/dashboard/overview` | local-only | not-run-reconstructed |
| `OVERVIEW-12` | Overview | keyboard | Overview: keyboard | `/dashboard/overview` | read-only | not-run-reconstructed |
| `OVERVIEW-13` | Overview | accessible-name | Overview: accessible-name | `/dashboard/overview` | read-only | not-run-reconstructed |
| `OVERVIEW-14` | Overview | contrast | Overview: contrast | `/dashboard/overview` | read-only | not-run-reconstructed |
| `OVERVIEW-15` | Overview | responsive | Overview: responsive | `/dashboard/overview` | read-only | not-run-reconstructed |
| `OVERVIEW-16` | Overview | error-boundary | Overview: error-boundary | `/dashboard/overview` | isolated-fixture | not-run-reconstructed |
| `OVERVIEW-17` | Overview | loading-repeat | Overview: loading-repeat | `/dashboard/overview` | read-only | not-run-reconstructed |
| `OVERVIEW-18` | Overview | auth-guard | Overview: auth-guard | `/dashboard/overview` | read-only | not-run-reconstructed |
| `OVERVIEW-19` | Overview | session-expiry | Overview: session-expiry | `/dashboard/overview` | isolated-auth | not-run-reconstructed |
| `OVERVIEW-20` | Overview | write-guard | Overview: write-guard | `/dashboard/overview` | destructive-isolated | not-run-reconstructed |
| `OVERVIEW-21` | Overview | validation | Overview: validation | `/dashboard/overview` | destructive-isolated | not-run-reconstructed |
| `OVERVIEW-22` | Overview | persistence | Overview: persistence | `/dashboard/overview` | destructive-isolated | not-run-reconstructed |
| `OVERVIEW-23` | Overview | duplicate-submit | Overview: duplicate-submit | `/dashboard/overview` | destructive-isolated | not-run-reconstructed |
| `OVERVIEW-24` | Overview | network-method | Overview: network-method | `/dashboard/overview` | isolated-fixture | not-run-reconstructed |
| `OVERVIEW-25` | Overview | console-clean | Overview: console-clean | `/dashboard/overview` | read-only | not-run-reconstructed |
| `PROVIDERS-01` | Providers | route | Providers: route | `/dashboard/providers` | read-only | not-run-reconstructed |
| `PROVIDERS-02` | Providers | initial-load | Providers: initial-load | `/dashboard/providers` | read-only | not-run-reconstructed |
| `PROVIDERS-03` | Providers | refresh | Providers: refresh | `/dashboard/providers` | read-only | not-run-reconstructed |
| `PROVIDERS-04` | Providers | empty | Providers: empty | `/dashboard/providers` | isolated-fixture | not-run-reconstructed |
| `PROVIDERS-05` | Providers | api-error | Providers: api-error | `/dashboard/providers` | isolated-fixture | not-run-reconstructed |
| `PROVIDERS-06` | Providers | filter | Providers: filter | `/dashboard/providers` | read-only | not-run-reconstructed |
| `PROVIDERS-07` | Providers | search | Providers: search | `/dashboard/providers` | read-only | not-run-reconstructed |
| `PROVIDERS-08` | Providers | pagination | Providers: pagination | `/dashboard/providers` | read-only | not-run-reconstructed |
| `PROVIDERS-09` | Providers | sort | Providers: sort | `/dashboard/providers` | read-only | not-run-reconstructed |
| `PROVIDERS-10` | Providers | detail | Providers: detail | `/dashboard/providers` | read-only | not-run-reconstructed |
| `PROVIDERS-11` | Providers | copy | Providers: copy | `/dashboard/providers` | local-only | not-run-reconstructed |
| `PROVIDERS-12` | Providers | keyboard | Providers: keyboard | `/dashboard/providers` | read-only | not-run-reconstructed |
| `PROVIDERS-13` | Providers | accessible-name | Providers: accessible-name | `/dashboard/providers` | read-only | not-run-reconstructed |
| `PROVIDERS-14` | Providers | contrast | Providers: contrast | `/dashboard/providers` | read-only | not-run-reconstructed |
| `PROVIDERS-15` | Providers | responsive | Providers: responsive | `/dashboard/providers` | read-only | not-run-reconstructed |
| `PROVIDERS-16` | Providers | error-boundary | Providers: error-boundary | `/dashboard/providers` | isolated-fixture | not-run-reconstructed |
| `PROVIDERS-17` | Providers | loading-repeat | Providers: loading-repeat | `/dashboard/providers` | read-only | not-run-reconstructed |
| `PROVIDERS-18` | Providers | auth-guard | Providers: auth-guard | `/dashboard/providers` | read-only | not-run-reconstructed |
| `PROVIDERS-19` | Providers | session-expiry | Providers: session-expiry | `/dashboard/providers` | isolated-auth | not-run-reconstructed |
| `PROVIDERS-20` | Providers | write-guard | Providers: write-guard | `/dashboard/providers` | destructive-isolated | not-run-reconstructed |
| `PROVIDERS-21` | Providers | validation | Providers: validation | `/dashboard/providers` | destructive-isolated | not-run-reconstructed |
| `PROVIDERS-22` | Providers | persistence | Providers: persistence | `/dashboard/providers` | destructive-isolated | not-run-reconstructed |
| `PROVIDERS-23` | Providers | duplicate-submit | Providers: duplicate-submit | `/dashboard/providers` | destructive-isolated | not-run-reconstructed |
| `PROVIDERS-24` | Providers | network-method | Providers: network-method | `/dashboard/providers` | isolated-fixture | not-run-reconstructed |
| `PROVIDERS-25` | Providers | console-clean | Providers: console-clean | `/dashboard/providers` | read-only | not-run-reconstructed |
| `AUTH-001` | Authorization | route | Authorization: route | `/dashboard/authorization` | read-only | not-run-reconstructed |
| `AUTH-002` | Authorization | initial-load | Authorization: initial-load | `/dashboard/authorization` | read-only | not-run-reconstructed |
| `AUTH-003` | Authorization | refresh | Authorization: refresh | `/dashboard/authorization` | read-only | not-run-reconstructed |
| `AUTH-004` | Authorization | empty | Authorization: empty | `/dashboard/authorization` | isolated-fixture | passed-historical-mem0 |
| `AUTH-005` | Authorization | api-error | Authorization: api-error | `/dashboard/authorization` | isolated-fixture | not-run-reconstructed |
| `AUTH-006` | Authorization | filter | Authorization: filter | `/dashboard/authorization` | read-only | passed-historical-mem0 |
| `AUTH-007` | Authorization | search | Authorization: search | `/dashboard/authorization` | read-only | not-run-reconstructed |
| `AUTH-008` | Authorization | pagination | Authorization: pagination | `/dashboard/authorization` | read-only | not-run-reconstructed |
| `AUTH-009` | Authorization | sort | Authorization: sort | `/dashboard/authorization` | read-only | not-run-reconstructed |
| `AUTH-010` | Authorization | detail | Authorization: detail | `/dashboard/authorization` | read-only | passed-historical-mem0 |
| `AUTH-011` | Authorization | copy | Authorization: copy | `/dashboard/authorization` | local-only | not-run-reconstructed |
| `AUTH-012` | Authorization | keyboard | Authorization: keyboard | `/dashboard/authorization` | read-only | not-run-reconstructed |
| `AUTH-013` | Authorization | accessible-name | Authorization: accessible-name | `/dashboard/authorization` | read-only | not-run-reconstructed |
| `AUTH-014` | Authorization | contrast | Authorization: contrast | `/dashboard/authorization` | read-only | not-run-reconstructed |
| `AUTH-015` | Authorization | responsive | Authorization: responsive | `/dashboard/authorization` | read-only | not-run-reconstructed |
| `AUTH-016` | Authorization | error-boundary | Authorization: error-boundary | `/dashboard/authorization` | isolated-fixture | not-run-reconstructed |
| `AUTH-017` | Authorization | loading-repeat | Authorization: loading-repeat | `/dashboard/authorization` | read-only | not-run-reconstructed |
| `AUTH-018` | Authorization | auth-guard | Authorization: auth-guard | `/dashboard/authorization` | read-only | not-run-reconstructed |
| `AUTH-019` | Authorization | session-expiry | Authorization: session-expiry | `/dashboard/authorization` | isolated-auth | not-run-reconstructed |
| `AUTH-020` | Authorization | write-guard | Authorization: write-guard | `/dashboard/authorization` | destructive-isolated | not-run-reconstructed |
| `AUTH-021` | Authorization | validation | Authorization: validation | `/dashboard/authorization` | destructive-isolated | not-run-reconstructed |
| `AUTH-022` | Authorization | persistence | Authorization: persistence | `/dashboard/authorization` | destructive-isolated | not-run-reconstructed |
| `AUTH-023` | Authorization | duplicate-submit | Authorization: duplicate-submit | `/dashboard/authorization` | destructive-isolated | not-run-reconstructed |
| `AUTH-024` | Authorization | network-method | Authorization: network-method | `/dashboard/authorization` | isolated-fixture | not-run-reconstructed |
| `AUTH-025` | Authorization | console-clean | Authorization: console-clean | `/dashboard/authorization` | read-only | not-run-reconstructed |
| `ENDPOINT-01` | Endpoint & Access | route | Endpoint & Access: route | `/dashboard/endpoint` | read-only | not-run-reconstructed |
| `ENDPOINT-02` | Endpoint & Access | initial-load | Endpoint & Access: initial-load | `/dashboard/endpoint` | read-only | not-run-reconstructed |
| `ENDPOINT-03` | Endpoint & Access | refresh | Endpoint & Access: refresh | `/dashboard/endpoint` | read-only | not-run-reconstructed |
| `ENDPOINT-04` | Endpoint & Access | empty | Endpoint & Access: empty | `/dashboard/endpoint` | isolated-fixture | not-run-reconstructed |
| `ENDPOINT-05` | Endpoint & Access | api-error | Endpoint & Access: api-error | `/dashboard/endpoint` | isolated-fixture | not-run-reconstructed |
| `ENDPOINT-06` | Endpoint & Access | filter | Endpoint & Access: filter | `/dashboard/endpoint` | read-only | not-run-reconstructed |
| `ENDPOINT-07` | Endpoint & Access | search | Endpoint & Access: search | `/dashboard/endpoint` | read-only | not-run-reconstructed |
| `ENDPOINT-08` | Endpoint & Access | pagination | Endpoint & Access: pagination | `/dashboard/endpoint` | read-only | not-run-reconstructed |
| `ENDPOINT-09` | Endpoint & Access | sort | Endpoint & Access: sort | `/dashboard/endpoint` | read-only | not-run-reconstructed |
| `ENDPOINT-10` | Endpoint & Access | detail | Endpoint & Access: detail | `/dashboard/endpoint` | read-only | not-run-reconstructed |
| `ENDPOINT-11` | Endpoint & Access | copy | Endpoint & Access: copy | `/dashboard/endpoint` | local-only | not-run-reconstructed |
| `ENDPOINT-12` | Endpoint & Access | keyboard | Endpoint & Access: keyboard | `/dashboard/endpoint` | read-only | not-run-reconstructed |
| `ENDPOINT-13` | Endpoint & Access | accessible-name | Endpoint & Access: accessible-name | `/dashboard/endpoint` | read-only | not-run-reconstructed |
| `ENDPOINT-14` | Endpoint & Access | contrast | Endpoint & Access: contrast | `/dashboard/endpoint` | read-only | not-run-reconstructed |
| `ENDPOINT-15` | Endpoint & Access | responsive | Endpoint & Access: responsive | `/dashboard/endpoint` | read-only | not-run-reconstructed |
| `ENDPOINT-16` | Endpoint & Access | error-boundary | Endpoint & Access: error-boundary | `/dashboard/endpoint` | isolated-fixture | not-run-reconstructed |
| `ENDPOINT-17` | Endpoint & Access | loading-repeat | Endpoint & Access: loading-repeat | `/dashboard/endpoint` | read-only | not-run-reconstructed |
| `ENDPOINT-18` | Endpoint & Access | auth-guard | Endpoint & Access: auth-guard | `/dashboard/endpoint` | read-only | not-run-reconstructed |
| `ENDPOINT-19` | Endpoint & Access | session-expiry | Endpoint & Access: session-expiry | `/dashboard/endpoint` | isolated-auth | not-run-reconstructed |
| `ENDPOINT-20` | Endpoint & Access | write-guard | Endpoint & Access: write-guard | `/dashboard/endpoint` | destructive-isolated | not-run-reconstructed |
| `ENDPOINT-21` | Endpoint & Access | validation | Endpoint & Access: validation | `/dashboard/endpoint` | destructive-isolated | not-run-reconstructed |
| `ENDPOINT-22` | Endpoint & Access | persistence | Endpoint & Access: persistence | `/dashboard/endpoint` | destructive-isolated | not-run-reconstructed |
| `ENDPOINT-23` | Endpoint & Access | duplicate-submit | Endpoint & Access: duplicate-submit | `/dashboard/endpoint` | destructive-isolated | not-run-reconstructed |
| `ENDPOINT-24` | Endpoint & Access | network-method | Endpoint & Access: network-method | `/dashboard/endpoint` | isolated-fixture | not-run-reconstructed |
| `ENDPOINT-25` | Endpoint & Access | console-clean | Endpoint & Access: console-clean | `/dashboard/endpoint` | read-only | not-run-reconstructed |
| `MODELS-01` | Models | route | Models: route | `/dashboard/models` | read-only | not-run-reconstructed |
| `MODELS-02` | Models | initial-load | Models: initial-load | `/dashboard/models` | read-only | not-run-reconstructed |
| `MODELS-03` | Models | refresh | Models: refresh | `/dashboard/models` | read-only | not-run-reconstructed |
| `MODELS-04` | Models | empty | Models: empty | `/dashboard/models` | isolated-fixture | not-run-reconstructed |
| `MODELS-05` | Models | api-error | Models: api-error | `/dashboard/models` | isolated-fixture | not-run-reconstructed |
| `MODELS-06` | Models | filter | Models: filter | `/dashboard/models` | read-only | not-run-reconstructed |
| `MODELS-07` | Models | search | Models: search | `/dashboard/models` | read-only | not-run-reconstructed |
| `MODELS-08` | Models | pagination | Models: pagination | `/dashboard/models` | read-only | not-run-reconstructed |
| `MODELS-09` | Models | sort | Models: sort | `/dashboard/models` | read-only | not-run-reconstructed |
| `MODELS-10` | Models | detail | Models: detail | `/dashboard/models` | read-only | not-run-reconstructed |
| `MODELS-11` | Models | copy | Models: copy | `/dashboard/models` | local-only | not-run-reconstructed |
| `MODELS-12` | Models | keyboard | Models: keyboard | `/dashboard/models` | read-only | not-run-reconstructed |
| `MODELS-13` | Models | accessible-name | Models: accessible-name | `/dashboard/models` | read-only | not-run-reconstructed |
| `MODELS-14` | Models | contrast | Models: contrast | `/dashboard/models` | read-only | not-run-reconstructed |
| `MODELS-15` | Models | responsive | Models: responsive | `/dashboard/models` | read-only | not-run-reconstructed |
| `MODELS-16` | Models | error-boundary | Models: error-boundary | `/dashboard/models` | isolated-fixture | not-run-reconstructed |
| `MODELS-17` | Models | loading-repeat | Models: loading-repeat | `/dashboard/models` | read-only | not-run-reconstructed |
| `MODELS-18` | Models | auth-guard | Models: auth-guard | `/dashboard/models` | read-only | not-run-reconstructed |
| `MODELS-19` | Models | session-expiry | Models: session-expiry | `/dashboard/models` | isolated-auth | not-run-reconstructed |
| `MODELS-20` | Models | write-guard | Models: write-guard | `/dashboard/models` | destructive-isolated | not-run-reconstructed |
| `MODELS-21` | Models | validation | Models: validation | `/dashboard/models` | destructive-isolated | not-run-reconstructed |
| `MODELS-22` | Models | persistence | Models: persistence | `/dashboard/models` | destructive-isolated | not-run-reconstructed |
| `MODELS-23` | Models | duplicate-submit | Models: duplicate-submit | `/dashboard/models` | destructive-isolated | not-run-reconstructed |
| `MODELS-24` | Models | network-method | Models: network-method | `/dashboard/models` | isolated-fixture | not-run-reconstructed |
| `MODELS-25` | Models | console-clean | Models: console-clean | `/dashboard/models` | read-only | not-run-reconstructed |
| `COMBOS-01` | Combo Models | route | Combo Models: route | `/dashboard/combos` | read-only | not-run-reconstructed |
| `COMBOS-02` | Combo Models | initial-load | Combo Models: initial-load | `/dashboard/combos` | read-only | not-run-reconstructed |
| `COMBOS-03` | Combo Models | refresh | Combo Models: refresh | `/dashboard/combos` | read-only | not-run-reconstructed |
| `COMBOS-04` | Combo Models | empty | Combo Models: empty | `/dashboard/combos` | isolated-fixture | not-run-reconstructed |
| `COMBOS-05` | Combo Models | api-error | Combo Models: api-error | `/dashboard/combos` | isolated-fixture | not-run-reconstructed |
| `COMBOS-06` | Combo Models | filter | Combo Models: filter | `/dashboard/combos` | read-only | not-run-reconstructed |
| `COMBOS-07` | Combo Models | search | Combo Models: search | `/dashboard/combos` | read-only | not-run-reconstructed |
| `COMBOS-08` | Combo Models | pagination | Combo Models: pagination | `/dashboard/combos` | read-only | not-run-reconstructed |
| `COMBOS-09` | Combo Models | sort | Combo Models: sort | `/dashboard/combos` | read-only | not-run-reconstructed |
| `COMBOS-10` | Combo Models | detail | Combo Models: detail | `/dashboard/combos` | read-only | not-run-reconstructed |
| `COMBOS-11` | Combo Models | copy | Combo Models: copy | `/dashboard/combos` | local-only | not-run-reconstructed |
| `COMBOS-12` | Combo Models | keyboard | Combo Models: keyboard | `/dashboard/combos` | read-only | not-run-reconstructed |
| `COMBOS-13` | Combo Models | accessible-name | Combo Models: accessible-name | `/dashboard/combos` | read-only | not-run-reconstructed |
| `COMBOS-14` | Combo Models | contrast | Combo Models: contrast | `/dashboard/combos` | read-only | not-run-reconstructed |
| `COMBOS-15` | Combo Models | responsive | Combo Models: responsive | `/dashboard/combos` | read-only | not-run-reconstructed |
| `COMBOS-16` | Combo Models | error-boundary | Combo Models: error-boundary | `/dashboard/combos` | isolated-fixture | not-run-reconstructed |
| `COMBOS-17` | Combo Models | loading-repeat | Combo Models: loading-repeat | `/dashboard/combos` | read-only | not-run-reconstructed |
| `COMBOS-18` | Combo Models | auth-guard | Combo Models: auth-guard | `/dashboard/combos` | read-only | not-run-reconstructed |
| `COMBOS-19` | Combo Models | session-expiry | Combo Models: session-expiry | `/dashboard/combos` | isolated-auth | not-run-reconstructed |
| `COMBOS-20` | Combo Models | write-guard | Combo Models: write-guard | `/dashboard/combos` | destructive-isolated | not-run-reconstructed |
| `COMBOS-21` | Combo Models | validation | Combo Models: validation | `/dashboard/combos` | destructive-isolated | not-run-reconstructed |
| `COMBOS-22` | Combo Models | persistence | Combo Models: persistence | `/dashboard/combos` | destructive-isolated | not-run-reconstructed |
| `COMBOS-23` | Combo Models | duplicate-submit | Combo Models: duplicate-submit | `/dashboard/combos` | destructive-isolated | not-run-reconstructed |
| `COMBOS-24` | Combo Models | network-method | Combo Models: network-method | `/dashboard/combos` | isolated-fixture | not-run-reconstructed |
| `COMBOS-25` | Combo Models | console-clean | Combo Models: console-clean | `/dashboard/combos` | read-only | not-run-reconstructed |
| `DISTRIBUTION-01` | Distribution | route | Distribution: route | `/dashboard/distribution` | read-only | not-run-reconstructed |
| `DISTRIBUTION-02` | Distribution | initial-load | Distribution: initial-load | `/dashboard/distribution` | read-only | not-run-reconstructed |
| `DISTRIBUTION-03` | Distribution | refresh | Distribution: refresh | `/dashboard/distribution` | read-only | not-run-reconstructed |
| `DISTRIBUTION-04` | Distribution | empty | Distribution: empty | `/dashboard/distribution` | isolated-fixture | not-run-reconstructed |
| `DISTRIBUTION-05` | Distribution | api-error | Distribution: api-error | `/dashboard/distribution` | isolated-fixture | not-run-reconstructed |
| `DISTRIBUTION-06` | Distribution | filter | Distribution: filter | `/dashboard/distribution` | read-only | not-run-reconstructed |
| `DISTRIBUTION-07` | Distribution | search | Distribution: search | `/dashboard/distribution` | read-only | not-run-reconstructed |
| `DISTRIBUTION-08` | Distribution | pagination | Distribution: pagination | `/dashboard/distribution` | read-only | not-run-reconstructed |
| `DISTRIBUTION-09` | Distribution | sort | Distribution: sort | `/dashboard/distribution` | read-only | not-run-reconstructed |
| `DISTRIBUTION-10` | Distribution | detail | Distribution: detail | `/dashboard/distribution` | read-only | not-run-reconstructed |
| `DISTRIBUTION-11` | Distribution | copy | Distribution: copy | `/dashboard/distribution` | local-only | not-run-reconstructed |
| `DISTRIBUTION-12` | Distribution | keyboard | Distribution: keyboard | `/dashboard/distribution` | read-only | not-run-reconstructed |
| `DISTRIBUTION-13` | Distribution | accessible-name | Distribution: accessible-name | `/dashboard/distribution` | read-only | not-run-reconstructed |
| `DISTRIBUTION-14` | Distribution | contrast | Distribution: contrast | `/dashboard/distribution` | read-only | not-run-reconstructed |
| `DISTRIBUTION-15` | Distribution | responsive | Distribution: responsive | `/dashboard/distribution` | read-only | not-run-reconstructed |
| `DISTRIBUTION-16` | Distribution | error-boundary | Distribution: error-boundary | `/dashboard/distribution` | isolated-fixture | not-run-reconstructed |
| `DISTRIBUTION-17` | Distribution | loading-repeat | Distribution: loading-repeat | `/dashboard/distribution` | read-only | not-run-reconstructed |
| `DISTRIBUTION-18` | Distribution | auth-guard | Distribution: auth-guard | `/dashboard/distribution` | read-only | not-run-reconstructed |
| `DISTRIBUTION-19` | Distribution | session-expiry | Distribution: session-expiry | `/dashboard/distribution` | isolated-auth | not-run-reconstructed |
| `DISTRIBUTION-20` | Distribution | write-guard | Distribution: write-guard | `/dashboard/distribution` | destructive-isolated | not-run-reconstructed |
| `DISTRIBUTION-21` | Distribution | validation | Distribution: validation | `/dashboard/distribution` | destructive-isolated | not-run-reconstructed |
| `DISTRIBUTION-22` | Distribution | persistence | Distribution: persistence | `/dashboard/distribution` | destructive-isolated | not-run-reconstructed |
| `DISTRIBUTION-23` | Distribution | duplicate-submit | Distribution: duplicate-submit | `/dashboard/distribution` | destructive-isolated | not-run-reconstructed |
| `DISTRIBUTION-24` | Distribution | network-method | Distribution: network-method | `/dashboard/distribution` | isolated-fixture | not-run-reconstructed |
| `DISTRIBUTION-25` | Distribution | console-clean | Distribution: console-clean | `/dashboard/distribution` | read-only | not-run-reconstructed |
| `PROXY-01` | Proxy Control | route | Proxy Control: route | `/dashboard/proxy` | read-only | not-run-reconstructed |
| `PROXY-02` | Proxy Control | initial-load | Proxy Control: initial-load | `/dashboard/proxy` | read-only | not-run-reconstructed |
| `PROXY-03` | Proxy Control | refresh | Proxy Control: refresh | `/dashboard/proxy` | read-only | not-run-reconstructed |
| `PROXY-04` | Proxy Control | empty | Proxy Control: empty | `/dashboard/proxy` | isolated-fixture | not-run-reconstructed |
| `PROXY-05` | Proxy Control | api-error | Proxy Control: api-error | `/dashboard/proxy` | isolated-fixture | not-run-reconstructed |
| `PROXY-06` | Proxy Control | filter | Proxy Control: filter | `/dashboard/proxy` | read-only | not-run-reconstructed |
| `PROXY-07` | Proxy Control | search | Proxy Control: search | `/dashboard/proxy` | read-only | not-run-reconstructed |
| `PROXY-08` | Proxy Control | pagination | Proxy Control: pagination | `/dashboard/proxy` | read-only | not-run-reconstructed |
| `PROXY-09` | Proxy Control | sort | Proxy Control: sort | `/dashboard/proxy` | read-only | not-run-reconstructed |
| `PROXY-10` | Proxy Control | detail | Proxy Control: detail | `/dashboard/proxy` | read-only | not-run-reconstructed |
| `PROXY-11` | Proxy Control | copy | Proxy Control: copy | `/dashboard/proxy` | local-only | not-run-reconstructed |
| `PROXY-12` | Proxy Control | keyboard | Proxy Control: keyboard | `/dashboard/proxy` | read-only | not-run-reconstructed |
| `PROXY-13` | Proxy Control | accessible-name | Proxy Control: accessible-name | `/dashboard/proxy` | read-only | not-run-reconstructed |
| `PROXY-14` | Proxy Control | contrast | Proxy Control: contrast | `/dashboard/proxy` | read-only | not-run-reconstructed |
| `PROXY-15` | Proxy Control | responsive | Proxy Control: responsive | `/dashboard/proxy` | read-only | not-run-reconstructed |
| `PROXY-16` | Proxy Control | error-boundary | Proxy Control: error-boundary | `/dashboard/proxy` | isolated-fixture | not-run-reconstructed |
| `PROXY-17` | Proxy Control | loading-repeat | Proxy Control: loading-repeat | `/dashboard/proxy` | read-only | not-run-reconstructed |
| `PROXY-18` | Proxy Control | auth-guard | Proxy Control: auth-guard | `/dashboard/proxy` | read-only | not-run-reconstructed |
| `PROXY-19` | Proxy Control | session-expiry | Proxy Control: session-expiry | `/dashboard/proxy` | isolated-auth | not-run-reconstructed |
| `PROXY-20` | Proxy Control | write-guard | Proxy Control: write-guard | `/dashboard/proxy` | destructive-isolated | not-run-reconstructed |
| `PROXY-21` | Proxy Control | validation | Proxy Control: validation | `/dashboard/proxy` | destructive-isolated | not-run-reconstructed |
| `PROXY-22` | Proxy Control | persistence | Proxy Control: persistence | `/dashboard/proxy` | destructive-isolated | not-run-reconstructed |
| `PROXY-23` | Proxy Control | duplicate-submit | Proxy Control: duplicate-submit | `/dashboard/proxy` | destructive-isolated | not-run-reconstructed |
| `PROXY-24` | Proxy Control | network-method | Proxy Control: network-method | `/dashboard/proxy` | isolated-fixture | not-run-reconstructed |
| `PROXY-25` | Proxy Control | console-clean | Proxy Control: console-clean | `/dashboard/proxy` | read-only | not-run-reconstructed |
| `BALANCES-01` | Balances & Quotas | route | Balances & Quotas: route | `/dashboard/balances` | read-only | not-run-reconstructed |
| `BALANCES-02` | Balances & Quotas | initial-load | Balances & Quotas: initial-load | `/dashboard/balances` | read-only | not-run-reconstructed |
| `BALANCES-03` | Balances & Quotas | refresh | Balances & Quotas: refresh | `/dashboard/balances` | read-only | not-run-reconstructed |
| `BALANCES-04` | Balances & Quotas | empty | Balances & Quotas: empty | `/dashboard/balances` | isolated-fixture | not-run-reconstructed |
| `BALANCES-05` | Balances & Quotas | api-error | Balances & Quotas: api-error | `/dashboard/balances` | isolated-fixture | not-run-reconstructed |
| `BALANCES-06` | Balances & Quotas | filter | Balances & Quotas: filter | `/dashboard/balances` | read-only | not-run-reconstructed |
| `BALANCES-07` | Balances & Quotas | search | Balances & Quotas: search | `/dashboard/balances` | read-only | not-run-reconstructed |
| `BALANCES-08` | Balances & Quotas | pagination | Balances & Quotas: pagination | `/dashboard/balances` | read-only | not-run-reconstructed |
| `BALANCES-09` | Balances & Quotas | sort | Balances & Quotas: sort | `/dashboard/balances` | read-only | not-run-reconstructed |
| `BALANCES-10` | Balances & Quotas | detail | Balances & Quotas: detail | `/dashboard/balances` | read-only | not-run-reconstructed |
| `BALANCES-11` | Balances & Quotas | copy | Balances & Quotas: copy | `/dashboard/balances` | local-only | not-run-reconstructed |
| `BALANCES-12` | Balances & Quotas | keyboard | Balances & Quotas: keyboard | `/dashboard/balances` | read-only | not-run-reconstructed |
| `BALANCES-13` | Balances & Quotas | accessible-name | Balances & Quotas: accessible-name | `/dashboard/balances` | read-only | not-run-reconstructed |
| `BALANCES-14` | Balances & Quotas | contrast | Balances & Quotas: contrast | `/dashboard/balances` | read-only | not-run-reconstructed |
| `BALANCES-15` | Balances & Quotas | responsive | Balances & Quotas: responsive | `/dashboard/balances` | read-only | not-run-reconstructed |
| `BALANCES-16` | Balances & Quotas | error-boundary | Balances & Quotas: error-boundary | `/dashboard/balances` | isolated-fixture | not-run-reconstructed |
| `BALANCES-17` | Balances & Quotas | loading-repeat | Balances & Quotas: loading-repeat | `/dashboard/balances` | read-only | not-run-reconstructed |
| `BALANCES-18` | Balances & Quotas | auth-guard | Balances & Quotas: auth-guard | `/dashboard/balances` | read-only | not-run-reconstructed |
| `BALANCES-19` | Balances & Quotas | session-expiry | Balances & Quotas: session-expiry | `/dashboard/balances` | isolated-auth | not-run-reconstructed |
| `BALANCES-20` | Balances & Quotas | write-guard | Balances & Quotas: write-guard | `/dashboard/balances` | destructive-isolated | not-run-reconstructed |
| `BALANCES-21` | Balances & Quotas | validation | Balances & Quotas: validation | `/dashboard/balances` | destructive-isolated | not-run-reconstructed |
| `BALANCES-22` | Balances & Quotas | persistence | Balances & Quotas: persistence | `/dashboard/balances` | destructive-isolated | not-run-reconstructed |
| `BALANCES-23` | Balances & Quotas | duplicate-submit | Balances & Quotas: duplicate-submit | `/dashboard/balances` | destructive-isolated | not-run-reconstructed |
| `BALANCES-24` | Balances & Quotas | network-method | Balances & Quotas: network-method | `/dashboard/balances` | isolated-fixture | not-run-reconstructed |
| `BALANCES-25` | Balances & Quotas | console-clean | Balances & Quotas: console-clean | `/dashboard/balances` | read-only | not-run-reconstructed |
| `CHECKINS-01` | Check-ins | route | Check-ins: route | `/dashboard/checkins` | read-only | not-run-reconstructed |
| `CHECKINS-02` | Check-ins | initial-load | Check-ins: initial-load | `/dashboard/checkins` | read-only | not-run-reconstructed |
| `CHECKINS-03` | Check-ins | refresh | Check-ins: refresh | `/dashboard/checkins` | read-only | not-run-reconstructed |
| `CHECKINS-04` | Check-ins | empty | Check-ins: empty | `/dashboard/checkins` | isolated-fixture | not-run-reconstructed |
| `CHECKINS-05` | Check-ins | api-error | Check-ins: api-error | `/dashboard/checkins` | isolated-fixture | not-run-reconstructed |
| `CHECKINS-06` | Check-ins | filter | Check-ins: filter | `/dashboard/checkins` | read-only | not-run-reconstructed |
| `CHECKINS-07` | Check-ins | search | Check-ins: search | `/dashboard/checkins` | read-only | not-run-reconstructed |
| `CHECKINS-08` | Check-ins | pagination | Check-ins: pagination | `/dashboard/checkins` | read-only | not-run-reconstructed |
| `CHECKINS-09` | Check-ins | sort | Check-ins: sort | `/dashboard/checkins` | read-only | not-run-reconstructed |
| `CHECKINS-10` | Check-ins | detail | Check-ins: detail | `/dashboard/checkins` | read-only | not-run-reconstructed |
| `CHECKINS-11` | Check-ins | copy | Check-ins: copy | `/dashboard/checkins` | local-only | not-run-reconstructed |
| `CHECKINS-12` | Check-ins | keyboard | Check-ins: keyboard | `/dashboard/checkins` | read-only | not-run-reconstructed |
| `CHECKINS-13` | Check-ins | accessible-name | Check-ins: accessible-name | `/dashboard/checkins` | read-only | not-run-reconstructed |
| `CHECKINS-14` | Check-ins | contrast | Check-ins: contrast | `/dashboard/checkins` | read-only | not-run-reconstructed |
| `CHECKINS-15` | Check-ins | responsive | Check-ins: responsive | `/dashboard/checkins` | read-only | not-run-reconstructed |
| `CHECKINS-16` | Check-ins | error-boundary | Check-ins: error-boundary | `/dashboard/checkins` | isolated-fixture | not-run-reconstructed |
| `CHECKINS-17` | Check-ins | loading-repeat | Check-ins: loading-repeat | `/dashboard/checkins` | read-only | not-run-reconstructed |
| `CHECKINS-18` | Check-ins | auth-guard | Check-ins: auth-guard | `/dashboard/checkins` | read-only | not-run-reconstructed |
| `CHECKINS-19` | Check-ins | session-expiry | Check-ins: session-expiry | `/dashboard/checkins` | isolated-auth | not-run-reconstructed |
| `CHECKINS-20` | Check-ins | write-guard | Check-ins: write-guard | `/dashboard/checkins` | destructive-isolated | not-run-reconstructed |
| `CHECKINS-21` | Check-ins | validation | Check-ins: validation | `/dashboard/checkins` | destructive-isolated | not-run-reconstructed |
| `CHECKINS-22` | Check-ins | persistence | Check-ins: persistence | `/dashboard/checkins` | destructive-isolated | not-run-reconstructed |
| `CHECKINS-23` | Check-ins | duplicate-submit | Check-ins: duplicate-submit | `/dashboard/checkins` | destructive-isolated | not-run-reconstructed |
| `CHECKINS-24` | Check-ins | network-method | Check-ins: network-method | `/dashboard/checkins` | isolated-fixture | not-run-reconstructed |
| `CHECKINS-25` | Check-ins | console-clean | Check-ins: console-clean | `/dashboard/checkins` | read-only | not-run-reconstructed |
| `USAGE-01` | Usage | route | Usage: route | `/dashboard/usage` | read-only | not-run-reconstructed |
| `USAGE-02` | Usage | initial-load | Usage: initial-load | `/dashboard/usage` | read-only | not-run-reconstructed |
| `USAGE-03` | Usage | refresh | Usage: refresh | `/dashboard/usage` | read-only | not-run-reconstructed |
| `USAGE-04` | Usage | empty | Usage: empty | `/dashboard/usage` | isolated-fixture | not-run-reconstructed |
| `USAGE-05` | Usage | api-error | Usage: api-error | `/dashboard/usage` | isolated-fixture | not-run-reconstructed |
| `USAGE-06` | Usage | filter | Usage: filter | `/dashboard/usage` | read-only | not-run-reconstructed |
| `USAGE-07` | Usage | search | Usage: search | `/dashboard/usage` | read-only | not-run-reconstructed |
| `USAGE-08` | Usage | pagination | Usage: pagination | `/dashboard/usage` | read-only | not-run-reconstructed |
| `USAGE-09` | Usage | sort | Usage: sort | `/dashboard/usage` | read-only | not-run-reconstructed |
| `USAGE-10` | Usage | detail | Usage: detail | `/dashboard/usage` | read-only | not-run-reconstructed |
| `USAGE-11` | Usage | copy | Usage: copy | `/dashboard/usage` | local-only | not-run-reconstructed |
| `USAGE-12` | Usage | keyboard | Usage: keyboard | `/dashboard/usage` | read-only | not-run-reconstructed |
| `USAGE-13` | Usage | accessible-name | Usage: accessible-name | `/dashboard/usage` | read-only | not-run-reconstructed |
| `USAGE-14` | Usage | contrast | Usage: contrast | `/dashboard/usage` | read-only | not-run-reconstructed |
| `USAGE-15` | Usage | responsive | Usage: responsive | `/dashboard/usage` | read-only | not-run-reconstructed |
| `USAGE-16` | Usage | error-boundary | Usage: error-boundary | `/dashboard/usage` | isolated-fixture | not-run-reconstructed |
| `USAGE-17` | Usage | loading-repeat | Usage: loading-repeat | `/dashboard/usage` | read-only | not-run-reconstructed |
| `USAGE-18` | Usage | auth-guard | Usage: auth-guard | `/dashboard/usage` | read-only | not-run-reconstructed |
| `USAGE-19` | Usage | session-expiry | Usage: session-expiry | `/dashboard/usage` | isolated-auth | not-run-reconstructed |
| `USAGE-20` | Usage | write-guard | Usage: write-guard | `/dashboard/usage` | destructive-isolated | not-run-reconstructed |
| `USAGE-21` | Usage | validation | Usage: validation | `/dashboard/usage` | destructive-isolated | not-run-reconstructed |
| `USAGE-22` | Usage | persistence | Usage: persistence | `/dashboard/usage` | destructive-isolated | not-run-reconstructed |
| `USAGE-23` | Usage | duplicate-submit | Usage: duplicate-submit | `/dashboard/usage` | destructive-isolated | not-run-reconstructed |
| `USAGE-24` | Usage | network-method | Usage: network-method | `/dashboard/usage` | isolated-fixture | not-run-reconstructed |
| `USAGE-25` | Usage | console-clean | Usage: console-clean | `/dashboard/usage` | read-only | not-run-reconstructed |
| `LOGS-01` | Request Logs | route | Request Logs: route | `/dashboard/logs` | read-only | not-run-reconstructed |
| `LOGS-02` | Request Logs | initial-load | Request Logs: initial-load | `/dashboard/logs` | read-only | not-run-reconstructed |
| `LOGS-03` | Request Logs | refresh | Request Logs: refresh | `/dashboard/logs` | read-only | not-run-reconstructed |
| `LOGS-04` | Request Logs | empty | Request Logs: empty | `/dashboard/logs` | isolated-fixture | not-run-reconstructed |
| `LOGS-05` | Request Logs | api-error | Request Logs: api-error | `/dashboard/logs` | isolated-fixture | not-run-reconstructed |
| `LOGS-06` | Request Logs | filter | Request Logs: filter | `/dashboard/logs` | read-only | not-run-reconstructed |
| `LOGS-07` | Request Logs | search | Request Logs: search | `/dashboard/logs` | read-only | not-run-reconstructed |
| `LOGS-08` | Request Logs | pagination | Request Logs: pagination | `/dashboard/logs` | read-only | not-run-reconstructed |
| `LOGS-09` | Request Logs | sort | Request Logs: sort | `/dashboard/logs` | read-only | not-run-reconstructed |
| `LOGS-10` | Request Logs | detail | Request Logs: detail | `/dashboard/logs` | read-only | not-run-reconstructed |
| `LOGS-11` | Request Logs | copy | Request Logs: copy | `/dashboard/logs` | local-only | not-run-reconstructed |
| `LOGS-12` | Request Logs | keyboard | Request Logs: keyboard | `/dashboard/logs` | read-only | not-run-reconstructed |
| `LOGS-13` | Request Logs | accessible-name | Request Logs: accessible-name | `/dashboard/logs` | read-only | not-run-reconstructed |
| `LOGS-14` | Request Logs | contrast | Request Logs: contrast | `/dashboard/logs` | read-only | not-run-reconstructed |
| `LOGS-15` | Request Logs | responsive | Request Logs: responsive | `/dashboard/logs` | read-only | not-run-reconstructed |
| `LOGS-16` | Request Logs | error-boundary | Request Logs: error-boundary | `/dashboard/logs` | isolated-fixture | not-run-reconstructed |
| `LOGS-17` | Request Logs | loading-repeat | Request Logs: loading-repeat | `/dashboard/logs` | read-only | not-run-reconstructed |
| `LOGS-18` | Request Logs | auth-guard | Request Logs: auth-guard | `/dashboard/logs` | read-only | not-run-reconstructed |
| `LOGS-19` | Request Logs | session-expiry | Request Logs: session-expiry | `/dashboard/logs` | isolated-auth | not-run-reconstructed |
| `LOGS-20` | Request Logs | write-guard | Request Logs: write-guard | `/dashboard/logs` | destructive-isolated | not-run-reconstructed |
| `LOGS-21` | Request Logs | validation | Request Logs: validation | `/dashboard/logs` | destructive-isolated | not-run-reconstructed |
| `LOGS-22` | Request Logs | persistence | Request Logs: persistence | `/dashboard/logs` | destructive-isolated | not-run-reconstructed |
| `LOGS-23` | Request Logs | duplicate-submit | Request Logs: duplicate-submit | `/dashboard/logs` | destructive-isolated | not-run-reconstructed |
| `LOGS-24` | Request Logs | network-method | Request Logs: network-method | `/dashboard/logs` | isolated-fixture | not-run-reconstructed |
| `LOGS-25` | Request Logs | console-clean | Request Logs: console-clean | `/dashboard/logs` | read-only | not-run-reconstructed |
| `MONITOR-01` | Model Monitor | route | Model Monitor: route | `/dashboard/monitor` | read-only | not-run-reconstructed |
| `MONITOR-02` | Model Monitor | initial-load | Model Monitor: initial-load | `/dashboard/monitor` | read-only | not-run-reconstructed |
| `MONITOR-03` | Model Monitor | refresh | Model Monitor: refresh | `/dashboard/monitor` | read-only | not-run-reconstructed |
| `MONITOR-04` | Model Monitor | empty | Model Monitor: empty | `/dashboard/monitor` | isolated-fixture | not-run-reconstructed |
| `MONITOR-05` | Model Monitor | api-error | Model Monitor: api-error | `/dashboard/monitor` | isolated-fixture | not-run-reconstructed |
| `MONITOR-06` | Model Monitor | filter | Model Monitor: filter | `/dashboard/monitor` | read-only | not-run-reconstructed |
| `MONITOR-07` | Model Monitor | search | Model Monitor: search | `/dashboard/monitor` | read-only | not-run-reconstructed |
| `MONITOR-08` | Model Monitor | pagination | Model Monitor: pagination | `/dashboard/monitor` | read-only | not-run-reconstructed |
| `MONITOR-09` | Model Monitor | sort | Model Monitor: sort | `/dashboard/monitor` | read-only | not-run-reconstructed |
| `MONITOR-10` | Model Monitor | detail | Model Monitor: detail | `/dashboard/monitor` | read-only | not-run-reconstructed |
| `MONITOR-11` | Model Monitor | copy | Model Monitor: copy | `/dashboard/monitor` | local-only | not-run-reconstructed |
| `MONITOR-12` | Model Monitor | keyboard | Model Monitor: keyboard | `/dashboard/monitor` | read-only | not-run-reconstructed |
| `MONITOR-13` | Model Monitor | accessible-name | Model Monitor: accessible-name | `/dashboard/monitor` | read-only | not-run-reconstructed |
| `MONITOR-14` | Model Monitor | contrast | Model Monitor: contrast | `/dashboard/monitor` | read-only | not-run-reconstructed |
| `MONITOR-15` | Model Monitor | responsive | Model Monitor: responsive | `/dashboard/monitor` | read-only | not-run-reconstructed |
| `MONITOR-16` | Model Monitor | error-boundary | Model Monitor: error-boundary | `/dashboard/monitor` | isolated-fixture | not-run-reconstructed |
| `MONITOR-17` | Model Monitor | loading-repeat | Model Monitor: loading-repeat | `/dashboard/monitor` | read-only | not-run-reconstructed |
| `MONITOR-18` | Model Monitor | auth-guard | Model Monitor: auth-guard | `/dashboard/monitor` | read-only | not-run-reconstructed |
| `MONITOR-19` | Model Monitor | session-expiry | Model Monitor: session-expiry | `/dashboard/monitor` | isolated-auth | not-run-reconstructed |
| `MONITOR-20` | Model Monitor | write-guard | Model Monitor: write-guard | `/dashboard/monitor` | destructive-isolated | not-run-reconstructed |
| `MONITOR-21` | Model Monitor | validation | Model Monitor: validation | `/dashboard/monitor` | destructive-isolated | not-run-reconstructed |
| `MONITOR-22` | Model Monitor | persistence | Model Monitor: persistence | `/dashboard/monitor` | destructive-isolated | not-run-reconstructed |
| `MONITOR-23` | Model Monitor | duplicate-submit | Model Monitor: duplicate-submit | `/dashboard/monitor` | destructive-isolated | not-run-reconstructed |
| `MONITOR-24` | Model Monitor | network-method | Model Monitor: network-method | `/dashboard/monitor` | isolated-fixture | not-run-reconstructed |
| `MONITOR-25` | Model Monitor | console-clean | Model Monitor: console-clean | `/dashboard/monitor` | read-only | not-run-reconstructed |
| `CHAIN-HEALTH-01` | Chain Health | route | Chain Health: route | `/dashboard/chain-health` | read-only | not-run-reconstructed |
| `CHAIN-HEALTH-02` | Chain Health | initial-load | Chain Health: initial-load | `/dashboard/chain-health` | read-only | not-run-reconstructed |
| `CHAIN-HEALTH-03` | Chain Health | refresh | Chain Health: refresh | `/dashboard/chain-health` | read-only | not-run-reconstructed |
| `CHAIN-HEALTH-04` | Chain Health | empty | Chain Health: empty | `/dashboard/chain-health` | isolated-fixture | not-run-reconstructed |
| `CHAIN-HEALTH-05` | Chain Health | api-error | Chain Health: api-error | `/dashboard/chain-health` | isolated-fixture | not-run-reconstructed |
| `CHAIN-HEALTH-06` | Chain Health | filter | Chain Health: filter | `/dashboard/chain-health` | read-only | not-run-reconstructed |
| `CHAIN-HEALTH-07` | Chain Health | search | Chain Health: search | `/dashboard/chain-health` | read-only | not-run-reconstructed |
| `CHAIN-HEALTH-08` | Chain Health | pagination | Chain Health: pagination | `/dashboard/chain-health` | read-only | not-run-reconstructed |
| `CHAIN-HEALTH-09` | Chain Health | sort | Chain Health: sort | `/dashboard/chain-health` | read-only | not-run-reconstructed |
| `CHAIN-HEALTH-10` | Chain Health | detail | Chain Health: detail | `/dashboard/chain-health` | read-only | not-run-reconstructed |
| `CHAIN-HEALTH-11` | Chain Health | copy | Chain Health: copy | `/dashboard/chain-health` | local-only | not-run-reconstructed |
| `CHAIN-HEALTH-12` | Chain Health | keyboard | Chain Health: keyboard | `/dashboard/chain-health` | read-only | not-run-reconstructed |
| `CHAIN-HEALTH-13` | Chain Health | accessible-name | Chain Health: accessible-name | `/dashboard/chain-health` | read-only | not-run-reconstructed |
| `CHAIN-HEALTH-14` | Chain Health | contrast | Chain Health: contrast | `/dashboard/chain-health` | read-only | not-run-reconstructed |
| `CHAIN-HEALTH-15` | Chain Health | responsive | Chain Health: responsive | `/dashboard/chain-health` | read-only | not-run-reconstructed |
| `CHAIN-HEALTH-16` | Chain Health | error-boundary | Chain Health: error-boundary | `/dashboard/chain-health` | isolated-fixture | not-run-reconstructed |
| `CHAIN-HEALTH-17` | Chain Health | loading-repeat | Chain Health: loading-repeat | `/dashboard/chain-health` | read-only | not-run-reconstructed |
| `CHAIN-HEALTH-18` | Chain Health | auth-guard | Chain Health: auth-guard | `/dashboard/chain-health` | read-only | not-run-reconstructed |
| `CHAIN-HEALTH-19` | Chain Health | session-expiry | Chain Health: session-expiry | `/dashboard/chain-health` | isolated-auth | not-run-reconstructed |
| `CHAIN-HEALTH-20` | Chain Health | write-guard | Chain Health: write-guard | `/dashboard/chain-health` | destructive-isolated | not-run-reconstructed |
| `CHAIN-HEALTH-21` | Chain Health | validation | Chain Health: validation | `/dashboard/chain-health` | destructive-isolated | not-run-reconstructed |
| `CHAIN-HEALTH-22` | Chain Health | persistence | Chain Health: persistence | `/dashboard/chain-health` | destructive-isolated | not-run-reconstructed |
| `CHAIN-HEALTH-23` | Chain Health | duplicate-submit | Chain Health: duplicate-submit | `/dashboard/chain-health` | destructive-isolated | not-run-reconstructed |
| `CHAIN-HEALTH-24` | Chain Health | network-method | Chain Health: network-method | `/dashboard/chain-health` | isolated-fixture | not-run-reconstructed |
| `CHAIN-HEALTH-25` | Chain Health | console-clean | Chain Health: console-clean | `/dashboard/chain-health` | read-only | not-run-reconstructed |
| `SYSTEM-01` | System Info | route | System Info: route | `/dashboard/system` | read-only | not-run-reconstructed |
| `SYSTEM-02` | System Info | initial-load | System Info: initial-load | `/dashboard/system` | read-only | not-run-reconstructed |
| `SYSTEM-03` | System Info | refresh | System Info: refresh | `/dashboard/system` | read-only | not-run-reconstructed |
| `SYSTEM-04` | System Info | empty | System Info: empty | `/dashboard/system` | isolated-fixture | not-run-reconstructed |
| `SYSTEM-05` | System Info | api-error | System Info: api-error | `/dashboard/system` | isolated-fixture | not-run-reconstructed |
| `SYSTEM-06` | System Info | filter | System Info: filter | `/dashboard/system` | read-only | not-run-reconstructed |
| `SYSTEM-07` | System Info | search | System Info: search | `/dashboard/system` | read-only | not-run-reconstructed |
| `SYSTEM-08` | System Info | pagination | System Info: pagination | `/dashboard/system` | read-only | not-run-reconstructed |
| `SYSTEM-09` | System Info | sort | System Info: sort | `/dashboard/system` | read-only | not-run-reconstructed |
| `SYSTEM-10` | System Info | detail | System Info: detail | `/dashboard/system` | read-only | not-run-reconstructed |
| `SYSTEM-11` | System Info | copy | System Info: copy | `/dashboard/system` | local-only | not-run-reconstructed |
| `SYSTEM-12` | System Info | keyboard | System Info: keyboard | `/dashboard/system` | read-only | not-run-reconstructed |
| `SYSTEM-13` | System Info | accessible-name | System Info: accessible-name | `/dashboard/system` | read-only | not-run-reconstructed |
| `SYSTEM-14` | System Info | contrast | System Info: contrast | `/dashboard/system` | read-only | not-run-reconstructed |
| `SYSTEM-15` | System Info | responsive | System Info: responsive | `/dashboard/system` | read-only | not-run-reconstructed |
| `SYSTEM-16` | System Info | error-boundary | System Info: error-boundary | `/dashboard/system` | isolated-fixture | not-run-reconstructed |
| `SYSTEM-17` | System Info | loading-repeat | System Info: loading-repeat | `/dashboard/system` | read-only | not-run-reconstructed |
| `SYSTEM-18` | System Info | auth-guard | System Info: auth-guard | `/dashboard/system` | read-only | not-run-reconstructed |
| `SYSTEM-19` | System Info | session-expiry | System Info: session-expiry | `/dashboard/system` | isolated-auth | not-run-reconstructed |
| `SYSTEM-20` | System Info | write-guard | System Info: write-guard | `/dashboard/system` | destructive-isolated | not-run-reconstructed |
| `SYSTEM-21` | System Info | validation | System Info: validation | `/dashboard/system` | destructive-isolated | not-run-reconstructed |
| `SYSTEM-22` | System Info | persistence | System Info: persistence | `/dashboard/system` | destructive-isolated | not-run-reconstructed |
| `SYSTEM-23` | System Info | duplicate-submit | System Info: duplicate-submit | `/dashboard/system` | destructive-isolated | not-run-reconstructed |
| `SYSTEM-24` | System Info | network-method | System Info: network-method | `/dashboard/system` | isolated-fixture | not-run-reconstructed |
| `SYSTEM-25` | System Info | console-clean | System Info: console-clean | `/dashboard/system` | read-only | not-run-reconstructed |
| `PRICING-01` | Pricing | route | Pricing: route | `/dashboard/pricing` | read-only | not-run-reconstructed |
| `PRICING-02` | Pricing | initial-load | Pricing: initial-load | `/dashboard/pricing` | read-only | not-run-reconstructed |
| `PRICING-03` | Pricing | refresh | Pricing: refresh | `/dashboard/pricing` | read-only | not-run-reconstructed |
| `PRICING-04` | Pricing | empty | Pricing: empty | `/dashboard/pricing` | isolated-fixture | not-run-reconstructed |
| `PRICING-05` | Pricing | api-error | Pricing: api-error | `/dashboard/pricing` | isolated-fixture | not-run-reconstructed |
| `PRICING-06` | Pricing | filter | Pricing: filter | `/dashboard/pricing` | read-only | not-run-reconstructed |
| `PRICING-07` | Pricing | search | Pricing: search | `/dashboard/pricing` | read-only | not-run-reconstructed |
| `PRICING-08` | Pricing | pagination | Pricing: pagination | `/dashboard/pricing` | read-only | not-run-reconstructed |
| `PRICING-09` | Pricing | sort | Pricing: sort | `/dashboard/pricing` | read-only | not-run-reconstructed |
| `PRICING-10` | Pricing | detail | Pricing: detail | `/dashboard/pricing` | read-only | not-run-reconstructed |
| `PRICING-11` | Pricing | copy | Pricing: copy | `/dashboard/pricing` | local-only | not-run-reconstructed |
| `PRICING-12` | Pricing | keyboard | Pricing: keyboard | `/dashboard/pricing` | read-only | not-run-reconstructed |
| `PRICING-13` | Pricing | accessible-name | Pricing: accessible-name | `/dashboard/pricing` | read-only | not-run-reconstructed |
| `PRICING-14` | Pricing | contrast | Pricing: contrast | `/dashboard/pricing` | read-only | not-run-reconstructed |
| `PRICING-15` | Pricing | responsive | Pricing: responsive | `/dashboard/pricing` | read-only | not-run-reconstructed |
| `PRICING-16` | Pricing | error-boundary | Pricing: error-boundary | `/dashboard/pricing` | isolated-fixture | not-run-reconstructed |
| `PRICING-17` | Pricing | loading-repeat | Pricing: loading-repeat | `/dashboard/pricing` | read-only | not-run-reconstructed |
| `PRICING-18` | Pricing | auth-guard | Pricing: auth-guard | `/dashboard/pricing` | read-only | not-run-reconstructed |
| `PRICING-19` | Pricing | session-expiry | Pricing: session-expiry | `/dashboard/pricing` | isolated-auth | not-run-reconstructed |
| `PRICING-20` | Pricing | write-guard | Pricing: write-guard | `/dashboard/pricing` | destructive-isolated | not-run-reconstructed |
| `PRICING-21` | Pricing | validation | Pricing: validation | `/dashboard/pricing` | destructive-isolated | not-run-reconstructed |
| `PRICING-22` | Pricing | persistence | Pricing: persistence | `/dashboard/pricing` | destructive-isolated | not-run-reconstructed |
| `PRICING-23` | Pricing | duplicate-submit | Pricing: duplicate-submit | `/dashboard/pricing` | destructive-isolated | not-run-reconstructed |
| `PRICING-24` | Pricing | network-method | Pricing: network-method | `/dashboard/pricing` | isolated-fixture | not-run-reconstructed |
| `PRICING-25` | Pricing | console-clean | Pricing: console-clean | `/dashboard/pricing` | read-only | not-run-reconstructed |
| `PROXY-POOLS-01` | Proxy Pools | route | Proxy Pools: route | `/dashboard/proxy-pools` | read-only | not-run-reconstructed |
| `PROXY-POOLS-02` | Proxy Pools | initial-load | Proxy Pools: initial-load | `/dashboard/proxy-pools` | read-only | not-run-reconstructed |
| `PROXY-POOLS-03` | Proxy Pools | refresh | Proxy Pools: refresh | `/dashboard/proxy-pools` | read-only | not-run-reconstructed |
| `PROXY-POOLS-04` | Proxy Pools | empty | Proxy Pools: empty | `/dashboard/proxy-pools` | isolated-fixture | not-run-reconstructed |
| `PROXY-POOLS-05` | Proxy Pools | api-error | Proxy Pools: api-error | `/dashboard/proxy-pools` | isolated-fixture | not-run-reconstructed |
| `PROXY-POOLS-06` | Proxy Pools | filter | Proxy Pools: filter | `/dashboard/proxy-pools` | read-only | not-run-reconstructed |
| `PROXY-POOLS-07` | Proxy Pools | search | Proxy Pools: search | `/dashboard/proxy-pools` | read-only | not-run-reconstructed |
| `PROXY-POOLS-08` | Proxy Pools | pagination | Proxy Pools: pagination | `/dashboard/proxy-pools` | read-only | not-run-reconstructed |
| `PROXY-POOLS-09` | Proxy Pools | sort | Proxy Pools: sort | `/dashboard/proxy-pools` | read-only | not-run-reconstructed |
| `PROXY-POOLS-10` | Proxy Pools | detail | Proxy Pools: detail | `/dashboard/proxy-pools` | read-only | not-run-reconstructed |
| `PROXY-POOLS-11` | Proxy Pools | copy | Proxy Pools: copy | `/dashboard/proxy-pools` | local-only | not-run-reconstructed |
| `PROXY-POOLS-12` | Proxy Pools | keyboard | Proxy Pools: keyboard | `/dashboard/proxy-pools` | read-only | not-run-reconstructed |
| `PROXY-POOLS-13` | Proxy Pools | accessible-name | Proxy Pools: accessible-name | `/dashboard/proxy-pools` | read-only | not-run-reconstructed |
| `PROXY-POOLS-14` | Proxy Pools | contrast | Proxy Pools: contrast | `/dashboard/proxy-pools` | read-only | not-run-reconstructed |
| `PROXY-POOLS-15` | Proxy Pools | responsive | Proxy Pools: responsive | `/dashboard/proxy-pools` | read-only | not-run-reconstructed |
| `PROXY-POOLS-16` | Proxy Pools | error-boundary | Proxy Pools: error-boundary | `/dashboard/proxy-pools` | isolated-fixture | not-run-reconstructed |
| `PROXY-POOLS-17` | Proxy Pools | loading-repeat | Proxy Pools: loading-repeat | `/dashboard/proxy-pools` | read-only | not-run-reconstructed |
| `PROXY-POOLS-18` | Proxy Pools | auth-guard | Proxy Pools: auth-guard | `/dashboard/proxy-pools` | read-only | not-run-reconstructed |
| `PROXY-POOLS-19` | Proxy Pools | session-expiry | Proxy Pools: session-expiry | `/dashboard/proxy-pools` | isolated-auth | not-run-reconstructed |
| `PROXY-POOLS-20` | Proxy Pools | write-guard | Proxy Pools: write-guard | `/dashboard/proxy-pools` | destructive-isolated | not-run-reconstructed |
| `PROXY-POOLS-21` | Proxy Pools | validation | Proxy Pools: validation | `/dashboard/proxy-pools` | destructive-isolated | not-run-reconstructed |
| `PROXY-POOLS-22` | Proxy Pools | persistence | Proxy Pools: persistence | `/dashboard/proxy-pools` | destructive-isolated | not-run-reconstructed |
| `PROXY-POOLS-23` | Proxy Pools | duplicate-submit | Proxy Pools: duplicate-submit | `/dashboard/proxy-pools` | destructive-isolated | not-run-reconstructed |
| `PROXY-POOLS-24` | Proxy Pools | network-method | Proxy Pools: network-method | `/dashboard/proxy-pools` | isolated-fixture | not-run-reconstructed |
| `PROXY-POOLS-25` | Proxy Pools | console-clean | Proxy Pools: console-clean | `/dashboard/proxy-pools` | read-only | not-run-reconstructed |
| `SETTINGS-01` | Settings | route | Settings: route | `/dashboard/settings` | read-only | not-run-reconstructed |
| `SETTINGS-02` | Settings | initial-load | Settings: initial-load | `/dashboard/settings` | read-only | not-run-reconstructed |
| `SETTINGS-03` | Settings | refresh | Settings: refresh | `/dashboard/settings` | read-only | not-run-reconstructed |
| `SETTINGS-04` | Settings | empty | Settings: empty | `/dashboard/settings` | isolated-fixture | not-run-reconstructed |
| `SETTINGS-05` | Settings | api-error | Settings: api-error | `/dashboard/settings` | isolated-fixture | not-run-reconstructed |
| `SETTINGS-06` | Settings | filter | Settings: filter | `/dashboard/settings` | read-only | not-run-reconstructed |
| `SETTINGS-07` | Settings | search | Settings: search | `/dashboard/settings` | read-only | not-run-reconstructed |
| `SETTINGS-08` | Settings | pagination | Settings: pagination | `/dashboard/settings` | read-only | not-run-reconstructed |
| `SETTINGS-09` | Settings | sort | Settings: sort | `/dashboard/settings` | read-only | not-run-reconstructed |
| `SETTINGS-10` | Settings | detail | Settings: detail | `/dashboard/settings` | read-only | not-run-reconstructed |
| `SETTINGS-11` | Settings | copy | Settings: copy | `/dashboard/settings` | local-only | not-run-reconstructed |
| `SETTINGS-12` | Settings | keyboard | Settings: keyboard | `/dashboard/settings` | read-only | not-run-reconstructed |
| `SETTINGS-13` | Settings | accessible-name | Settings: accessible-name | `/dashboard/settings` | read-only | not-run-reconstructed |
| `SETTINGS-14` | Settings | contrast | Settings: contrast | `/dashboard/settings` | read-only | not-run-reconstructed |
| `SETTINGS-15` | Settings | responsive | Settings: responsive | `/dashboard/settings` | read-only | not-run-reconstructed |
| `SETTINGS-16` | Settings | error-boundary | Settings: error-boundary | `/dashboard/settings` | isolated-fixture | not-run-reconstructed |
| `SETTINGS-17` | Settings | loading-repeat | Settings: loading-repeat | `/dashboard/settings` | read-only | not-run-reconstructed |
| `SETTINGS-18` | Settings | auth-guard | Settings: auth-guard | `/dashboard/settings` | read-only | not-run-reconstructed |
| `SETTINGS-19` | Settings | session-expiry | Settings: session-expiry | `/dashboard/settings` | isolated-auth | not-run-reconstructed |
| `SETTINGS-20` | Settings | write-guard | Settings: write-guard | `/dashboard/settings` | destructive-isolated | not-run-reconstructed |
| `SETTINGS-21` | Settings | validation | Settings: validation | `/dashboard/settings` | destructive-isolated | not-run-reconstructed |
| `SETTINGS-22` | Settings | persistence | Settings: persistence | `/dashboard/settings` | destructive-isolated | not-run-reconstructed |
| `SETTINGS-23` | Settings | duplicate-submit | Settings: duplicate-submit | `/dashboard/settings` | destructive-isolated | not-run-reconstructed |
| `SETTINGS-24` | Settings | network-method | Settings: network-method | `/dashboard/settings` | isolated-fixture | not-run-reconstructed |
| `SETTINGS-25` | Settings | console-clean | Settings: console-clean | `/dashboard/settings` | read-only | not-run-reconstructed |
| `TRANSLATOR-01` | Protocol Debugger | route | Protocol Debugger: route | `/dashboard/translator` | read-only | not-run-reconstructed |
| `TRANSLATOR-02` | Protocol Debugger | initial-load | Protocol Debugger: initial-load | `/dashboard/translator` | read-only | not-run-reconstructed |
| `TRANSLATOR-03` | Protocol Debugger | refresh | Protocol Debugger: refresh | `/dashboard/translator` | read-only | not-run-reconstructed |
| `TRANSLATOR-04` | Protocol Debugger | empty | Protocol Debugger: empty | `/dashboard/translator` | isolated-fixture | not-run-reconstructed |
| `TRANSLATOR-05` | Protocol Debugger | api-error | Protocol Debugger: api-error | `/dashboard/translator` | isolated-fixture | not-run-reconstructed |
| `TRANSLATOR-06` | Protocol Debugger | filter | Protocol Debugger: filter | `/dashboard/translator` | read-only | not-run-reconstructed |
| `TRANSLATOR-07` | Protocol Debugger | search | Protocol Debugger: search | `/dashboard/translator` | read-only | not-run-reconstructed |
| `TRANSLATOR-08` | Protocol Debugger | pagination | Protocol Debugger: pagination | `/dashboard/translator` | read-only | not-run-reconstructed |
| `TRANSLATOR-09` | Protocol Debugger | sort | Protocol Debugger: sort | `/dashboard/translator` | read-only | not-run-reconstructed |
| `TRANSLATOR-10` | Protocol Debugger | detail | Protocol Debugger: detail | `/dashboard/translator` | read-only | not-run-reconstructed |
| `TRANSLATOR-11` | Protocol Debugger | copy | Protocol Debugger: copy | `/dashboard/translator` | local-only | not-run-reconstructed |
| `TRANSLATOR-12` | Protocol Debugger | keyboard | Protocol Debugger: keyboard | `/dashboard/translator` | read-only | not-run-reconstructed |
| `TRANSLATOR-13` | Protocol Debugger | accessible-name | Protocol Debugger: accessible-name | `/dashboard/translator` | read-only | not-run-reconstructed |
| `TRANSLATOR-14` | Protocol Debugger | contrast | Protocol Debugger: contrast | `/dashboard/translator` | read-only | not-run-reconstructed |
| `TRANSLATOR-15` | Protocol Debugger | responsive | Protocol Debugger: responsive | `/dashboard/translator` | read-only | not-run-reconstructed |
| `TRANSLATOR-16` | Protocol Debugger | error-boundary | Protocol Debugger: error-boundary | `/dashboard/translator` | isolated-fixture | not-run-reconstructed |
| `TRANSLATOR-17` | Protocol Debugger | loading-repeat | Protocol Debugger: loading-repeat | `/dashboard/translator` | read-only | not-run-reconstructed |
| `TRANSLATOR-18` | Protocol Debugger | auth-guard | Protocol Debugger: auth-guard | `/dashboard/translator` | read-only | not-run-reconstructed |
| `TRANSLATOR-19` | Protocol Debugger | session-expiry | Protocol Debugger: session-expiry | `/dashboard/translator` | isolated-auth | not-run-reconstructed |
| `TRANSLATOR-20` | Protocol Debugger | write-guard | Protocol Debugger: write-guard | `/dashboard/translator` | destructive-isolated | not-run-reconstructed |
| `TRANSLATOR-21` | Protocol Debugger | validation | Protocol Debugger: validation | `/dashboard/translator` | destructive-isolated | not-run-reconstructed |
| `TRANSLATOR-22` | Protocol Debugger | persistence | Protocol Debugger: persistence | `/dashboard/translator` | destructive-isolated | not-run-reconstructed |
| `TRANSLATOR-23` | Protocol Debugger | duplicate-submit | Protocol Debugger: duplicate-submit | `/dashboard/translator` | destructive-isolated | not-run-reconstructed |
| `TRANSLATOR-24` | Protocol Debugger | network-method | Protocol Debugger: network-method | `/dashboard/translator` | isolated-fixture | not-run-reconstructed |
| `TRANSLATOR-25` | Protocol Debugger | console-clean | Protocol Debugger: console-clean | `/dashboard/translator` | read-only | not-run-reconstructed |
| `NAV-001` | Navigation integration | navigation | Deep links and route refresh | `multiple` | isolated-auth | passed-historical-mem0 |
| `NAV-002` | Navigation integration | navigation | Cross-page browser history | `multiple` | isolated-fixture | passed-historical-mem0 |
| `NAV-003` | Navigation integration | navigation | Quick navigation search | `multiple` | destructive-isolated | passed-historical-mem0 |
| `NAV-004` | Navigation integration | navigation | Unknown route recovery | `multiple` | read-only | passed-historical-mem0 |
| `NAV-009` | Navigation integration | navigation | Selected navigation state | `multiple` | destructive-isolated | passed-historical-mem0 |
| `INT-006` | Cross-page integration | proxy-health | Cross-page integration: proxy-health | `multiple` | read-only | not-run-reconstructed |
| `INT-007` | Cross-page integration | checkin-policy | Cross-page integration: checkin-policy | `multiple` | isolated-fixture | not-run-reconstructed |
| `INT-008` | Cross-page integration | settings-session | Cross-page integration: settings-session | `multiple` | destructive-isolated | not-run-reconstructed |
| `INT-009` | Cross-page integration | monitor-provider | Cross-page integration: monitor-provider | `multiple` | isolated-upstream | not-run-reconstructed |
| `INT-010` | Cross-page integration | distribution-key | Cross-page integration: distribution-key | `multiple` | local-only | not-run-reconstructed |
| `INT-011` | Cross-page integration | navigation-history | Cross-page integration: navigation-history | `multiple` | read-only | not-run-reconstructed |
| `INT-012` | Cross-page integration | multi-page-theme | Cross-page integration: multi-page-theme | `multiple` | read-only | not-run-reconstructed |
| `INT-013` | Cross-page integration | logout-protection | Cross-page integration: logout-protection | `multiple` | read-only | not-run-reconstructed |

## 288 项 UI 矩阵

| ID | Page | Route | Width | Theme | Auth | Checks | Status |
|---|---|---|---:|---|---|---|---|
| `UI-001` | Overview | `/dashboard/overview` | 375 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-002` | Overview | `/dashboard/overview` | 375 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-003` | Overview | `/dashboard/overview` | 375 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-004` | Overview | `/dashboard/overview` | 375 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-005` | Overview | `/dashboard/overview` | 768 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-006` | Overview | `/dashboard/overview` | 768 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-007` | Overview | `/dashboard/overview` | 768 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-008` | Overview | `/dashboard/overview` | 768 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-009` | Overview | `/dashboard/overview` | 1440 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-010` | Overview | `/dashboard/overview` | 1440 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-011` | Overview | `/dashboard/overview` | 1440 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-012` | Overview | `/dashboard/overview` | 1440 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-013` | Providers | `/dashboard/providers` | 375 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-014` | Providers | `/dashboard/providers` | 375 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-015` | Providers | `/dashboard/providers` | 375 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-016` | Providers | `/dashboard/providers` | 375 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-017` | Providers | `/dashboard/providers` | 768 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-018` | Providers | `/dashboard/providers` | 768 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-019` | Providers | `/dashboard/providers` | 768 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-020` | Providers | `/dashboard/providers` | 768 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-021` | Providers | `/dashboard/providers` | 1440 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-022` | Providers | `/dashboard/providers` | 1440 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-023` | Providers | `/dashboard/providers` | 1440 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-024` | Providers | `/dashboard/providers` | 1440 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-025` | Authorization | `/dashboard/authorization` | 375 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-026` | Authorization | `/dashboard/authorization` | 375 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-027` | Authorization | `/dashboard/authorization` | 375 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-028` | Authorization | `/dashboard/authorization` | 375 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-029` | Authorization | `/dashboard/authorization` | 768 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-030` | Authorization | `/dashboard/authorization` | 768 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-031` | Authorization | `/dashboard/authorization` | 768 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-032` | Authorization | `/dashboard/authorization` | 768 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-033` | Authorization | `/dashboard/authorization` | 1440 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-034` | Authorization | `/dashboard/authorization` | 1440 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-035` | Authorization | `/dashboard/authorization` | 1440 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-036` | Authorization | `/dashboard/authorization` | 1440 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-037` | Endpoint & Access | `/dashboard/endpoint` | 375 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-038` | Endpoint & Access | `/dashboard/endpoint` | 375 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-039` | Endpoint & Access | `/dashboard/endpoint` | 375 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-040` | Endpoint & Access | `/dashboard/endpoint` | 375 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-041` | Endpoint & Access | `/dashboard/endpoint` | 768 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-042` | Endpoint & Access | `/dashboard/endpoint` | 768 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-043` | Endpoint & Access | `/dashboard/endpoint` | 768 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-044` | Endpoint & Access | `/dashboard/endpoint` | 768 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-045` | Endpoint & Access | `/dashboard/endpoint` | 1440 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-046` | Endpoint & Access | `/dashboard/endpoint` | 1440 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-047` | Endpoint & Access | `/dashboard/endpoint` | 1440 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-048` | Endpoint & Access | `/dashboard/endpoint` | 1440 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-049` | Models | `/dashboard/models` | 375 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-050` | Models | `/dashboard/models` | 375 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-051` | Models | `/dashboard/models` | 375 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-052` | Models | `/dashboard/models` | 375 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-053` | Models | `/dashboard/models` | 768 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-054` | Models | `/dashboard/models` | 768 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-055` | Models | `/dashboard/models` | 768 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-056` | Models | `/dashboard/models` | 768 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-057` | Models | `/dashboard/models` | 1440 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-058` | Models | `/dashboard/models` | 1440 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-059` | Models | `/dashboard/models` | 1440 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-060` | Models | `/dashboard/models` | 1440 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-061` | Combo Models | `/dashboard/combos` | 375 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-062` | Combo Models | `/dashboard/combos` | 375 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-063` | Combo Models | `/dashboard/combos` | 375 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-064` | Combo Models | `/dashboard/combos` | 375 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-065` | Combo Models | `/dashboard/combos` | 768 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-066` | Combo Models | `/dashboard/combos` | 768 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-067` | Combo Models | `/dashboard/combos` | 768 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-068` | Combo Models | `/dashboard/combos` | 768 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-069` | Combo Models | `/dashboard/combos` | 1440 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-070` | Combo Models | `/dashboard/combos` | 1440 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-071` | Combo Models | `/dashboard/combos` | 1440 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-072` | Combo Models | `/dashboard/combos` | 1440 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-073` | Distribution | `/dashboard/distribution` | 375 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-074` | Distribution | `/dashboard/distribution` | 375 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-075` | Distribution | `/dashboard/distribution` | 375 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-076` | Distribution | `/dashboard/distribution` | 375 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-077` | Distribution | `/dashboard/distribution` | 768 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-078` | Distribution | `/dashboard/distribution` | 768 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-079` | Distribution | `/dashboard/distribution` | 768 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-080` | Distribution | `/dashboard/distribution` | 768 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-081` | Distribution | `/dashboard/distribution` | 1440 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-082` | Distribution | `/dashboard/distribution` | 1440 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-083` | Distribution | `/dashboard/distribution` | 1440 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-084` | Distribution | `/dashboard/distribution` | 1440 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-085` | Proxy Control | `/dashboard/proxy` | 375 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-086` | Proxy Control | `/dashboard/proxy` | 375 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-087` | Proxy Control | `/dashboard/proxy` | 375 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-088` | Proxy Control | `/dashboard/proxy` | 375 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-089` | Proxy Control | `/dashboard/proxy` | 768 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-090` | Proxy Control | `/dashboard/proxy` | 768 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-091` | Proxy Control | `/dashboard/proxy` | 768 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-092` | Proxy Control | `/dashboard/proxy` | 768 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-093` | Proxy Control | `/dashboard/proxy` | 1440 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-094` | Proxy Control | `/dashboard/proxy` | 1440 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-095` | Proxy Control | `/dashboard/proxy` | 1440 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-096` | Proxy Control | `/dashboard/proxy` | 1440 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-097` | Balances & Quotas | `/dashboard/balances` | 375 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-098` | Balances & Quotas | `/dashboard/balances` | 375 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-099` | Balances & Quotas | `/dashboard/balances` | 375 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-100` | Balances & Quotas | `/dashboard/balances` | 375 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-101` | Balances & Quotas | `/dashboard/balances` | 768 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-102` | Balances & Quotas | `/dashboard/balances` | 768 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-103` | Balances & Quotas | `/dashboard/balances` | 768 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-104` | Balances & Quotas | `/dashboard/balances` | 768 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-105` | Balances & Quotas | `/dashboard/balances` | 1440 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-106` | Balances & Quotas | `/dashboard/balances` | 1440 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-107` | Balances & Quotas | `/dashboard/balances` | 1440 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-108` | Balances & Quotas | `/dashboard/balances` | 1440 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-109` | Check-ins | `/dashboard/checkins` | 375 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-110` | Check-ins | `/dashboard/checkins` | 375 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-111` | Check-ins | `/dashboard/checkins` | 375 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-112` | Check-ins | `/dashboard/checkins` | 375 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-113` | Check-ins | `/dashboard/checkins` | 768 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-114` | Check-ins | `/dashboard/checkins` | 768 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-115` | Check-ins | `/dashboard/checkins` | 768 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-116` | Check-ins | `/dashboard/checkins` | 768 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-117` | Check-ins | `/dashboard/checkins` | 1440 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-118` | Check-ins | `/dashboard/checkins` | 1440 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-119` | Check-ins | `/dashboard/checkins` | 1440 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-120` | Check-ins | `/dashboard/checkins` | 1440 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-121` | Usage | `/dashboard/usage` | 375 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-122` | Usage | `/dashboard/usage` | 375 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-123` | Usage | `/dashboard/usage` | 375 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-124` | Usage | `/dashboard/usage` | 375 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-125` | Usage | `/dashboard/usage` | 768 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-126` | Usage | `/dashboard/usage` | 768 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-127` | Usage | `/dashboard/usage` | 768 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-128` | Usage | `/dashboard/usage` | 768 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-129` | Usage | `/dashboard/usage` | 1440 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-130` | Usage | `/dashboard/usage` | 1440 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-131` | Usage | `/dashboard/usage` | 1440 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-132` | Usage | `/dashboard/usage` | 1440 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-133` | Request Logs | `/dashboard/logs` | 375 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-134` | Request Logs | `/dashboard/logs` | 375 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-135` | Request Logs | `/dashboard/logs` | 375 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-136` | Request Logs | `/dashboard/logs` | 375 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-137` | Request Logs | `/dashboard/logs` | 768 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-138` | Request Logs | `/dashboard/logs` | 768 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-139` | Request Logs | `/dashboard/logs` | 768 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-140` | Request Logs | `/dashboard/logs` | 768 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-141` | Request Logs | `/dashboard/logs` | 1440 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-142` | Request Logs | `/dashboard/logs` | 1440 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-143` | Request Logs | `/dashboard/logs` | 1440 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-144` | Request Logs | `/dashboard/logs` | 1440 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-145` | Model Monitor | `/dashboard/monitor` | 375 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-146` | Model Monitor | `/dashboard/monitor` | 375 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-147` | Model Monitor | `/dashboard/monitor` | 375 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-148` | Model Monitor | `/dashboard/monitor` | 375 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-149` | Model Monitor | `/dashboard/monitor` | 768 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-150` | Model Monitor | `/dashboard/monitor` | 768 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-151` | Model Monitor | `/dashboard/monitor` | 768 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-152` | Model Monitor | `/dashboard/monitor` | 768 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-153` | Model Monitor | `/dashboard/monitor` | 1440 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-154` | Model Monitor | `/dashboard/monitor` | 1440 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-155` | Model Monitor | `/dashboard/monitor` | 1440 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-156` | Model Monitor | `/dashboard/monitor` | 1440 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-157` | Chain Health | `/dashboard/chain-health` | 375 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-158` | Chain Health | `/dashboard/chain-health` | 375 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-159` | Chain Health | `/dashboard/chain-health` | 375 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-160` | Chain Health | `/dashboard/chain-health` | 375 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-161` | Chain Health | `/dashboard/chain-health` | 768 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-162` | Chain Health | `/dashboard/chain-health` | 768 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-163` | Chain Health | `/dashboard/chain-health` | 768 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-164` | Chain Health | `/dashboard/chain-health` | 768 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-165` | Chain Health | `/dashboard/chain-health` | 1440 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-166` | Chain Health | `/dashboard/chain-health` | 1440 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-167` | Chain Health | `/dashboard/chain-health` | 1440 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-168` | Chain Health | `/dashboard/chain-health` | 1440 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-169` | System Info | `/dashboard/system` | 375 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-170` | System Info | `/dashboard/system` | 375 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-171` | System Info | `/dashboard/system` | 375 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-172` | System Info | `/dashboard/system` | 375 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-173` | System Info | `/dashboard/system` | 768 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-174` | System Info | `/dashboard/system` | 768 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-175` | System Info | `/dashboard/system` | 768 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-176` | System Info | `/dashboard/system` | 768 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-177` | System Info | `/dashboard/system` | 1440 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-178` | System Info | `/dashboard/system` | 1440 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-179` | System Info | `/dashboard/system` | 1440 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-180` | System Info | `/dashboard/system` | 1440 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-181` | Pricing | `/dashboard/pricing` | 375 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-182` | Pricing | `/dashboard/pricing` | 375 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-183` | Pricing | `/dashboard/pricing` | 375 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-184` | Pricing | `/dashboard/pricing` | 375 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-185` | Pricing | `/dashboard/pricing` | 768 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-186` | Pricing | `/dashboard/pricing` | 768 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-187` | Pricing | `/dashboard/pricing` | 768 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-188` | Pricing | `/dashboard/pricing` | 768 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-189` | Pricing | `/dashboard/pricing` | 1440 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-190` | Pricing | `/dashboard/pricing` | 1440 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-191` | Pricing | `/dashboard/pricing` | 1440 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-192` | Pricing | `/dashboard/pricing` | 1440 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-193` | Proxy Pools | `/dashboard/proxy-pools` | 375 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-194` | Proxy Pools | `/dashboard/proxy-pools` | 375 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-195` | Proxy Pools | `/dashboard/proxy-pools` | 375 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-196` | Proxy Pools | `/dashboard/proxy-pools` | 375 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-197` | Proxy Pools | `/dashboard/proxy-pools` | 768 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-198` | Proxy Pools | `/dashboard/proxy-pools` | 768 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-199` | Proxy Pools | `/dashboard/proxy-pools` | 768 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-200` | Proxy Pools | `/dashboard/proxy-pools` | 768 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-201` | Proxy Pools | `/dashboard/proxy-pools` | 1440 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-202` | Proxy Pools | `/dashboard/proxy-pools` | 1440 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-203` | Proxy Pools | `/dashboard/proxy-pools` | 1440 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-204` | Proxy Pools | `/dashboard/proxy-pools` | 1440 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-205` | Settings | `/dashboard/settings` | 375 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-206` | Settings | `/dashboard/settings` | 375 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-207` | Settings | `/dashboard/settings` | 375 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-208` | Settings | `/dashboard/settings` | 375 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-209` | Settings | `/dashboard/settings` | 768 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-210` | Settings | `/dashboard/settings` | 768 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-211` | Settings | `/dashboard/settings` | 768 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-212` | Settings | `/dashboard/settings` | 768 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-213` | Settings | `/dashboard/settings` | 1440 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-214` | Settings | `/dashboard/settings` | 1440 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-215` | Settings | `/dashboard/settings` | 1440 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-216` | Settings | `/dashboard/settings` | 1440 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-217` | Protocol Debugger | `/dashboard/translator` | 375 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-218` | Protocol Debugger | `/dashboard/translator` | 375 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-219` | Protocol Debugger | `/dashboard/translator` | 375 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-220` | Protocol Debugger | `/dashboard/translator` | 375 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-221` | Protocol Debugger | `/dashboard/translator` | 768 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-222` | Protocol Debugger | `/dashboard/translator` | 768 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-223` | Protocol Debugger | `/dashboard/translator` | 768 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-224` | Protocol Debugger | `/dashboard/translator` | 768 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-225` | Protocol Debugger | `/dashboard/translator` | 1440 | light | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-226` | Protocol Debugger | `/dashboard/translator` | 1440 | light | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-227` | Protocol Debugger | `/dashboard/translator` | 1440 | dark | authenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-228` | Protocol Debugger | `/dashboard/translator` | 1440 | dark | unauthenticated | rendered-content, no-horizontal-overflow, readable-text-and-controls, no-console-error | not-run-reconstructed |
| `UI-229` | Overview | `/dashboard/overview` | 320 | light | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-230` | Overview | `/dashboard/overview` | 320 | dark | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-231` | Overview | `/dashboard/overview` | 1920 | light | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-232` | Overview | `/dashboard/overview` | 1920 | dark | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-233` | Providers | `/dashboard/providers` | 320 | light | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-234` | Providers | `/dashboard/providers` | 320 | dark | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-235` | Providers | `/dashboard/providers` | 1920 | light | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-236` | Providers | `/dashboard/providers` | 1920 | dark | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-237` | Authorization | `/dashboard/authorization` | 320 | light | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-238` | Authorization | `/dashboard/authorization` | 320 | dark | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-239` | Authorization | `/dashboard/authorization` | 1920 | light | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-240` | Authorization | `/dashboard/authorization` | 1920 | dark | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-241` | Models | `/dashboard/models` | 320 | light | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-242` | Models | `/dashboard/models` | 320 | dark | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-243` | Models | `/dashboard/models` | 1920 | light | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-244` | Models | `/dashboard/models` | 1920 | dark | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-245` | Combo Models | `/dashboard/combos` | 320 | light | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-246` | Combo Models | `/dashboard/combos` | 320 | dark | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-247` | Combo Models | `/dashboard/combos` | 1920 | light | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-248` | Combo Models | `/dashboard/combos` | 1920 | dark | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-249` | Distribution | `/dashboard/distribution` | 320 | light | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-250` | Distribution | `/dashboard/distribution` | 320 | dark | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-251` | Distribution | `/dashboard/distribution` | 1920 | light | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-252` | Distribution | `/dashboard/distribution` | 1920 | dark | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-253` | Balances & Quotas | `/dashboard/balances` | 320 | light | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-254` | Balances & Quotas | `/dashboard/balances` | 320 | dark | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-255` | Balances & Quotas | `/dashboard/balances` | 1920 | light | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-256` | Balances & Quotas | `/dashboard/balances` | 1920 | dark | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-257` | Check-ins | `/dashboard/checkins` | 320 | light | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-258` | Check-ins | `/dashboard/checkins` | 320 | dark | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-259` | Check-ins | `/dashboard/checkins` | 1920 | light | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-260` | Check-ins | `/dashboard/checkins` | 1920 | dark | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-261` | Usage | `/dashboard/usage` | 320 | light | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-262` | Usage | `/dashboard/usage` | 320 | dark | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-263` | Usage | `/dashboard/usage` | 1920 | light | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-264` | Usage | `/dashboard/usage` | 1920 | dark | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-265` | Request Logs | `/dashboard/logs` | 320 | light | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-266` | Request Logs | `/dashboard/logs` | 320 | dark | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-267` | Request Logs | `/dashboard/logs` | 1920 | light | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-268` | Request Logs | `/dashboard/logs` | 1920 | dark | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-269` | Model Monitor | `/dashboard/monitor` | 320 | light | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-270` | Model Monitor | `/dashboard/monitor` | 320 | dark | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-271` | Model Monitor | `/dashboard/monitor` | 1920 | light | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-272` | Model Monitor | `/dashboard/monitor` | 1920 | dark | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-273` | Proxy Control | `/dashboard/proxy` | 320 | light | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-274` | Proxy Control | `/dashboard/proxy` | 320 | dark | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-275` | Proxy Control | `/dashboard/proxy` | 1920 | light | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-276` | Proxy Control | `/dashboard/proxy` | 1920 | dark | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-277` | Settings | `/dashboard/settings` | 320 | light | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-278` | Settings | `/dashboard/settings` | 320 | dark | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-279` | Settings | `/dashboard/settings` | 1920 | light | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-280` | Settings | `/dashboard/settings` | 1920 | dark | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-281` | Pricing | `/dashboard/pricing` | 320 | light | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-282` | Pricing | `/dashboard/pricing` | 320 | dark | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-283` | Pricing | `/dashboard/pricing` | 1920 | light | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-284` | Pricing | `/dashboard/pricing` | 1920 | dark | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-285` | Protocol Debugger | `/dashboard/translator` | 320 | light | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-286` | Protocol Debugger | `/dashboard/translator` | 320 | dark | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-287` | Protocol Debugger | `/dashboard/translator` | 1920 | light | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |
| `UI-288` | Protocol Debugger | `/dashboard/translator` | 1920 | dark | authenticated | responsive-extreme, no-horizontal-overflow, text-and-table-clipping, primary-action-accessible | not-run-reconstructed |

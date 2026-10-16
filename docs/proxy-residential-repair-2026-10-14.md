# 7891 住宅池被旧规则覆盖与节点排序修复

当前状态：前端与住宅池策略已上线，专项 DNS 维护已完成，7891 日本住宅出口与真实页面验收通过。

## 覆盖原因与证据

10月13日的治理记录明确限定：7891 / ai-谷歌 仅使用 H1P2M3 的住宅节点，排除香港和台湾，移除素心，选中日本 JP2 住宅。当天谷歌检查返回204，出口验证为日本住宅。

10月14日08:56:54的原子安装前备份 `config-2dd6e04fd38545539cea1d9f1b006691.yaml` 仍保存这12个节点和日本选择。08:57:58的备份 `config-0155bd88ca734e298e61aa8c578ca646.yaml` 已是13个美国节点，包含11个素心节点。系统日志确认这两个时刻都执行了 `hermes-mihomo-install`；H1P2M3订阅记录的更新时间是08:57:58。

真实后端调用链为：`update_subscription` → `_upsert_full_yaml_config` → `_write_config_validated` → `proxy_policy.enforce_us_egress` → 原子安装与重载。旧的 `google_ai_pool` 从素心和 H1P2M3 共同筛选美国节点，只优先住宅，并不限制为住宅。

对08:56更新前的真实备份运行旧筛选函数，可直接复现12个住宅节点被改成13个美国节点，并把日本选择改成美国。新函数在同一份备份上保留12个住宅节点和日本选择。Dashboard没有保存带时间与调用者的订阅访问日志，不能据此确定是谁点击或调用了更新。

## 修复内容

- [后端补丁](../patches/7891-residential-policy.patch)：仅从 H1P2M3 实际成员选择住宅节点，排除香港、台湾及其常用别名；保留有效选择、黑名单和协议检查。订阅没有合格住宅节点时拒绝写入。默认恢复节点为日本 JP2 住宅。
- [前端补丁](../patches/proxy-nodes-sort-and-test.patch)：名称、协议类型、检测状态和延迟支持升降序；默认延迟升序，未知和超时置后。一键测速覆盖当前搜索列表，最多3个并发，显示进度和失败数量。
- 两份补丁均已对网关现有源码通过 `git apply --check`；后端策略已应用，前端功能与用户最新界面修改一起发布。

## 验证结果

后端隔离目录：`/home/meet/.codex/tmp/hermes-residential-20261014`。

策略20项、订阅更新10项、看护25项、单次订阅6项、谷歌探测2项，共63项通过。订阅集成测试覆盖H1P2M3、素心及其他机场连续更新，确认不会恢复素心、普通节点或香港节点，同时验证安装失败、重载回滚、回滚失败和元数据失败。

私有恢复配置 `candidate.yaml` 仅修改 ai-谷歌 的成员及当前选择，共12个住宅节点，选中日本 JP2 住宅；其他配置结构与当前配置一致，`mihomo -t` 返回成功。该文件包含上游凭据，保留在私有目录，未复制到本仓库。

前端 `npm.cmd test` 125项通过，`npm.cmd run build` 成功，静态预览HTTP 200。隔离浏览器验证6节点批量测速、3并发限制、失败后继续、筛选范围以及最新延迟排序；真实数据浏览器验证四列排序、搜索范围测速、深浅主题和手机宽度，测速接口HTTP 200，无未捕获异常。

发布前验收记录：`reports/proxy-nodes/isolated/acceptance.json` 与 `reports/proxy-nodes/live/acceptance.json`。恢复住宅池后首次生产验收仍遇到节点测速与出口 HTTP 502，失败记录保留在 `reports/proxy-nodes-production-20261014/live/acceptance.json`。

## 生产应用范围

用户授权合并上线后，10:02 应用后端补丁、备份并原子安装住宅池配置；运行时选中日本 JP2 住宅，候选成员为 H1P2M3 的12个住宅节点。生产源码再次运行策略20项、订阅10项、看护25项、单次订阅6项及谷歌探测2项，共63项通过。未实际下载或更新机场订阅进行测试。

前端版本为 `20261014-100305`，入口 `http://192.168.11.150:4317`。发布包含节点排序和一键测速、余额自动更新、供应商批量操作及最新文字层级、控件高度、页脚间距和签到操作对齐。对比远端源码时，仅这五个文件有功能差异：`ProxyPage.jsx`、`BalancesPage.jsx`、`ProvidersPage.jsx`、`styles.css`、`checkins.css`。本机125项测试和构建通过；网关125项测试及发布流程46项检查通过。

后端源码备份：`/home/meet/backups/hermes-residential/20261014-100202`。住宅池配置备份：`/home/meet/.hermes/atomic-backups/config.yaml.bak-20261014-100205`。前端源码备份：`/home/meet/backups/10router-web/pre-combined-20261014-100301`；发布及产物备份：`/home/meet/backups/10router-web/20261014-100305`。上一版 `20261013-164030` 保留可回滚。

## 节点 DNS 故障与专项维护

12个住宅节点定义与覆盖前备份完全一致，但首次测试均超时或报错。Mihomo 日志显示日本住宅的 IPv4 接入 `18.141.144.133:33309` 超时，IPv6 不可达。国内直连 AliDNS、腾讯 DoH 与系统解析均返回18.141.144.133；经可用出口查询 Google、Cloudflare 和 AliDNS 则一致返回209.248.50.31，后者同端口 TCP 连接及 TLS 1.3 握手成功。7892 谷歌204正常。

准备的修复只增加 `dns.proxy-server-nameserver-policy` 的 `+.q1w2e3a1.cn` 条目，使用 `https://1.1.1.1/dns-query#联通优化 直连0.3x`。解析请求通过现有 H1P2M3 接入节点发送，住宅业务仍以所选住宅节点为出口。订阅定向合并保留旧配置的 DNS，普通原子安装器同时禁止改变此部分。

普通安装器因仅允许修改 `proxies`、`proxy-groups`、`rules` 而拒绝 DNS 改动；拒绝时生产配置哈希保持不变。用户另行授权专项 DNS 维护并在网关执行管理员脚本后，于10:23完成安装。专项脚本核对修改范围、以 meet 身份运行 Mihomo 校验、使用既有原子替换模块安装并热重载，验证日本住宅延迟成功；没有扩大普通安装器的权限范围。

DNS 维护备份：`/etc/mihomo/config.yaml.bak-dns-20261014-102326`；最终配置 SHA-256：`b51868019f536f12c4b1b21b28e40578ef1225650eb9822bb97fbad03ceac04b`。候选配置与管理员脚本保存在网关私有任务目录，含上游凭据的配置未进入本仓库。

最终实测：7891 谷歌 generate_204 返回204，IP 查询返回200，出口为日本东京，`hosting=false`。生产节点验收四列排序、未知值置后、搜索后仅测试两个日本住宅节点、深浅主题和手机宽度通过；所有测量接口返回200，网络异常与未捕获异常均为0。三个代理入口的出口 IP、页面重进及刷新缓存复用通过。

随后对12个住宅候选分别测速：5个成功、7个失败。日本 JP2 普通版147ms、hy2版277ms，越南 VN1 普通版161ms、hy2版269ms，马来西亚 MY1 普通版177ms；美国 US2 两种协议、韩国 KR2 两种协议、泰国 TH1 两种协议及马来西亚 MY1 hy2 仍返回503或504。上述为本次探测快照，不能据此宣称整个机场已恢复。运行时仍选中日本 JP2 住宅。

记录：`reports/proxy-nodes-production-final-20261014/live/acceptance.json`、`reports/egress-production-final-20261014/acceptance.json`、`reports/ui-text-production-20261014/acceptance.json`、`reports/fonts-production-20261014/acceptance.json`、`reports/provider-batch-production-20261014/acceptance.json`、`reports/balances-auto-20261013/live/acceptance.json`。真实文字22组、日志布局24组及字体资源检查通过。字体检查已修正为检查单元格可用空间、单行文字和边界；短模型名的自然文字宽度不代表模型列被挤窄，产品样式未因此修改。

页面所称5分钟是出口 IP 缓存时长；当前节点看护为每轮检测后等待60秒，机场自动组配置的测速间隔为1800秒。

## 入口显示名称统一

用户随后要求统一名称。前端 `proxyEntries` 优先使用监听器实际绑定的代理组名作为入口显示名称，无代理组绑定时保留监听器名称。7891入口、7891代理池和故障看护均显示 `ai-谷歌`；7892入口与看护均显示 `AI-优选`。页面不再显示历史入口标识 `ai-tw`、`ai-best`。底层监听器标识未改动，Mihomo 配置 SHA-256仍为上述b5186801开头的值。

新版 `20261014-103553` 已发布，本机及网关125项测试、前端构建和发布流程46项检查通过。生产浏览器核对入口标签、看护标题、代理池名称及日本住宅选择通过，HTTP均为200，无未捕获异常。7891再次实测谷歌204、位置接口200，日本出口 `hosting=false`。

记录：`reports/proxy-names-production-20261014/acceptance.json`。源码备份：`/home/meet/backups/10router-web/pre-unified-names-20261014-103550`；发布备份：`/home/meet/backups/10router-web/20261014-103553`；上一版 `20261014-100305` 保留可回滚。

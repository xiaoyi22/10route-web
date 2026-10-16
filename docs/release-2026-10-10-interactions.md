# 交互动画、日志字体与链路健康发布验收

2026年10月10日，用户确认请求日志整页字体调整，其余按已提出的动画、三态主题控件、日志默认成功和链路健康首次加载方案实施。生产版本20261010-172905，前端服务于17:29:08（Asia/Shanghai）启动，ActiveState=active，MainPID=1775997。

## 最终行为

- 请求日志采用独立字号层级：标题24px，筛选与主要操作13px，表头、数据、模型、供应商、Token及延迟12px；主要数值字重500。详情弹窗标题18px、标签12px、值13px。保留自托管字体、主题对比度和专用日志列结构。
- 请求日志首次进入默认status=success；状态按钮、筛选框及请求参数一致，刷新沿用用户选择，清除筛选恢复默认成功。导出继续遵循当前页面筛选。
- 主题下拉改为浅色、深色、跟随系统三态原生单选控件，选中背景220ms滑动；窄屏保留图标及完整无障碍标签。支持键盘、系统主题变化、刷新后持久化，切换不丢筛选草稿。
- 页面进入、摘要卡片、弹窗、导航和按钮提供轻量反馈；自动刷新不重新挂载页面。prefers-reduced-motion关闭动画和过渡。
- 管理模式首次进入链路健康且无检测记录时自动检测一次，显示加载与失败重试；已有记录直接显示，手动检测保留。桥接层合并并发检测并保留30秒限流。
- 检测结果原子保存到TENROUTER_CHECKIN_DIR下的chain-health.json，权限600；重启后恢复对应Hermes地址的结果，过期记录仍标明历史状态，写入失败显示提示。

## 验证证据

| 命令或检查 | 环境 | 实际结果 |
| --- | --- | --- |
| npm test | Windows / KN10 Linux | 各120项通过，0失败 |
| npm run build | Windows / KN10 Linux | 构建成功，8.70s / 6.32s |
| node --test tests/chain-health.test.mjs tests/hermes.test.mjs | Windows | 7项通过；持久化用例修复前因缺少缓存文件失败，修复后通过 |
| node tests/interaction-browser.mjs | Windows Edge、生产构建预览、真实日志与隔离健康接口 | 6组字体/主题/视口检查；默认成功、失败刷新、主题键盘/系统/持久化/草稿、首次检测、重入缓存、503故障注入重试和减少动画设置通过 |
| node tests/theme-browser.mjs | Windows Edge、生产构建预览 | 1080P、125%/150% DPI等效场景与手机；对比度、图表、打开的弹窗、主题持久化及反复切换通过 |
| HERMES_TEST_PORT=4328 TENROUTER_TEST_DIST=1 node tests/hermes-browser.mjs | Windows Edge、隔离完整生产服务 | Hermes代理、订阅、首次自动检测、缓存刷新、会话过期、深浅主题与手机回归通过 |
| node tests/interaction-browser.mjs --live-health | KN10预览4337 / 生产4317，Windows Edge可见窗口 | 各6组字体/主题/视口检查通过，真实链路可见，控制台与未捕获异常为0 |
| node tests/readability-browser.mjs | KN10预览 / 生产 | 各22组检查通过；正文至少14px、业务文字至少12px、日志表格12px、其他表格至少13px，接口HTTP 200 |
| node tests/log-layout-browser.mjs --live | Windows预览 / 生产 | 各24组主题/价格/视口检查通过；1920×1080延迟列约231px，内容均在各自列内 |
| node tests/request-latency-browser.mjs --live | Windows预览 / 生产 | 各16组检查通过；首字、生成速度、总耗时对齐，4px色条与时间独立 |
| curl.exe 页面、健康和未登录业务接口 | 生产 | /dashboard/logs=200，/api/health=200，/api/providers=401 |

正常页面回归无控制台错误或未捕获异常。故障注入测试仅收到预期的一条503资源错误，并验证重试恢复。

真实首次检测于17:25:29完成：Mem0四个组件、Icarus五个组件，异常组件0；记忆数量7404，提取文件9439。正式发布重启后/api/hermes/health=200，checked_at仍为2026-10-10T09:25:29.314Z，与预览一致，证明缓存恢复且没有重复检测。以上数量与状态是该次检测快照。

## 发布与回滚

- 355个源码文件在上传、Linux构建与发布后分别通过SHA-256逐项校验；保留上一轮字体和延迟修复及已有工作区改动。
- 生产入口为http://192.168.11.150:4317，真实后端仍为192.168.11.150:20128。
- 本次仅重启10router-web.service；后端进程PID及前端systemd单元哈希与发布前一致。未执行Git提交或网关配置变更。
- 新版：/home/meet/.local/share/10router-web/releases/20261010-172905。
- 发布备份：/home/meet/backups/10router-web/20261010-172905。
- 源码备份与验证日志：/home/meet/backups/10router-web/pre-interactions-20261010-171925。
- 上一版：/home/meet/.local/share/10router-web/releases/20261010-153609。
- 截图与验收JSON位于screenshots/interactions-production及screenshots/readability-interactions-production。

回滚前验证上一版目录存在，再将current切回上一版并重启前端。检测缓存保留，旧版不会读取该文件。

```bash
test -f /home/meet/.local/share/10router-web/releases/20261010-153609/dist/index.html
ln -sfnT /home/meet/.local/share/10router-web/releases/20261010-153609 /home/meet/.local/share/10router-web/current
systemctl --user restart 10router-web.service
curl --noproxy '*' -fsS --max-time 10 http://127.0.0.1:4317/api/health
```

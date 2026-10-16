# 深色文字可读性与日志延迟布局发布验收

2026年10月10日，用户授权将深色字体可读性修复与现网日志延迟错位一并上线。生产版本为20261010-153609，前端服务于15:36:11（Asia/Shanghai）启动，ActiveState=active，MainPID=1734443。

## 最终行为

- 保留自托管SF Pro与苹方字体、原有主题语义色。正文14px，表格数据、表头、主要按钮与导航13px，辅助说明、状态、模型标识及图表刻度至少12px，供应商名称14px。
- 发布本地已有的专用日志列结构和RequestLatency/RequestTime组件；延迟三行显示首字、生成速度及总耗时，日期和时分秒显示在独立时间列。
- 1920×1080下现网延迟列由旧版约70px恢复为约231px；真实页面断言outsideCell=0、timeSeparate=true。
- 时间辅助字保持12px，完整金额保留9%的价格列；增大字号后日期、金额和延迟不跨列。模型内容区保留至少140px，长名称使用单行省略号与完整标题提示。

## 验证证据

| 命令或检查 | 环境 | 实际结果 |
| --- | --- | --- |
| npm test | Windows与KN10 Linux | 各118项通过，0失败 |
| npm run build / node scripts/build.mjs | Windows / Linux | 构建成功；最终分别13.72s / 6.50s |
| node tests/theme-browser.mjs | 生产构建预览，真实后端 | 1080P、125%/150% DPI等效场景与手机均PASS；深浅对比度、图表、弹窗、主题持久化与切换通过 |
| node tests/readability-browser.mjs | 构建预览与现网 | 各22组页面/主题/视口检查PASS；正文至少14px、业务文字至少12px、表格数据至少13px |
| node tests/font-browser.mjs | 构建预览与现网 | 自托管字体实际绘制中英文字形；同源WOFF2资源HTTP 200；模型内容宽度通过 |
| node tests/request-latency-browser.mjs --live | 构建预览与现网 | 各16组主题/价格/视口组合PASS；三行对齐、4px色条、时间列分离 |
| node tests/log-layout-browser.mjs --live | 构建预览与现网 | 各24组组合PASS；模型、端点、Token、金额、延迟和时间均在单元格内 |
| 日志压力用例 | 本地隔离演示 | 长模型名/端点及大Token数值24组组合PASS，未知/零延迟16组组合PASS |
| Windows Edge可见窗口目测 | 真实现网，深色模式 | 供应商与日志已加载新版样式，字号和分列生效 |

浏览器回归均无控制台错误或未捕获页面异常；真实业务验收仅登录和GET读取，没有创建或修改网关业务数据。DPI等效场景不代表修改操作系统显示设置。

外部curl实测：/api/health=200，/dashboard/overview=200，未登录/api/providers=401；登录后的请求日志与价格接口均为200。

## 发布与回滚

- 本地源码基线：94bc97362215f938ad75f8fee846bba01ab1ca83，包含本次已验收工作区修改；未执行Git提交。
- 已验收源码351个文件在上传、构建和发布后分别通过SHA-256逐项校验。既有价格修复文件保持原样，其本地和远端哈希一致。
- 发布使用scripts/deploy-kn10.sh，仅重启10router-web.service；systemd单元哈希与发布前一致。
- 新版：/home/meet/.local/share/10router-web/releases/20261010-153609。
- 发布备份：/home/meet/backups/10router-web/20261010-153609。
- 发布前源码备份与验收日志：/home/meet/backups/10router-web/pre-readability-20261010-153401；最终status为browser-verified。
- 上一版：/home/meet/.local/share/10router-web/releases/20261010-141409，保留可回滚。

回滚时先验证上一版目录存在，再停止前端服务、将current软链切回上一版并启动前端；后端服务和网关配置无需变更。

```bash
test -f /home/meet/.local/share/10router-web/releases/20261010-141409/dist/index.html
systemctl --user stop 10router-web.service
ln -sfnT /home/meet/.local/share/10router-web/releases/20261010-141409 /home/meet/.local/share/10router-web/current
systemctl --user start 10router-web.service
curl --noproxy 127.0.0.1 -fsS http://127.0.0.1:4317/api/health
```

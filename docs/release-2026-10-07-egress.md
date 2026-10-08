# 出口 IP / 位置自动缓存发布记录

## 发布

- 版本：20261007-171320，2026-10-07 17:13（Asia/Shanghai）。
- 生产入口：http://192.168.11.150:4317/dashboard/proxy；真实后端：http://192.168.11.150:20128。
- 内网可用，本次只通过内网SSH上传源码与已验收构建，不使用映射盘，不访问Tailscale，不执行Git提交或推送。
- 使用独立暂存目录 /home/meet/.local/share/10router-web/staging/20261007-171157，未覆盖服务器 /home/meet/10router-web 中的现有未提交工作。
- 前端10router-web.service于17:13:21重启，进程189027，服务active且NRestarts=0。后端10router.service进程180012保持运行，未修改或重启后端，未更改数据库、节点、订阅或上游凭据。

## 验收

- Windows及KN10 Linux完整测试均为67/67通过；发布门禁12/12通过；生产构建通过。
- 正式入口7890、7891、7892的真实出口自动检测、节点链绑定、切页及浏览器刷新缓存恢复通过，未重复主动探测，未执行模型或Mem0健康检查。
- 生产主题验收108项通过，覆盖1080P常规、125%、150%缩放与375px手机，以及深浅主题、打开弹窗时切换、颜色对比度和偏好保持。浏览器异常和非预期业务写请求均为0。
- 前后端健康接口均通过；未登录访问 /api/hermes/proxy/groups 返回401。
- 已发布文件与验收构建一致。源码与构建归档SHA-256：062037f09296062765608f36cb19d15671c1b99a0213da6520389170d6a25aa0。index.html SHA-256：364d15dcfa9db47dbdeac4cf8975bc9a931e2141287bb303c6a8eaf67da1d23d。

## 回滚与追溯

- 当前版本：/home/meet/.local/share/10router-web/releases/20261007-171320。
- 上一版本：/home/meet/.local/share/10router-web/releases/20261007-160415。
- 备份：/home/meet/backups/10router-web/20261007-171320，包含发布产物、源码与构建归档及校验值、上一版本指针、部署日志、Linux测试日志和验收记录。
- 原服务单元保存在 /home/meet/.config/systemd/user/10router-web.service.bak-20261007-171320。
- 若需回滚，通过SSH将current软链恢复至上一版本，恢复上述服务单元备份，执行用户级systemd daemon-reload并重启10router-web.service，再验收健康与登录边界；无需更改后端。

# 深浅主题与文字可读性

主题使用既有 Zustand 的持久化偏好及根元素 data-theme，保持浅色、深色、跟随系统三种模式。文字和控件通过 CSS 语义变量实时更新；未替换主题管理器，也未改动后端或通过重新加载页面实现切换。

## 配色与层级

- 正文使用 --text，次要文字使用 --muted，时间、辅助说明和占位符使用 --dim。深色提亮弱文字，浅色加深弱文字，保留正文、次要、辅助三级对比度。
- 正文使用14px，普通页面的表格数据、表头、主要按钮和导航使用13px，辅助说明、状态、图例、图表刻度及模型路由标识使用至少12px；普通供应商页面名称使用14px。请求日志采用独立层级：标题24px，筛选与主要操作13px，表头、数据、模型、供应商、Token和延迟12px，主要数值字重500。保留现有 San Francisco 与苹方字体和紧凑排版，深浅主题共用字号规则。品牌图形和头像中的装饰字不纳入正文最小字号。
- 正文使用自托管10router Sans（SF Pro Display + 苹方），代码与数据使用10router Mono（SF Mono + 苹方），源于用户指定的juzeon/sf-pingfang-ttf。两个TTF完整转为WOFF2，不裁剪中文字符；保留系统回退，仅在字体资源失败或字符不被覆盖时使用。来源、校验值及授权提醒见public/fonts/README.md；生产部署状态以发布验收记录为准。
- 字体使用font-display: swap；正文预加载，代码字体按实际使用加载，无运行时GitHub或外部字体CDN依赖。原字体仅提供400常规字重，较粗字重由浏览器合成，不伪装成可变字体。
- 请求日志模型内容区保留至少140px，长模型名使用单行省略号及完整标题提示；窄屏在既有表格容器内横向滚动，不扩大整个页面。
- 请求日志保留专用colgroup及17%的延迟列，首字、生成速度、总耗时按三行对齐，时间独立显示日期和时分秒。时间辅助字保持12px，启用价格时金额列占9%，避免增大表格字号后日期或完整金额跨列；长模型名使用省略号及完整标题提示。
- input、select、textarea 的文字及占位符显式使用主题变量，占位符不额外降低透明度。
- Token 输入、输出、缓存读取、缓存创建及TPS使用 --token-input、--token-output、--token-cache、--token-created、--token-tps。日志数值、曲线、渐变与图例复用这些变量；浅色为更深的同类色，深色为更亮的同类色。
- 过滤后的未选图例保留可读文字，通过选中标识和文字层级区分，不再将整个按钮透明度降为0.4。成功、失败、警告保留独立语义色。

## 原生下拉选项

原生 select 的 option 和 optgroup 显式使用 --text 文字色与 --panel 背景色，避免深色主题下浅色文字落在浏览器默认白底上。禁用选项使用 --dim，仍保留原生不可选行为。选中高亮、键盘导航及焦点行为继续由浏览器处理；浅色、深色和跟随系统复用原有主题机制，切换无需刷新。

此修复适用于思考强度、供应商过滤等原生下拉框，仅调整样式，不修改检测计划或模型请求参数。主题切换使用浅色、深色、跟随系统三态单选控件，选中背景在220ms内滑动，窄屏显示图标，保留标签、原生键盘操作和持久化偏好。

## 浏览器回归

~~~powershell
node tests/theme-browser.mjs
node tests/monitor-select-theme-browser.mjs
node tests/font-browser.mjs
node tests/readability-browser.mjs
$env:PREVIEW_URL='http://192.168.11.150:4317'
$env:SCREENSHOT_DIR="$env:USERPROFILE/.codex/tmp/theme-real"
node tests/theme-browser.mjs
node tests/monitor-select-theme-browser.mjs
node tests/readability-browser.mjs
~~~

默认使用4318隔离演示。真实入口使用授权的仓库外 TENROUTER_TEST_PASSWORD，可通过 TENROUTER_TEST_LOGIN_ENV 指定凭据文件；禁止输出或提交凭据。

readability-browser.mjs默认使用4317开发服务，也可用PREVIEW_URL指定生产构建预览或真实网关；它只登录并读取页面，拦截其他API写请求。该专项检查正文至少14px、可见业务文字至少12px、请求日志表格至少12px、其他表格至少13px，覆盖深浅主题与四种视口/DPI等效场景，并记录页面及控制台错误、接口状态和截图。DPI等效场景不是修改操作系统显示设置。

页面进入、摘要卡片、弹窗及导航提供120至220ms的反馈；数据自动刷新不重新挂载页面或播放入场动画。prefers-reduced-motion关闭动画和过渡。interaction-browser.mjs验证三态控件、筛选、日志排版及链路健康首次检测；默认对健康接口使用隔离响应，只有显式--live-health才允许真实检测。

链路健康页面在管理模式首次读取到无记录时自动检测一次，读取已有记录不会调用模型。桥接层将结果原子保存到TENROUTER_CHECKIN_DIR下的chain-health.json，重启后恢复对应Hermes地址的结果；失败、过期及保存错误均显示真实状态，手动检测仍可用。

专项回归覆盖14个页面及1920×1080、1536×864/125%、1280×720/150%、375px手机场景，检查普通可读文字4.5:1、大号文字3:1、Token曲线3:1的目标；检查表头与关键账号说明字号、placeholder、弹窗和SVG文字。

验收还包含连续主题切换10次、刷新后偏好保持、跟随系统、打开请求详情和搜索弹窗时切换、Token图例选中状态及周期保留。模型编辑草稿只在隔离演示中输入并取消，确认系统主题切换不会丢失草稿。真实网关除了登录仅发送GET，不发测试模型请求、不改账号、不刷新实际上游配额。

通过 SCREENSHOT_DIR 输出截图及 acceptance.json，记录 passed、失败原因、颜色与对比度检查、页面异常及非只读请求。源码与生产构建产物分别验收；通过本地测试不表示已经部署线上。

DOM对比度检查会组合祖先背景与透明度，排除禁用控件及明确隐藏的装饰；不是对图片、所有复杂叠层或操作系统强制对比度模式的完整无障碍认证。浏览器强制深色扩展及用户设备特定问题仍需按实际环境定位。

font-browser.mjs通过浏览器CSS.getPlatformFontsForNode检查实际中文字形字体和中英混合代码字体，要求isCustomFont为true且字体名称匹配；同时检查同源WOFF2资源返回200、正确MIME及模型列宽度，不把CSS字体名称声明或document.fonts.check当作已加载字体的证据。

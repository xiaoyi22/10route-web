# 本地自托管字体

来源：用户指定的 https://github.com/juzeon/sf-pingfang-ttf 。固定上游提交为 a1fbd8a70d4b7d9236b669812729ae6411953bba，下载日期为2026-10-07。

## 字体与处理

- SuperPingFangV1.ttf：英文使用SF Pro Display，中文/CJK使用苹方；源文件8,291,296字节，包含30,697个Unicode映射。
- SuperSFMonoV1.ttf：英文使用SF Mono，中文/CJK使用苹方；源文件8,661,832字节，包含30,727个Unicode映射。
- 使用fontTools和Brotli完整转换为同名WOFF2，未裁剪字符、未修改字体名称或字重；转换后Unicode映射与原文件逐项比较一致。不额外分发TTF副本。
- CSS分别映射到10router Sans和10router Mono。字体只有常规400字重；网页较粗字重由浏览器合成。
- 正文预加载；等宽字体使用时加载。font-display: swap保证加载中仍能阅读，字符缺失或资源加载失败时保留系统回退。网页运行时不依赖GitHub或外部CDN。
- 生产静态服务仅允许读取这两个WOFF2路径，不开放整个fonts目录；字体响应使用font/woff2及no-cache，以便未来替换文件时重新验证缓存。

## 源文件校验

| 源文件 | SHA-256 |
| --- | --- |
| SuperPingFangV1.ttf | e2cd93e78c33c7dc0b73abcdcec2bd3fa49e91a187872bb4c195f1131dd51ecf |
| SuperSFMonoV1.ttf | fca8d8ca6d5e87c851fdbcaa2c7e5b55ef4885caa5ff3a83787778354b83ad38 |

| 分发文件 | 字节数 | SHA-256 |
| --- | --- | --- |
| SuperPingFangV1.woff2 | 4,117,432 | f8d8ddaca6188b3c4237832c66a587e7984ebc78155224c8686968b339815fa2 |
| SuperSFMonoV1.woff2 | 4,172,852 | 0e332d902ea6a33126bce1eebcb8b496ecb1841621cc700d76134b337a1356e0 |

## 授权说明

同目录LICENSE保留上游仓库的MIT文本。该仓库说明字体合并自macOS的SF与苹方；仓库许可证不等于已确认底层苹果字体的网页嵌入、再分发或商用授权。相关字体许可参见 https://developer.apple.com/fonts/ 。接入已完成本地字体与主题验收；生产部署状态以发布验收记录为准。本说明不表示已取得底层字体的再分发授权。

## 浏览器验收

tests/font-browser.mjs在深浅两种主题下使用CSS.getPlatformFontsForNode核实实际中英文字形由自托管字体绘制（isCustomFont为true），而非仅检查CSS字体名称。同时验证两个同源WOFF2请求返回200、正确MIME及日志模型列未被挤成单字竖排。

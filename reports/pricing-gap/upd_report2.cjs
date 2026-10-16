const fs=require('fs');
const f='补丁报告.md';
let h=fs.readFileSync(f,'utf8');
const add='\n\n## 第五轮(2026-10-14) 官方基座统一定价\n\n- 汇总官方基座索引 2312 条(网关现有价目优先 + OpenRouter + LiteLLM 维护价)\n- 对每个缺失模型做名称归一化匹配：去供应商前缀、去变体后缀(-ultraspeed/-thinking/-preview/-1m/-free 等)、claude 家族名重排(claude-4.5-opus 转 claude-opus-4.5)\n- 应用：第5轮 274 条/61 供应商，5b 修正 10 条(claude 重排与二次剥离)，5c 量化后缀 1 条(cloudflare llama-3.1-8b-instruct-awq)\n- 免费模型按 0 定价；基座为 0/0 占位价时跳过不写\n- 来源：gateway 现有价目 128 + litellm 119 + 其余为官方页/OpenRouter\n\n## 最终状态(全部五轮)\n\n- 价目条数：155 -> 1114(+959)，供应商 18 -> 110\n- 剩余缺失：375 / 1355(覆盖 72.3%)\n- 剩余构成：TTS 音色约 127(google-tts 60、gemini-tts-voices 30、openai-tts-voices 13、openrouter-tts-voices 13、edge-tts 11)、图像/视频按张计费约 60、ASR 按秒计费约 20、swe-agent 8、私域 auto/qmodel(qdc 13)、pplx-web/grok-web/venice 无公开基座、step 系 TTS 无公开价\n- 备份：backups/ 下含初始 155 条与每轮前快照，可一键回滚\n';
fs.writeFileSync(f, h+add, 'utf8');
console.log('报告已更新:', f, fs.statSync(f).size, 'bytes');

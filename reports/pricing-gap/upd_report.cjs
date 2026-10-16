const fs=require('fs');
const f='补丁报告.md';
let h=fs.existsSync(f)?fs.readFileSync(f,'utf8'):'';
const add=`\n\n## 第四轮(2026-10-14) embedding/TTS 官方价\n\n- 写入 44 条 / 11 供应商：embedding 26 条 + TTS 18 条\n- 来源：gemini.html 官方价表(Gemini Embedding 2/TTS)、Voyage 官方文档价(voyage-3-large 0.18、3.5 0.06、code-3 0.12 等)、LiteLLM 维护价(vertex/ai.google.dev 源)、Perplexity 文档价、OpenAI 目录价(tts-1 15 / tts-1-hd 30 / gpt-4o-mini-tts 0.6 / text-embedding 0.02/0.13/0.10，经 azure 条目交叉印证)\n- 跳过 3 条不存在的模型(gh/text-embedding-ada-002、venice/text-embedding-3-small、venice/text-embedding-ada-002)\n\n## 最终状态\n\n- 价目条数：155 -> 829（+674），供应商 18 -> 99\n- 剩余缺失：660 / 1355\n- 无公开价的剩余类别：虚构/中转 LLM(ocz、ws、commandcode、opencode-go 等)、自建通道(selfhosted-embedding、comfyui、cloudflare-ai)、免费音色(edge-tts)、未公开 TTS(step、xiaomi mimo)、图像/视频按张计费模型(flux、fal-ai、black-forest-labs 等)\n- 备份：backups/pricing.bak-2026-10-14T03-42-59-966Z.json(初始) 与 backups/pricing.bak-<最新>.json(第四轮前)\n`;
fs.writeFileSync(f, h+add, 'utf8');
console.log('报告已更新:', f, fs.statSync(f).size, 'bytes');

// 从上游 Ikaleio/lm-detector 同步模型指纹算法与检测数据到 src/fingerprint/。
// 用法：node scripts/sync-fingerprint.mjs [commit|branch]，默认 main。算法与数据必须来自同一提交。
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadTool } from './runtime-tools.mjs';

const repository = 'https://github.com/Ikaleio/lm-detector.git';
const root = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(root, 'src/fingerprint');
const ref = process.argv[2] || 'main';
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();

const workdir = await mkdtemp(join(tmpdir(), 'lm-detector-'));
try {
  const checkout = join(workdir, 'repo');
  // 上游 data/collections 约 2GB，只稀疏检出运行和校验需要的文件。
  git(workdir, 'clone', '--quiet', '--filter=blob:none', '--no-checkout', repository, checkout);
  git(checkout, 'sparse-checkout', 'set', '--no-cone', '/shared/', '/LICENSE', '/data/shared_detector.bin', '/data/unified_bank.json', '/data/unified_reference.jsonl');
  git(checkout, 'checkout', '--quiet', ref);
  const commit = git(checkout, 'rev-parse', 'HEAD');
  const committedAt = git(checkout, 'log', '-1', '--format=%cI');

  const { build } = await loadTool('esbuild');
  const license = await readFile(join(checkout, 'LICENSE'), 'utf8');
  const bundle = await build({
    stdin: {
      contents: [
        "export { analyzeSharedOutputs } from './shared/shared-detector.ts';",
        "export { decodeDetector } from './shared/detector-codec.ts';",
        "export { generateChallenges } from './shared/challenge-browser.js';",
        "export { parseNumbers } from './shared/fingerprint-core.js';",
      ].join('\n'),
      resolveDir: checkout,
      loader: 'js',
    },
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    write: false,
    // 网关以 http 访问时浏览器不提供 crypto.randomUUID；挑战 id 只作标识，用随机十六进制代替。
    define: { 'crypto.randomUUID': 'fingerprintRandomId' },
    banner: { js: `// 由 scripts/sync-fingerprint.mjs 生成，请勿手改。\n// 来源 ${repository} @ ${commit}\n/*\n${license.trim()}\n*/\nconst fingerprintRandomId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');` },
    logLevel: 'warning',
  });
  const bank = JSON.parse(await readFile(join(checkout, 'data/unified_bank.json'), 'utf8'));
  const slimBank = {
    schema: bank.schema,
    built_at: bank.built_at,
    source: { repository, commit, committedAt },
    models: bank.models.map(({ id, display_name, family, family_name, response_count }) => ({ id, display_name, family, family_name, response_count })),
  };

  // 先在临时目录校验：参考库内每个模型取最后 3 条参考回答，检查能否识别为自身。
  const staged = join(workdir, 'detector.js');
  await writeFile(staged, bundle.outputFiles[0].text);
  const { analyzeSharedOutputs, decodeDetector } = await import(pathToFileURL(staged).href);
  const detector = decodeDetector(await readFile(join(checkout, 'data/shared_detector.bin')));
  const batches = (await readFile(join(checkout, 'data/unified_reference.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  let correct = 0;
  const misses = [];
  const answersFor = id => batches.filter(batch => batch.model.id === id).flatMap(batch => batch.samples).slice(-3).map(item => ({ text: item.text, expected_count: item.expected_count }));
  for (const model of slimBank.models) {
    const analysis = analyzeSharedOutputs(answersFor(model.id), slimBank, detector);
    const top = analysis.results[0]?.model;
    if (top === model.id) correct += 1; else misses.push(`${model.id} -> ${top || analysis.prediction_name}`);
  }
  console.log(`库内自检：${correct}/${slimBank.models.length} 个模型识别为自身（库内样本，仅验证数据与算法匹配，不代表实际准确率）。`);
  if (misses.length) console.log(`未识别为自身：${misses.join('，')}`);
  if (correct < slimBank.models.length * 0.9) throw new Error('库内自检通过率低于 90%，未写入同步结果。');

  await mkdir(output, { recursive: true });
  await writeFile(join(output, 'detector.js'), bundle.outputFiles[0].text);
  await copyFile(join(checkout, 'data/shared_detector.bin'), join(output, 'shared_detector.bin'));
  await writeFile(join(output, 'bank.json'), JSON.stringify(slimBank, null, 2) + '\n');
  // 测试用固定样本：一个库内模型的 3 条参考回答。
  const sampleModel = slimBank.models.some(model => model.id === 'gpt-5.5') ? 'gpt-5.5' : slimBank.models[0].id;
  await writeFile(resolve(root, 'tests/fingerprint-sample.json'), JSON.stringify({ model: sampleModel, answers: answersFor(sampleModel) }) + '\n');
  console.log(`已同步 lm-detector ${commit.slice(0, 12)}（${committedAt}），参考库 ${slimBank.models.length} 个模型，构建于 ${slimBank.built_at}。`);
} finally {
  await rm(workdir, { recursive: true, force: true });
}

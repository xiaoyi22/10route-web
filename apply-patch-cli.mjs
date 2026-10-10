import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
const codexExe = process.env.CODEX_APPLY_PATCH_EXE || 'C:/Users/Meet/AppData/Local/npm/node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe';
const patch = readFileSync('.tmp-patch.txt', 'utf8');
const child = spawn(codexExe, ['--codex-run-as-apply-patch', patch], { stdio: ['ignore', 'pipe', 'pipe'] });
let stdout = '', stderr = '';
child.stdout.on('data', chunk => { stdout += chunk; process.stdout.write(chunk); });
child.stderr.on('data', chunk => { stderr += chunk; process.stderr.write(chunk); });
child.on('exit', code => {
  console.error('[apply-patch-cli] exit', code);
  process.exit(code ?? 1);
});
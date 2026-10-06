import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, readFile, readdir, rm } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { resolve, relative, join } from 'node:path';
import { openLiveSession } from './live-support.mjs';
import { cliTools } from '../src/api/cli-tools.js';

assert.equal(process.env.PREVIEW_URL, 'http://127.0.0.1:4319', 'CLI 写入仅允许真实配置副本');
const work = 'R:/backups/10router/web-full-integration-20261005-051141';
const root = resolve(work, 'cli-home');
const manifest = JSON.parse(await readFile(join(work, 'cli-manifest.json'), 'utf8'));
const files = { claude: '.claude/settings.json', codex: '.codex/config.toml', opencode: '.config/opencode/opencode.json', droid: '.factory/settings.json', openclaw: '.openclaw/openclaw.json', hermes: '.hermes/config.yaml', cline: '.cline/data/globalState.json', kilo: '.local/share/kilo/auth.json', 'deepseek-tui': '.deepseek/config.toml', jcode: '.jcode/config.toml', 'grok-build': '.grok/config.toml', copilot: '.config/Code/User/chatLanguageModels.json' };
const live = await openLiveSession('cli-tools');
const { base, page, context, read, check } = live;
const credentials = parseEnv(await readFile(resolve(process.env.USERPROFILE || process.env.HOME, '.codex/credentials/10router-web.env'), 'utf8'));
const password = credentials.TENROUTER_TEST_PASSWORD;
let baseline; let failure;
function safePath(path) { const target = resolve(root, path); const rel = relative(root, target); assert(rel && !rel.startsWith('..') && !rel.includes(':')); return target; }
async function allFiles(directory) { const result = []; for (const entry of await readdir(directory, { withFileTypes: true })) { const path = join(directory, entry.name); if (entry.isDirectory()) result.push(...await allFiles(path)); else if (entry.isFile()) result.push(path); } return result; }
try {
  assert.equal((await read('/api/settings')).enableTranslator, true);
  baseline = await live.backupDatabase();
  const beforeClaude = JSON.parse(await readFile(safePath(files.claude), 'utf8'));
  await page.goto(base + '/dashboard/cli-tools', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'CLI 工具', exact: true }).waitFor();
  assert.equal(await page.getByRole('article').count(), cliTools.length);
  await live.screenshots('/dashboard/cli-tools', 'cli-directory');
  for (const [tool, name] of cliTools.filter(([id]) => id !== 'devin' && (!process.env.CLI_TOOLS || process.env.CLI_TOOLS.split(',').includes(id)))) {
    await page.goto(base + `/dashboard/cli-tools?tool=${tool}`, { waitUntil: 'domcontentloaded' });
    const form = page.getByRole('form', { name: `${name} 客户端配置`, exact: true });
    await form.waitFor();
    await form.getByLabel('网关密钥', { exact: true }).locator('option').nth(1).waitFor({ state: 'attached' });
    await form.getByLabel('主模型', { exact: true }).locator('option').nth(1).waitFor({ state: 'attached' });
    const keyId = await form.getByLabel('网关密钥', { exact: true }).locator('option').nth(1).getAttribute('value');
    const model = await form.getByLabel('主模型', { exact: true }).locator('option').nth(1).getAttribute('value');
    assert(keyId && model);
    await form.getByLabel('网关密钥', { exact: true }).selectOption(keyId);
    await form.getByLabel('主模型', { exact: true }).selectOption(model);
    await form.getByLabel('网关地址', { exact: true }).fill('http://127.0.0.1:20128/v1');
    if (tool === 'claude') await form.getByLabel('启用 Exa 工具服务', { exact: true }).setChecked(false);
    await form.getByRole('button', { name: '应用客户端配置', exact: true }).click();
    const saved = page.waitForResponse(r => new URL(r.url()).pathname === `/api/cli-tools/${tool}-settings` && r.request().method() === 'POST');
    await page.getByRole('button', { name: '确认应用', exact: true }).click();
    const response = await saved;
    assert.equal(response.status(), 200, tool);
    const result = await response.json();
    assert.equal(result.success, true, tool);
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    let path = files[tool];
    if (tool === 'cowork') {
      const status = await read('/api/cli-tools/cowork-settings');
      assert(status.configPath?.startsWith('/home/meet/backups/10router/web-full-integration-20261005-051141/cli-home/'));
      path = status.configPath.split('/cli-home/')[1];
    }
    const actual = await readFile(safePath(path), 'utf8');
    assert(actual.includes(model), `${tool} 实际文件缺少所选真实模型`);
    const after = await read(`/api/cli-tools/${tool}-settings`);
    assert(after.installed === true || after.config || after.settings, `${tool} 保存后状态没有反映真实配置`);
    if (['claude', 'codex', 'hermes'].includes(tool)) await live.screenshots(`/dashboard/cli-tools?tool=${tool}`, `cli-${tool}`);
    if (tool === 'codex') {
      await page.getByLabel('档案名称', { exact: true }).fill('live-verification');
      const profile = page.waitForResponse(r => new URL(r.url()).pathname === '/api/cli-tools/codex-profiles' && r.request().method() === 'POST');
      await page.getByRole('button', { name: '保存当前配置为档案', exact: true }).click();
      assert.equal((await profile).status(), 200);
      assert((await readFile(safePath('.codex/live-verification.config.toml'), 'utf8')).includes(model));
      await page.getByRole('button', { name: '删除配置档案 live-verification', exact: true }).click();
      await page.getByRole('button', { name: '确认删除', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      assert(!(await read('/api/cli-tools/codex-profiles')).profiles.some(profile => profile.name === 'live-verification'));
    }
    check(`${name}：真实模型和密钥写入独立配置文件，API 回读通过`);
  }
  const afterClaude = JSON.parse(await readFile(safePath(files.claude), 'utf8'));
  assert.deepEqual(afterClaude.hooks, beforeClaude.hooks, 'Claude 原有 hooks 被修改');
  assert.equal(afterClaude.theme, beforeClaude.theme, 'Claude 原有主题被修改');
  assert.deepEqual(live.report.errors, []);
} catch (error) { failure = new Error(error.message.replaceAll(password, '[已隐藏]')); console.error(failure.message); }
finally {
  try {
    const originalPaths = new Set(manifest.map(item => safePath(item.path)));
    const backupPaths = new Set(manifest.map(item => safePath(item.backup)));
    for (const path of await allFiles(root)) if (!originalPaths.has(path) && !backupPaths.has(path)) await rm(safePath(relative(root, path)));
    for (const item of manifest) {
      await copyFile(safePath(item.backup), safePath(item.path));
      const sourceHash = createHash('sha256').update(await readFile(resolve('R:/', item.path))).digest('hex');
      assert.equal(sourceHash, item.sha256, `生产客户端文件发生变化：${item.path}`);
    }
    if (baseline) assert.equal((await context.request.post(base + '/api/settings/database', { data: { ...baseline, password } })).status(), 200);
    check('真实配置副本已恢复，生产客户端配置逐文件 SHA-256 保持一致');
  } catch (error) { failure ||= error; console.error('CLI 恢复失败：' + error.message); }
  await live.finish(failure);
}
if (failure) throw failure;

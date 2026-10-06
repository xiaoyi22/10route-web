import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const defaultToolchain = process.platform === 'win32' && existsSync('C:/Users/20449/.codex/tmp/10router-web-runtime')
  ? 'C:/Users/20449/.codex/tmp/10router-web-runtime'
  : undefined;

export async function loadTool(name) {
  const toolchain = process.env.TENROUTER_TOOLCHAIN_DIR || defaultToolchain;
  const require = toolchain
    ? createRequire(pathToFileURL(resolve(toolchain, 'package.json')))
    : createRequire(import.meta.url);
  return import(pathToFileURL(require.resolve(name)).href);
}

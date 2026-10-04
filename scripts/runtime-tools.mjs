import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadTool(name) {
  const require = process.env.TENROUTER_TOOLCHAIN_DIR
    ? createRequire(pathToFileURL(resolve(process.env.TENROUTER_TOOLCHAIN_DIR, 'package.json')))
    : createRequire(import.meta.url);
  return import(pathToFileURL(require.resolve(name)).href);
}

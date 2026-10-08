import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Linux deployment scripts and service use LF and keep checkout rules', async () => {
  for (const file of ['scripts/deploy-kn10.sh', 'scripts/publish.sh', 'scripts/10router-web.service']) {
    const content = await readFile(new URL('../' + file, import.meta.url), 'utf8');
    assert(!content.includes('\r'), file + ' must use LF for Linux deployment');
  }
  const attributes = await readFile(new URL('../.gitattributes', import.meta.url), 'utf8');
  assert.match(attributes, /^\*\.sh\s+text\s+eol=lf$/m);
  assert.match(attributes, /^\*\.service\s+text\s+eol=lf$/m);
});

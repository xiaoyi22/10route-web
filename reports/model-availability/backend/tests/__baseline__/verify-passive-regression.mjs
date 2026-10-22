import { readFileSync } from 'node:fs';

// Keep the normal regression contract for every offline test. Only the explicit
// upstream/live suites below are excluded from this operator-requested run.
const excludedFile = file => file.endsWith('.live.test.js') || file.includes('/translator/real/') || file.endsWith('/monitor-manual-live.test.js');
const base = new URL('./', import.meta.url);
const known = new Set(readFileSync(new URL('known-fails.txt', base), 'utf8').split('\n').map(line => line.trim()).filter(Boolean));
const inventory = JSON.parse(readFileSync(new URL('known-inventory.json', base), 'utf8'));
const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const statuses = new Map();
const problems = [];
const files = new Set();
for (const suite of report.testResults) {
  const file = 'tests/' + suite.name.replaceAll('\\', '/').split('/tests/').at(-1);
  files.add(file);
  for (const assertion of suite.assertionResults || []) {
    const key = file + ' :: ' + assertion.fullName;
    statuses.set(key, assertion.status);
    if (assertion.status === 'failed' && !known.has(key)) problems.push('REGRESSION ' + key);
  }
  if (suite.status === 'failed' && !suite.assertionResults.some(row => row.status === 'failed')) {
    const key = file + ' :: [suite-level failure]';
    statuses.set(key, 'failed');
    if (!known.has(key)) problems.push('REGRESSION ' + key);
  }
}
const excluded = new Set();
for (const [key, previous] of Object.entries(inventory)) {
  const file = key.split(' :: ')[0];
  if (excludedFile(file)) { excluded.add(file); continue; }
  const current = statuses.get(key);
  if (['passed', 'failed'].includes(previous) && !current) problems.push('MISSING ' + key);
  if (previous === 'passed' && ['skipped', 'todo'].includes(current)) problems.push('SKIPPED ' + key);
}
console.log('Passive regression: ' + files.size + ' files executed; explicit live exclusions: ' + [...excluded].join(', '));
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log('PASS: no new failure, missing offline test or newly skipped offline test. Live probes were not run.');

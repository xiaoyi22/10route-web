const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');
const directory = 'reports/model-availability/frontend-stage';
const digest = text => createHash('sha256').update(text.replaceAll('\r\n', '\n')).digest('hex');
const manifest = { existing: [], added: [], providerOperations: [] };
for (const file of ['src/App.jsx', 'src/pages/DistributionPage.jsx', 'src/api/fingerprint.js', 'src/api/policy.js']) {
  const before = file === 'src/api/policy.js' ? cp.execFileSync('git', ['show', 'HEAD:' + file], { encoding: 'utf8' }) : fs.readFileSync('reports/model-availability/frontend-before/' + file.replaceAll('/', '__'), 'utf8');
  manifest.existing.push({ file, before: digest(before) });
}
for (const file of [...manifest.existing.map(item => item.file), 'src/pages/AvailabilityPage.jsx', 'src/api/availability.js', 'src/availability.css', 'tests/model-availability.test.mjs', 'tests/model-availability-live-browser.mjs', 'reports/model-availability/backend/src/lib/availability/core.js', 'reports/model-availability/backend/src/shared/utils/businessObservation.js']) {
  const target = path.join(directory, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(file, target);
  if (!manifest.existing.some(item => item.file === file)) manifest.added.push(file);
}
manifest.providerOperations = [
  ["import { ModelsPage } from './CorePages.jsx';", "import { ModelsPage } from './CorePages.jsx';\nimport { availabilityLink, connectionAvailability } from '../api/availability.js';"],
  ["  const settings = useResource('/api/settings');", "  const settings = useResource('/api/settings');\n  const availability = useResource('/api/model-availability');"],
  ["          const failure = connection.lastError ? providerFailure(connection.lastError, connection.authType) : null;", "          const failure = connection.lastError ? providerFailure(connection.lastError, connection.authType) : null;\n          const health = connectionAvailability(availability.data?.rows, connection.id);"],
  ['</div></button></td><td className="provider-test-status">', '</div></button><Link className={`availability-channel-link${health?.blocked ? \' paused\' : \'\'}`} to={availabilityLink({ provider: connection.provider, connectionId: connection.id })}><Icon name="activity"/>{health?.label || \'查看模型可用性\'}</Link></td><td className="provider-test-status">'],
];
fs.writeFileSync(directory + '/manifest.json', JSON.stringify(manifest, null, 2));

import { join } from 'node:path';
import { loadTool } from '../scripts/runtime-tools.mjs';

let vite;
if (process.env.TENROUTER_TEST_DIST === '1') {
  const { startGatewayServer } = await import('../scripts/serve.mjs');
  vite = await startGatewayServer({ backendUrl: process.env.TENROUTER_INTERNAL_TARGET, host: '127.0.0.1', port: Number(process.env.TENROUTER_PORT), management: process.env.TENROUTER_ENABLE_MANAGEMENT === '1', hermesUrl: process.env.TENROUTER_HERMES_URL, hermesToken: process.env.TENROUTER_HERMES_TOKEN });
} else {
  const { createServer } = await loadTool('vite');
  vite = await createServer({ root: process.cwd(), configFile: join(process.cwd(), 'vite.config.js') });
  await vite.listen();
}
process.send({ ready: true });
process.on('message', async message => {
  if (message !== 'close') return;
  await vite.close();
  process.exit(0);
});

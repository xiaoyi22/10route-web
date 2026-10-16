import { spawn } from 'node:child_process';

// Isolated harness: a Vite preview running in --demo mode, which mounts the in-memory fixture server as its
// /api backend. The fixture listens on a fixed port so this harness can drive empty/error states through it.
// The real gateway is never contacted from here.

const FIXTURE_PASSWORD = 'linear-demo';

async function waitFor(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error('预启动超时：' + url);
}

export async function startIsolatedEnvironment({ port = 4331, fixturePort = 4332 } = {}) {
  const root = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const child = spawn(process.execPath, ['scripts/dev.mjs', '--demo', '--preview'], {
    cwd: root,
    env: { ...process.env, TENROUTER_PORT: String(port), TENROUTER_FIXTURE_PORT: String(fixturePort) },
    stdio: 'ignore',
  });
  const base = 'http://127.0.0.1:' + port;
  const fixtureUrl = 'http://127.0.0.1:' + fixturePort;
  await waitFor(base + '/api/auth/status');
  await waitFor(fixtureUrl + '/__fixture/state');
  const control = async body => {
    const response = await fetch(fixtureUrl + '/__fixture/mode', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error('fixture 控制失败 HTTP ' + response.status);
    return response.json();
  };
  return {
    base,
    fixtureUrl,
    password: FIXTURE_PASSWORD,
    setMode: mode => control({ mode }),
    setError: path => control({ mode: 'error', errorPath: path }),
    reset: () => control({ mode: 'normal' }),
    close: async () => { child.kill(); },
  };
}

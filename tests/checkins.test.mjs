import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createCheckinService, validateCheckinAccount } from '../scripts/checkin-service.mjs';
import { classifyCheckinResponse, isPublicAddress, sendCheckin, rotateCookieValue } from '../scripts/checkin-client.mjs';
import { createCheckinRunner } from '../scripts/checkin-runner.mjs';
import { parseBrowserCheckinResult } from '../scripts/anyrouter-browser-checkin.mjs';
import { selectAutomaticCheckinIds } from '../scripts/checkin-schedule.mjs';

const account = { site: '测试站', name: '账号一', baseUrl: 'https://site.example', protocol: 'newapi', authMode: 'cookie', userId: '42', cookie: 'session=unit-test-private-value' };

test('account validation rejects internal origins, credential forwarding and malformed inputs', () => {
  assert.equal(validateCheckinAccount(account).checkinPath, '/api/user/checkin');
  assert.equal(validateCheckinAccount({ ...account, protocol: 'legacy' }).checkinPath, '/api/user/sign_in');
  for (const cookie of ['raw-session-value', 'Cookie: session=test', 'session=test; invalid-fragment', '=test']) assert.throws(() => validateCheckinAccount({ ...account, cookie }), /Cookie/);
  assert.equal(validateCheckinAccount({ ...account, cookie: 'session=abc==; acw_tc=test' }).cookie, 'session=abc==; acw_tc=test');
  for (const baseUrl of ['http://site.example', 'https://localhost', 'https://127.0.0.1', 'https://[::1]', 'https://169.254.169.254', 'https://user:pass@site.example', 'https://site.example/path', 'https://site.example?key=secret']) assert.throws(() => validateCheckinAccount({ ...account, baseUrl }));
  assert.throws(() => validateCheckinAccount({ ...account, cookie: 'session=x\r\nOther: y' }));
  assert.throws(() => validateCheckinAccount({ ...account, checkinPath: '//other.example/api/user/checkin' }));
  assert.throws(() => validateCheckinAccount({ ...account, authMode: 'bearer', token: 'sk-model-api-key' }));
  assert.throws(() => validateCheckinAccount({ ...account, enabled: 'false' }));
});

test('refresh-token accounts exchange the session cookie for a bearer token before checkin', async () => {
  const refreshAccount = validateCheckinAccount({ ...account, authMode: 'refresh', userId: '', cookie: 'cf_clearance=abc; new_api_refresh=sid-value.hashvalue' });
  const seen = [];
  const requester = (url, options, callback) => {
    const request = new EventEmitter();
    request.end = () => queueMicrotask(() => {
      seen.push({ path: url.pathname, auth: options.headers.Authorization, cookie: options.headers.Cookie, sid: options.headers['X-Auth-Session'] });
      const response = new EventEmitter();
      response.statusCode = 200;
      response.headers = { 'content-type': 'application/json' };
      callback(response);
      response.emit('data', Buffer.from(url.pathname === '/api/user/auth/refresh' ? '{"success":true,"data":{"access_token":"jwt-token"}}' : '{"success":true,"data":{"quota_awarded":20}}'));
      response.emit('end');
      request.emit('close');
    });
    return request;
  };
  const result = await sendCheckin(refreshAccount, { lookup: async () => [{ address: '8.8.8.8', family: 4 }], requester });
  assert.equal(result.status, 'success');
  assert.equal(result.reward, 20);
  assert.deepEqual(seen.map(entry => entry.path), ['/api/user/auth/refresh', '/api/user/checkin']);
  assert.equal(seen[0].sid, 'sid-value');
  assert.equal(seen[0].auth, undefined);
  assert.equal(seen[1].auth, 'Bearer jwt-token');
  assert(!JSON.stringify(result).includes('hashvalue'));
});

test('refresh accounts require a refresh cookie entry and stop without checkin when refresh fails', async () => {
  assert.throws(() => validateCheckinAccount({ ...account, authMode: 'refresh', userId: '', cookie: 'session=only' }), /new_api_refresh/);
  let checkins = 0;
  const requester = (url, options, callback) => {
    const request = new EventEmitter();
    request.end = () => queueMicrotask(() => {
      if (url.pathname === '/api/user/checkin') checkins++;
      const response = new EventEmitter();
      response.statusCode = 401;
      response.headers = {};
      callback(response);
      response.emit('data', Buffer.from('{"success":false,"message":"Unauthorized, invalid access token"}'));
      response.emit('end');
      request.emit('close');
    });
    return request;
  };
  const result = await sendCheckin(validateCheckinAccount({ ...account, authMode: 'refresh', userId: '', cookie: 'new_api_refresh=sid.hash' }), { lookup: async () => [{ address: '8.8.8.8', family: 4 }], requester });
  assert.equal(result.status, 'expired');
  assert.equal(checkins, 0);
});

test('refresh rotation persists the server-issued cookie replacement into the vault', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kn10-rotate-'));
  try {
    const refreshAccount = { site: '刷新站', name: '轮换账号', baseUrl: 'https://site.example', protocol: 'newapi', authMode: 'refresh', cookie: 'cf_clearance=abc; new_api_refresh=sid.oldhash; new_api_has_session=1' };
    const service = createCheckinService({ directory, runner: async () => ({ status: 'success', message: '签到成功', credentialPatch: [{ name: 'new_api_refresh', value: 'sid.newhash' }] }) });
    const saved = await service.saveAccount(refreshAccount);
    await service.startJob({ ids: [saved.id] });
    await service.waitForIdle();
    const key = await readFile(join(directory, 'vault.key'));
    const saved0 = JSON.parse(await readFile(join(directory, 'vault.json'), 'utf8'));
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(saved0.nonce, 'base64'));
    decipher.setAuthTag(Buffer.from(saved0.tag, 'base64'));
    const vault = JSON.parse(Buffer.concat([decipher.update(Buffer.from(saved0.data, 'base64')), decipher.final()]).toString('utf8'));
    assert.equal(vault.accounts[0].cookie, 'cf_clearance=abc; new_api_refresh=sid.newhash; new_api_has_session=1');
    assert.equal(vault.history[0].credentialPatch, undefined);
    assert(!JSON.stringify(vault.history).includes('newhash'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('rotateCookieValue replaces in place and appends missing names', () => {
  assert.equal(rotateCookieValue('a=1; new_api_refresh=old; b=2', 'new_api_refresh', 'new'), 'a=1; new_api_refresh=new; b=2');
  assert.equal(rotateCookieValue('a=1', 'new_api_refresh', 'new'), 'a=1; new_api_refresh=new');
  assert.equal(rotateCookieValue('a=1', 'x', ''), 'a=1');
});

test('response classification preserves genuine failures and raw quota units', () => {
  assert.deepEqual(classifyCheckinResponse(200, '{"success":true,"data":{"quota_awarded":1000}}'), { status: 'success', message: '签到成功', reward: 1000 });
  assert.equal(classifyCheckinResponse(200, '{"success":false,"message":"今日已签到"}').status, 'already');
  assert.equal(classifyCheckinResponse(401, '{"message":"expired"}').status, 'expired');
  assert.equal(classifyCheckinResponse(403, '<html>Cloudflare Turnstile challenge</html>').status, 'verification');
  assert.equal(classifyCheckinResponse(302, '').status, 'verification');
  assert.equal(classifyCheckinResponse(429, '{"success":true}').status, 'error');
  assert.equal(classifyCheckinResponse(200, '<html>Login</html>').status, 'verification');
  assert.equal(classifyCheckinResponse(200, '{"success":false,"message":"签到功能未启用"}').status, 'unsupported');
  assert.equal(classifyCheckinResponse(200, '{"success":false,"message":"false failure"}').status, 'error');
});

test('AnyRouter presets use sign_in without matching unrelated origins', async () => {
  const { getCheckinSitePreset, getCheckinConfigurationIssue } = await import('../src/api/checkin-sites.js');
  assert.equal(getCheckinSitePreset('https://anyrouter.top/').checkinPath, '/api/user/sign_in');
  assert.equal(getCheckinSitePreset('https://anyrouter.top').protocol, 'legacy');
  for (const baseUrl of ['https://anyrouter.top.evil.example', 'https://evil.example/anyrouter.top', 'http://anyrouter.top', 'https://anyrouter.top:444', 'not a URL']) assert.equal(getCheckinSitePreset(baseUrl), null);
  assert(getCheckinConfigurationIssue({ baseUrl: 'https://anyrouter.top', checkinPath: '/api/user/checkin' }));
  assert.equal(getCheckinConfigurationIssue({ baseUrl: 'https://anyrouter.top', checkinPath: '/api/user/sign_in' }), null);
  assert.throws(() => validateCheckinAccount({ ...account, baseUrl: 'https://anyrouter.top' }), /sign_in/);
  assert.equal(validateCheckinAccount({ ...account, baseUrl: 'https://anyrouter.top', protocol: 'legacy' }).checkinPath, '/api/user/sign_in');
});

test('AnyRouter runner uses the browser adapter while other sites keep HTTP adapter', async () => {
  const calls = [];
  const browserRunner = async value => { calls.push(['browser', value.baseUrl]); return { status: 'success' }; };
  const httpRunner = async value => { calls.push(['http', value.baseUrl]); return { status: 'already' }; };
  const runner = createCheckinRunner({ proxyUrl: 'http://127.0.0.1:7890', browserRunner, httpRunner });
  const anyrouter = validateCheckinAccount({ ...account, site: 'AnyRouter', name: 'AnyRouter 账号', baseUrl: 'https://anyrouter.top', protocol: 'legacy', checkinPath: '/api/user/sign_in' });
  await runner(anyrouter);
  await runner(validateCheckinAccount(account));
  assert.deepEqual(calls, [['browser', 'https://anyrouter.top'], ['http', 'https://site.example']]);
});

test('browser result parser accepts only a whitelisted result line', () => {
  assert.deepEqual(parseBrowserCheckinResult('debug\nRESULT {status:success,message:签到成功,reward:100}\n'), { status: 'success', message: '签到成功', reward: 100 });
  assert.equal(parseBrowserCheckinResult('RESULT {status:error,message:secret-cookie}').message, '浏览器签到失败');
  assert.equal(parseBrowserCheckinResult('no result').diagnostic, 'browser');
});

test('automatic schedule waits until eight and skips accounts already confirmed today', () => {
  const snapshot = { accounts: [
    { id: 'success', enabled: true, lastResult: { status: 'success', timestamp: '2026-10-09T00:01:00.000Z' } },
    { id: 'failed', enabled: true, lastResult: { status: 'verification', timestamp: '2026-10-09T00:02:00.000Z' } },
    { id: 'disabled', enabled: false },
    { id: 'old', enabled: true, lastResult: { status: 'already', timestamp: '2026-10-08T16:01:00.000Z' } },
  ] };
  assert.deepEqual(selectAutomaticCheckinIds(snapshot, new Date('2026-10-09T00:30:00.000Z')), []);
  assert.deepEqual(selectAutomaticCheckinIds(snapshot, new Date('2026-10-09T01:30:00.000Z')), ['failed', 'old']);
});

test('WAF HTML and login failures have safe actionable diagnostics', () => {
  const waf = classifyCheckinResponse(200, '<html><script>document.cookie="acw_sc__v2=private"</script></html>', { 'set-cookie': ['acw_tc=private', 'cdn_sec_tc=private'] });
  assert.equal(waf.status, 'verification');
  assert.equal(waf.diagnostic, 'waf');
  assert(!JSON.stringify(waf).includes('private'));
  assert.equal(classifyCheckinResponse(200, JSON.stringify({ success: false, message: '无权进行此操作，未登录或登录已过期' })).status, 'expired');
  assert.equal(classifyCheckinResponse(429, JSON.stringify({ success: false })).diagnostic, 'rate_limit');
  assert.equal(classifyCheckinResponse(200, '<html>Login</html>').diagnostic, 'non_json');
});

test('DNS and TLS failures keep diagnostics without persisting exception text', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kn10-checkins-'));
  try {
    const service = createCheckinService({ directory, runner: value => sendCheckin(value, { lookup: async () => { throw Object.assign(new Error(account.cookie), { code: 'ENOTFOUND' }); } }) });
    const saved = await service.saveAccount(account);
    await service.startJob({ ids: [saved.id] });
    await service.waitForIdle();
    const snapshot = await service.snapshot();
    assert.equal(snapshot.history[0].diagnostic, 'dns');
    assert.match(snapshot.history[0].message, /解析/);
    assert(!JSON.stringify(snapshot).includes(account.cookie));
    const requester = () => {
      const request = new EventEmitter();
      request.end = () => queueMicrotask(() => { request.emit('error', Object.assign(new Error(account.cookie), { code: 'CERT_HAS_EXPIRED' })); request.emit('close'); });
      return request;
    };
    await assert.rejects(sendCheckin(validateCheckinAccount(account), { lookup: async () => [{ address: '8.8.8.8', family: 4 }], requester }), error => error.diagnostic === 'tls' && !error.message.includes(account.cookie));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('compressed WAF responses do not turn HTTP 200 into success', async () => {
  const requester = (url, options, callback) => {
    assert.equal(options.headers['Accept-Encoding'], 'identity');
    const request = new EventEmitter();
    request.end = () => queueMicrotask(() => {
      const response = new EventEmitter();
      response.statusCode = 200;
      response.headers = { 'content-encoding': 'gzip', 'content-type': 'text/html', 'set-cookie': ['acw_tc=private'] };
      callback(response);
      response.emit('data', gzipSync('<html><script>document.cookie="cdn_sec_tc=private"</script></html>'));
      response.emit('end');
      request.emit('close');
    });
    return request;
  };
  const result = await sendCheckin(validateCheckinAccount(account), { lookup: async () => [{ address: '8.8.8.8', family: 4 }], requester });
  assert.equal(result.status, 'verification');
  assert.equal(result.diagnostic, 'waf');
  assert.equal(result.httpStatus, 200);
  assert(!JSON.stringify(result).includes('private'));
});

test('AnyRouter wrong endpoints are refused before DNS or credential transmission', async () => {
  let lookups = 0;
  let requests = 0;
  const result = await sendCheckin({ ...account, baseUrl: 'https://anyrouter.top', checkinPath: '/api/user/checkin' }, { lookup: async () => { lookups++; return [{ address: '8.8.8.8', family: 4 }]; }, requester: () => { requests++; } });
  assert.equal(result.status, 'unsupported');
  assert.equal(result.diagnostic, 'interface');
  assert.equal(lookups, 0);
  assert.equal(requests, 0);
});

test('existing wrong AnyRouter accounts remain readable but never reach the runner', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kn10-checkins-'));
  try {
    const key = randomBytes(32);
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    const oldAccount = { ...account, id: 'old-anyrouter', baseUrl: 'https://anyrouter.top', checkinPath: '/api/user/checkin', enabled: true };
    const encrypted = Buffer.concat([cipher.update(JSON.stringify({ accounts: [oldAccount], history: [], job: null })), cipher.final()]);
    await writeFile(join(directory, 'vault.key'), key);
    await writeFile(join(directory, 'vault.json'), JSON.stringify({ version: 1, nonce: nonce.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') }));
    let runs = 0;
    const service = createCheckinService({ directory, runner: async () => { runs++; return { status: 'success' }; } });
    assert.equal((await service.snapshot()).accounts[0].checkinPath, '/api/user/checkin');
    await service.startJob({ ids: [oldAccount.id] });
    await service.waitForIdle();
    const snapshot = await service.snapshot();
    assert.equal(runs, 0);
    assert.equal(snapshot.job.status, 'failed');
    assert.equal(snapshot.history[0].diagnostic, 'interface');
    await assert.rejects(service.saveAccount({ protocol: 'legacy', checkinPath: '/api/user/sign_in', cookie: '' }, oldAccount.id));
    await service.saveAccount({ protocol: 'legacy', checkinPath: '/api/user/sign_in', cookie: account.cookie }, oldAccount.id);
    assert.equal((await service.snapshot()).accounts[0].checkinPath, '/api/user/sign_in');
    assert.equal(runs, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('invalid and oversized compressed responses fail safely', async () => {
  for (const payload of [Buffer.from('not gzip'), gzipSync('x'.repeat(262145))]) {
    const requester = (url, options, callback) => {
      const request = new EventEmitter();
      request.end = () => queueMicrotask(() => {
        const response = new EventEmitter();
        response.statusCode = 200;
        response.headers = { 'content-encoding': 'gzip' };
        callback(response);
        response.emit('data', payload);
        response.emit('end');
        request.emit('close');
      });
      return request;
    };
    const result = await sendCheckin(validateCheckinAccount(account), { lookup: async () => [{ address: '8.8.8.8', family: 4 }], requester });
    assert.deepEqual(result, { status: 'error', diagnostic: 'response', httpStatus: 200 });
  }
});

test('outbound checks block private and mapped addresses before any request', async () => {
  for (const address of ['127.0.0.1', '10.1.1.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.1.1', '0.0.0.0', '224.0.0.1', '::1', '::ffff:127.0.0.1', '::ffff:7f00:1', 'fc00::1', 'fe80::1', '2001:db8::1']) assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
  let requests = 0;
  await assert.rejects(sendCheckin(validateCheckinAccount(account), { lookup: async () => [{ address: '127.0.0.1', family: 4 }], requester: () => { requests++; } }));
  assert.equal(requests, 0);
});

test('encrypted store persists across reload without returning plaintext secrets', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kn10-checkins-'));
  try {
    const service = createCheckinService({ directory });
    const saved = await service.saveAccount(account);
    assert(saved.id);
    assert.equal(saved.hasCookie, true);
    assert.equal(saved.cookie, undefined);
    assert.equal(saved.token, undefined);
    for (const name of await readdir(directory)) assert(!String(await readFile(join(directory, name))).includes(account.cookie));
    const reload = createCheckinService({ directory });
    assert.equal((await reload.snapshot()).accounts[0].id, saved.id);
    await reload.saveAccount({ ...saved, name: '新名字', cookie: '' }, saved.id);
    assert.equal((await reload.snapshot()).accounts[0].hasCookie, true);
    await assert.rejects(reload.saveAccount({ ...saved, baseUrl: 'https://another.example', cookie: '' }, saved.id));
    await reload.deleteAccount(saved.id);
    assert.equal((await reload.snapshot()).accounts.length, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('batch jobs track every account and exclude disabled and concurrent execution', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kn10-checkins-'));
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const sent = [];
  try {
    const service = createCheckinService({ directory, runner: async value => { sent.push(value.id); await gate; return { status: value.name === '失败账号' ? 'expired' : 'success', message: '结果', httpStatus: 200 }; } });
    const first = await service.saveAccount(account);
    const second = await service.saveAccount({ ...account, name: '失败账号' });
    await service.saveAccount({ ...account, name: '已停用', enabled: false });
    const job = await service.startJob();
    assert.equal(job.status, 'running');
    await assert.rejects(service.startJob(), /正在执行/);
    await assert.rejects(service.deleteAccount(first.id), /正在执行/);
    release();
    await service.waitForIdle();
    const snapshot = await service.snapshot();
    assert.equal(snapshot.job.status, 'partial');
    assert.deepEqual(sent, [first.id, second.id]);
    assert.equal(snapshot.history.length, 2);
    assert(!JSON.stringify(snapshot).includes(account.cookie));
    sent.length = 0;
    await service.startJob({ mode: 'retry' });
    await service.waitForIdle();
    assert.deepEqual(sent, [second.id]);
  } finally { release?.(); await rm(directory, { recursive: true, force: true }); }
});

test('runner errors never leak secrets into history', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kn10-checkins-'));
  try {
    const service = createCheckinService({ directory, runner: async () => { throw new Error(account.cookie); } });
    const saved = await service.saveAccount(account);
    await service.startJob({ ids: [saved.id] });
    await service.waitForIdle();
    const snapshot = await service.snapshot();
    assert.equal(snapshot.job.status, 'failed');
    assert.equal(snapshot.history[0].status, 'error');
    assert(!JSON.stringify(snapshot).includes(account.cookie));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('outbound calls pin DNS, use site credentials only and never follow redirects', async () => {
  const captured = [];
  const requester = (url, options, callback) => {
    const request = new EventEmitter();
    request.end = body => {
      captured.push({ url: url.toString(), options, body });
      queueMicrotask(() => {
        const response = new EventEmitter();
        response.statusCode = 302;
        response.headers = { location: 'https://another.example' };
        callback(response);
        response.emit('end');
        request.emit('close');
      });
    };
    return request;
  };
  const result = await sendCheckin(validateCheckinAccount(account), { lookup: async () => [{ address: '8.8.8.8', family: 4 }], requester });
  assert.equal(result.status, 'verification');
  assert.equal(captured.length, 1);
  assert.equal(captured[0].url, 'https://site.example/api/user/checkin');
  assert.equal(captured[0].options.method, 'POST');
  assert.equal(captured[0].options.headers.Cookie, account.cookie);
  assert.equal(captured[0].options.headers['New-Api-User'], '42');
  assert.equal(captured[0].options.headers.Authorization, undefined);
  captured[0].options.lookup('site.example', {}, (error, address, family) => { assert.equal(error, null); assert.equal(address, '8.8.8.8'); assert.equal(family, 4); });
  await sendCheckin(validateCheckinAccount({ ...account, authMode: 'bearer', token: 'login-test-token' }), { lookup: async () => [{ address: '8.8.8.8', family: 4 }], requester });
  assert.equal(captured[1].options.headers.Cookie, undefined);
  assert.equal(captured[1].options.headers.Authorization, 'Bearer login-test-token');
});

test('running jobs become unconfirmed after restart without automatic retries', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kn10-checkins-'));
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  try {
    const original = createCheckinService({ directory, runner: async () => { await gate; return { status: 'success' }; } });
    const saved = await original.saveAccount(account);
    await original.startJob({ ids: [saved.id] });
    let automaticRuns = 0;
    const resumed = createCheckinService({ directory, runner: async () => { automaticRuns++; } });
    const snapshot = await resumed.snapshot();
    assert.equal(snapshot.job.status, 'interrupted');
    assert.equal(snapshot.accounts[0].lastResult.status, 'interrupted');
    assert.equal(automaticRuns, 0);
    release();
    await original.waitForIdle();
  } finally { release?.(); await rm(directory, { recursive: true, force: true }); }
});

test('missing or corrupt keys fail closed without replacing vault data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kn10-checkins-'));
  try {
    const original = createCheckinService({ directory });
    await original.saveAccount(account);
    const before = await readFile(join(directory, 'vault.json'));
    await writeFile(join(directory, 'vault.key'), Buffer.alloc(32));
    await assert.rejects(createCheckinService({ directory }).snapshot());
    assert.deepEqual(await readFile(join(directory, 'vault.json')), before);
    await rm(join(directory, 'vault.key'));
    await assert.rejects(createCheckinService({ directory }).snapshot());
    assert.deepEqual(await readFile(join(directory, 'vault.json')), before);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

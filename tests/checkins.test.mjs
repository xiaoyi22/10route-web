import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCheckinService, validateCheckinAccount } from '../scripts/checkin-service.mjs';
import { classifyCheckinResponse, isPublicAddress, sendCheckin } from '../scripts/checkin-client.mjs';

const account = { site: '测试站', name: '账号一', baseUrl: 'https://site.example', protocol: 'newapi', authMode: 'cookie', userId: '42', cookie: 'session=unit-test-private-value' };

test('account validation rejects internal origins, credential forwarding and malformed inputs', () => {
  assert.equal(validateCheckinAccount(account).checkinPath, '/api/user/checkin');
  assert.equal(validateCheckinAccount({ ...account, protocol: 'legacy' }).checkinPath, '/api/user/sign_in');
  for (const baseUrl of ['http://site.example', 'https://localhost', 'https://127.0.0.1', 'https://[::1]', 'https://169.254.169.254', 'https://user:pass@site.example', 'https://site.example/path', 'https://site.example?key=secret']) assert.throws(() => validateCheckinAccount({ ...account, baseUrl }));
  assert.throws(() => validateCheckinAccount({ ...account, cookie: 'session=x\r\nOther: y' }));
  assert.throws(() => validateCheckinAccount({ ...account, checkinPath: '//other.example/api/user/checkin' }));
  assert.throws(() => validateCheckinAccount({ ...account, authMode: 'bearer', token: 'sk-model-api-key' }));
  assert.throws(() => validateCheckinAccount({ ...account, enabled: 'false' }));
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

import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { isIP } from 'node:net';
import { isPublicAddress, sendCheckin } from './checkin-client.mjs';

export class CheckinError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const reject = message => { throw new CheckinError(message); };
const text = (value, label, limit = 100) => {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || /[\u0000-\u001f\u007f]/.test(value)) reject(label + '格式无效');
  return value.trim();
};

export function validateCheckinAccount(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) reject('账号配置格式无效');
  const site = text(input.site, '站点名称');
  const name = text(input.name, '账号名称');
  let url;
  try { url = new URL(input.baseUrl); } catch { reject('站点地址无效'); }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.port && url.port !== '443' || !hostname.includes('.') && !isIP(hostname) || /(?:^|\.)(localhost|local|internal|lan|home|test|invalid)$/.test(hostname) || isIP(hostname) && !isPublicAddress(hostname)) reject('站点须为不含凭据的公网 HTTPS 地址，不能使用内网或非标准端口');
  if (!['newapi', 'legacy'].includes(input.protocol)) reject('请选择签到协议');
  const checkinPath = input.checkinPath || (input.protocol === 'newapi' ? '/api/user/checkin' : '/api/user/sign_in');
  if (typeof checkinPath !== 'string' || !/^\/api\/user\/[a-zA-Z0-9_/-]{1,100}$/.test(checkinPath) || checkinPath.includes('//') || checkinPath.includes('..')) reject('签到路径须为 /api/user/ 下的接口，不含域名或查询参数');
  if (!['cookie', 'bearer'].includes(input.authMode)) reject('请选择登录凭据类型');
  const userId = input.userId || '';
  if (typeof userId !== 'string' || userId && !/^\d{1,20}$/.test(userId) || input.authMode === 'cookie' && !userId) reject('Cookie 登录需要数字用户 ID');
  const credential = text(input.authMode === 'cookie' ? input.cookie : input.token, '登录凭据', 16384);
  if (input.authMode === 'bearer' && (/^sk-/i.test(credential) || /\s/.test(credential) || /^Bearer\s/i.test(credential))) reject('请填写网站登录令牌，不是模型 sk- Key，也不要包含 Bearer 前缀');
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') reject('启停状态无效');
  return { site, name, baseUrl: url.origin, protocol: input.protocol, checkinPath, authMode: input.authMode, userId, enabled: input.enabled !== false, ...(input.authMode === 'cookie' ? { cookie: credential } : { token: credential }) };
}

function publicAccount(value) {
  const { cookie, token, ...safe } = value;
  return { ...safe, hasCookie: !!cookie, hasToken: !!token };
}

export function createCheckinService({ directory, runner = sendCheckin }) {
  if (!directory) throw new Error('Checkin directory required');
  let state;
  let key;
  let initializing;
  let queue = Promise.resolve();
  let running;
  const storePath = join(directory, 'vault.json');
  const keyPath = join(directory, 'vault.key');
  async function persist(next) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(next), 'utf8'), cipher.final()]);
    const payload = JSON.stringify({ version: 1, nonce: nonce.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') });
    const temporary = storePath + '.' + randomUUID() + '.tmp';
    await writeFile(temporary, payload, { mode: 0o600, flag: 'wx' });
    await rename(temporary, storePath);
    await chmod(storePath, 0o600);
    state = next;
  }
  async function initialize() {
    if (state) return;
    initializing ||= (async () => {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await chmod(directory, 0o700);
      let saved;
      try { saved = JSON.parse(await readFile(storePath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      try { key = await readFile(keyPath); } catch (error) {
        if (error.code !== 'ENOENT' || saved) throw error;
        try { await writeFile(keyPath, randomBytes(32), { mode: 0o600, flag: 'wx' }); } catch (failure) { if (failure.code !== 'EEXIST') throw failure; }
        key = await readFile(keyPath);
      }
      if (key.length !== 32) throw new Error('Invalid encryption key');
      if (saved) {
        if (saved.version !== 1) throw new Error('Invalid vault version');
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(saved.nonce, 'base64'));
        decipher.setAuthTag(Buffer.from(saved.tag, 'base64'));
        state = JSON.parse(Buffer.concat([decipher.update(Buffer.from(saved.data, 'base64')), decipher.final()]).toString('utf8'));
        if (!Array.isArray(state.accounts) || !Array.isArray(state.history)) throw new Error('Invalid vault');
        if (state.job?.status === 'running') {
          for (const id of state.job.ids.filter(id => !state.job.completed.includes(id))) {
            const account = state.accounts.find(account => account.id === id);
            if (!account) continue;
            const result = { id: randomUUID(), jobId: state.job.id, accountId: id, site: account.site, name: account.name, status: 'interrupted', message: '服务重启，签到结果未确认；请先到站点核对', timestamp: new Date().toISOString() };
            account.lastResult = result;
            state.history.unshift(result);
          }
          state.job.status = 'interrupted';
          state.job.finishedAt = new Date().toISOString();
          state.history = state.history.slice(0, 500);
          await persist(state);
        }
      } else state = { accounts: [], history: [], job: null };
    })();
    await initializing;
  }
  const transact = operation => {
    const task = queue.then(async () => { await initialize(); return operation(); });
    queue = task.catch(() => {});
    return task;
  };
  const idle = () => { if (state.job?.status === 'running') throw new CheckinError('签到任务正在执行，请稍后操作', 409); };
  const safeResult = outcome => {
    const status = ['success', 'already', 'expired', 'verification', 'unsupported', 'error'].includes(outcome?.status) ? outcome.status : 'error';
    const messages = { success: '签到成功', already: '今日已签到', expired: '登录已过期，请更新凭据', verification: '需要到站点完成人工验证', unsupported: '签到未启用或接口不兼容', error: '请求未成功，请检查网络、接口及凭据' };
    return { status, message: messages[status], ...(Number.isInteger(outcome?.httpStatus) && outcome.httpStatus >= 100 && outcome.httpStatus <= 599 ? { httpStatus: outcome.httpStatus } : {}), ...(status === 'success' && typeof outcome?.reward === 'number' && Number.isFinite(outcome.reward) && outcome.reward >= 0 ? { reward: outcome.reward } : {}) };
  };
  async function execute(job, accounts) {
    for (const account of accounts) {
      let outcome;
      try { outcome = safeResult(await runner(account)); } catch { outcome = safeResult(null); }
      await transact(async () => {
        const next = structuredClone(state);
        const result = { ...outcome, id: randomUUID(), jobId: job.id, accountId: account.id, site: account.site, name: account.name, timestamp: new Date().toISOString() };
        next.accounts.find(value => value.id === account.id).lastResult = result;
        next.history.unshift(result);
        next.history = next.history.slice(0, 500);
        next.job.completed.push(account.id);
        if (['success', 'already'].includes(outcome.status)) next.job.successes++;
        else next.job.failures++;
        await persist(next);
      });
    }
    await transact(async () => {
      const next = structuredClone(state);
      next.job.status = next.job.failures ? next.job.successes ? 'partial' : 'failed' : 'success';
      next.job.finishedAt = new Date().toISOString();
      await persist(next);
    });
  }
  return {
    snapshot: () => transact(() => structuredClone({ accounts: state.accounts.map(publicAccount), history: state.history, job: state.job })),
    saveAccount: (input, id) => transact(async () => {
      idle();
      const existing = id ? state.accounts.find(account => account.id === id) : null;
      if (id && !existing) throw new CheckinError('账号不存在', 404);
      if (!id && state.accounts.length >= 100) reject('最多配置 100 个签到账号');
      const merged = { ...existing, ...input };
      const credential = merged.authMode === 'cookie' ? 'cookie' : 'token';
      if (existing && !input[credential]) {
        if (input.baseUrl !== undefined && new URL(input.baseUrl).origin !== existing.baseUrl || merged.authMode !== existing.authMode || merged.checkinPath !== existing.checkinPath || merged.protocol !== existing.protocol || merged.userId !== existing.userId) reject('更换站点、接口或身份时须重新填写凭据');
        merged[credential] = existing[credential];
      }
      const value = { ...validateCheckinAccount(merged), id: existing?.id || randomUUID(), ...(existing?.lastResult ? { lastResult: existing.lastResult } : {}) };
      const next = structuredClone(state);
      if (existing) next.accounts[next.accounts.findIndex(account => account.id === id)] = value;
      else next.accounts.push(value);
      await persist(next);
      return publicAccount(value);
    }),
    deleteAccount: id => transact(async () => {
      idle();
      if (!state.accounts.some(account => account.id === id)) throw new CheckinError('账号不存在', 404);
      const next = structuredClone(state);
      next.accounts = next.accounts.filter(account => account.id !== id);
      next.history = next.history.filter(result => result.accountId !== id);
      await persist(next);
    }),
    startJob: (options = {}) => transact(async () => {
      idle();
      if (options.ids !== undefined && (!Array.isArray(options.ids) || !options.ids.length || options.ids.some(id => typeof id !== 'string' || !state.accounts.some(account => account.id === id)))) reject('请选择有效签到账号');
      if (options.mode !== undefined && options.mode !== 'retry') reject('任务类型无效');
      const selected = state.accounts.filter(account => account.enabled && (!options.ids || options.ids.includes(account.id)) && (options.mode !== 'retry' || ['error', 'expired', 'verification', 'unsupported', 'interrupted'].includes(account.lastResult?.status)));
      if (!selected.length) reject('没有可执行的签到账号');
      const job = { id: randomUUID(), status: 'running', ids: selected.map(account => account.id), completed: [], successes: 0, failures: 0, startedAt: new Date().toISOString() };
      const next = structuredClone(state);
      next.job = job;
      await persist(next);
      running = execute(structuredClone(job), structuredClone(selected)).catch(async () => {
        await transact(async () => {
          const failed = structuredClone(state);
          failed.job.status = 'interrupted';
          failed.job.finishedAt = new Date().toISOString();
          await persist(failed);
        }).catch(() => {});
      });
      return structuredClone(job);
    }),
    waitForIdle: async () => { await running; },
  };
}

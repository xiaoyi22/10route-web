import https from 'node:https';
import { lookup as resolveAddress } from 'node:dns/promises';
import { isIP } from 'node:net';

export function isPublicAddress(address) {
  if (isIP(address) === 4) {
    const [first, second, third] = address.split('.').map(Number);
    return !(first === 0 || first === 10 || first === 127 || first >= 224 || first === 169 && second === 254 || first === 172 && second >= 16 && second <= 31 || first === 192 && (second === 168 || second === 0 || second === 2) || first === 100 && second >= 64 && second <= 127 || first === 198 && (second === 18 || second === 19 || second === 51 && third === 100) || first === 203 && second === 0 && third === 113);
  }
  if (isIP(address) !== 6) return false;
  const prefix = parseInt(address.split(':')[0], 16);
  return prefix >= 0x2000 && prefix <= 0x3fff && !/^2001:(?:0*[0-1]?[0-9a-f]{1,2}|db8):/i.test(address) && !/^2002:/i.test(address) && !/^3fff:/i.test(address);
}

export function classifyCheckinResponse(httpStatus, text) {
  let body;
  try { body = JSON.parse(text); } catch {}
  const message = typeof body?.message === 'string' ? body.message : '';
  if (/turnstile|captcha|cloudflare|验证码|人机验证|challenge/i.test(text) || httpStatus >= 300 && httpStatus < 400) return { status: 'verification', message: '需要到站点完成人工验证' };
  if (httpStatus === 401 || /登录已过期|未登录|登录失效|invalid.*token|unauthorized/i.test(message)) return { status: 'expired', message: '登录凭据已过期，请重新登录并更新凭据' };
  if (httpStatus === 404 || /签到.*(?:未启用|未开启|关闭)|check.?in.*disabled/i.test(message)) return { status: 'unsupported', message: '站点未开启签到或接口不兼容' };
  if (httpStatus < 200 || httpStatus >= 300) return { status: 'error', message: httpStatus === 429 ? '站点限流，请稍后手动重试' : '签到接口返回错误，请检查站点权限和配置' };
  if (!body || typeof body !== 'object') return { status: 'verification', message: '接口未返回 JSON，请到站点检查登录或验证状态' };
  if (body.success === true) {
    const reward = body.data?.quota_awarded;
    return { status: 'success', message: '签到成功', ...(typeof reward === 'number' && Number.isFinite(reward) && reward >= 0 ? { reward } : {}) };
  }
  if (/已签到|重复签到|already.*(?:check|sign)|(?:check|sign).*already/i.test(message)) return { status: 'already', message: '今日已签到' };
  return { status: 'error', message: '站点未确认签到成功，请检查接口或登录凭据' };
}

export async function sendCheckin(account, { lookup = resolveAddress, requester = https.request } = {}) {
  const url = new URL(account.baseUrl + account.checkinPath);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  let dnsTimer;
  let addresses;
  try {
    addresses = await Promise.race([lookup(hostname, { all: true, verbatim: true }), new Promise((resolve, reject) => { dnsTimer = setTimeout(() => reject(new Error('DNS timeout')), 5000); })]);
  } finally { clearTimeout(dnsTimer); }
  if (!addresses.length || addresses.some(value => !isPublicAddress(value.address))) throw new Error('Unsafe checkin address');
  const selected = addresses[0];
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'KN10-Checkin/1.0', 'Content-Length': '2' };
  if (account.userId) headers['New-Api-User'] = account.userId;
  if (account.authMode === 'cookie') headers.Cookie = account.cookie;
  else headers.Authorization = 'Bearer ' + account.token;
  return new Promise((resolve, reject) => {
    const request = requester(url, { method: 'POST', headers, agent: false, lookup: (name, options, callback) => {
      if (options.all) callback(null, [selected]);
      else callback(null, selected.address, selected.family);
    } }, response => {
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 262144) request.destroy(new Error('Response too large'));
        else chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve({ ...classifyCheckinResponse(response.statusCode, Buffer.concat(chunks).toString('utf8')), httpStatus: response.statusCode }));
    });
    const timer = setTimeout(() => request.destroy(new Error('Checkin timeout')), 20000);
    request.on('close', () => clearTimeout(timer));
    request.on('error', reject);
    request.end('{}');
  });
}

import https from 'node:https';
import http from 'node:http';
import tls from 'node:tls';
import { lookup as resolveAddress } from 'node:dns/promises';
import { isIP } from 'node:net';
import { gunzipSync, inflateSync, brotliDecompressSync } from 'node:zlib';
import { getCheckinConfigurationIssue } from '../src/api/checkin-sites.js';

export class CheckinRequestError extends Error {
  constructor(message, diagnostic) { super(message); this.diagnostic = diagnostic; }
}

function requestFailure(error, diagnostic) {
  if (error instanceof CheckinRequestError) return error;
  if (/^(?:ERR_TLS_|ERR_SSL_)|^(?:CERT_HAS_EXPIRED|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT_LOCALLY)$/.test(error?.code || '')) diagnostic = 'tls';
  else if (error?.code === 'ETIMEDOUT') diagnostic = 'timeout';
  return new CheckinRequestError('签到网络请求失败', diagnostic);
}

export function isPublicAddress(address) {
  if (isIP(address) === 4) {
    const [first, second, third] = address.split('.').map(Number);
    return !(first === 0 || first === 10 || first === 127 || first >= 224 || first === 169 && second === 254 || first === 172 && second >= 16 && second <= 31 || first === 192 && (second === 168 || second === 0 || second === 2) || first === 100 && second >= 64 && second <= 127 || first === 198 && (second === 18 || second === 19 || second === 51 && third === 100) || first === 203 && second === 0 && third === 113);
  }
  if (isIP(address) !== 6) return false;
  const prefix = parseInt(address.split(':')[0], 16);
  return prefix >= 0x2000 && prefix <= 0x3fff && !/^2001:(?:0*[0-1]?[0-9a-f]{1,2}|db8):/i.test(address) && !/^2002:/i.test(address) && !/^3fff:/i.test(address);
}

export function classifyCheckinResponse(httpStatus, text, headers = {}) {
  let body;
  try { body = JSON.parse(text); } catch {}
  const message = typeof body?.message === 'string' ? body.message : '';
  const cookies = headers['set-cookie'] || [];
  const wafCookies = (Array.isArray(cookies) ? cookies : [cookies]).some(cookie => /^(?:acw_tc|cdn_sec_tc|acw_sc__v2)=/i.test(cookie));
  if (/turnstile|captcha|cloudflare|验证码|人机验证|challenge/i.test(text) || !body && (wafCookies || /acw_sc__v2|aliyunwaf|document\.cookie/i.test(text))) return { status: 'verification', diagnostic: 'waf', message: '站点防护要求人工验证，请到原站验证后更新完整 Cookie' };
  if (httpStatus >= 300 && httpStatus < 400) return { status: 'verification', message: '需要到站点完成人工验证' };
  if (httpStatus === 401 || /登录已过期|未登录|登录失效|invalid.*token|unauthorized/i.test(message)) return { status: 'expired', message: '登录凭据已过期，请重新登录并更新凭据' };
  if (httpStatus === 404 || /签到.*(?:未启用|未开启|关闭)|check.?in.*disabled/i.test(message)) return { status: 'unsupported', message: '站点未开启签到或接口不兼容' };
  if (httpStatus < 200 || httpStatus >= 300) return { status: 'error', ...(httpStatus === 429 ? { diagnostic: 'rate_limit' } : {}), message: httpStatus === 429 ? '站点限流，请稍后手动重试' : '签到接口返回错误，请检查站点权限和配置' };
  if (!body || typeof body !== 'object') return { status: 'verification', diagnostic: 'non_json', message: '接口未返回 JSON，请到站点检查登录或验证状态' };
  if (body.success === true) {
    const reward = body.data?.quota_awarded;
    return { status: 'success', message: '签到成功', ...(typeof reward === 'number' && Number.isFinite(reward) && reward >= 0 ? { reward } : {}) };
  }
  if (/已签到|重复签到|already.*(?:check|sign)|(?:check|sign).*already/i.test(message)) return { status: 'already', message: '今日已签到' };
  return { status: 'error', message: '站点未确认签到成功，请检查接口或登录凭据' };
}

export function createCheckinProxyAgent(proxyUrl, { address, requester = http.request, connector = tls.connect } = {}) {
  const proxy = new URL(proxyUrl);
  if (proxy.protocol !== 'http:' || proxy.username || proxy.password || proxy.pathname !== '/' || proxy.search || proxy.hash) throw new Error('Invalid checkin HTTP proxy origin');
  if (address && !isPublicAddress(address)) throw new Error('Unsafe checkin address');
  const agent = new https.Agent({ keepAlive: false, maxCachedSessions: 0 });
  agent.createConnection = (options, callback) => {
    const hostname = (options.servername || options.host).replace(/^\[|\]$/g, '');
    const target = address || hostname;
    const authority = (isIP(target) === 6 ? '[' + target + ']' : target) + ':443';
    let tunnel;
    let secure;
    let completed = false;
    const connection = requester({ hostname: proxy.hostname.replace(/^\[|\]$/g, ''), port: proxy.port || '80', method: 'CONNECT', path: authority, headers: { Host: authority }, agent: false });
    const finish = (error, socket) => {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      if (error) { secure?.destroy(); tunnel?.destroy(); connection.destroy(); }
      callback(error ? requestFailure(error, 'proxy') : null, socket);
    };
    const timer = setTimeout(() => finish(new CheckinRequestError('Checkin proxy CONNECT timeout', 'timeout')), 5000);
    connection.once('error', error => finish(error));
    connection.once('connect', (response, socket, head) => {
      tunnel = socket;
      if (completed) return socket.destroy();
      if (response.statusCode !== 200 || head.length) return finish(new Error('Checkin proxy CONNECT rejected'));
      try {
        secure = connector({ ...options, socket, servername: isIP(hostname) ? undefined : hostname, rejectUnauthorized: true });
        secure.once('error', error => finish(requestFailure(error, 'tls')));
        secure.once('secureConnect', () => finish(null, secure));
      } catch (error) { finish(requestFailure(error, 'tls')); }
    });
    connection.end();
  };
  return agent;
}

export async function lookupCheckinViaProxy(hostname, proxyUrl, { requester = https.request } = {}) {
  if (isIP(hostname)) return [{ address: hostname, family: isIP(hostname) }];
  const addresses = [];
  for (const [type, family] of [['A', 4], ['AAAA', 6]]) {
    const url = new URL('https://cloudflare-dns.com/dns-query');
    url.searchParams.set('name', hostname);
    url.searchParams.set('type', type);
    const agent = createCheckinProxyAgent(proxyUrl);
    try {
      const result = await new Promise((resolve, reject) => {
        const request = requester(url, { method: 'GET', headers: { Accept: 'application/dns-json' }, agent }, response => {
          const chunks = [];
          let size = 0;
          response.on('data', chunk => {
            size += chunk.length;
            if (size > 65536) request.destroy(new Error('Checkin DNS response too large'));
            else chunks.push(chunk);
          });
          response.on('error', reject);
          response.on('aborted', () => reject(new Error('Checkin DNS response interrupted')));
          response.on('end', () => {
            try {
              const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
              if (response.statusCode !== 200 || data.Status !== 0 || data.TC === true || data.Answer !== undefined && !Array.isArray(data.Answer)) throw new Error('Invalid checkin DNS response');
              resolve(data.Answer || []);
            } catch { reject(new Error('Invalid checkin DNS response')); }
          });
        });
        const timer = setTimeout(() => request.destroy(new CheckinRequestError('Checkin DNS timeout', 'timeout')), 5000);
        request.on('close', () => clearTimeout(timer));
        request.on('error', reject);
        request.end();
      });
      for (const answer of result.filter(answer => answer.type === (family === 4 ? 1 : 28))) {
        if (isIP(answer.data) !== family || !isPublicAddress(answer.data)) throw new CheckinRequestError('Unsafe checkin address', 'unsafe_address');
        addresses.push({ address: answer.data, family });
      }
    } finally { agent.destroy(); }
  }
  if (!addresses.length) throw new Error('No checkin DNS addresses');
  return addresses;
}

export function rotateCookieValue(cookie, name, value) {
  if (!name || !value) return cookie;
  const parts = String(cookie).split(/;\s*/);
  let replaced = false;
  const next = parts.map(part => {
    const separator = part.indexOf('=');
    if (separator > 0 && part.slice(0, separator).trim() === name) { replaced = true; return name + '=' + value; }
    return part;
  });
  if (!replaced) next.push(name + '=' + value);
  return next.join('; ');
}

function refreshPatchFromHeaders(headers) {
  const cookies = headers?.['set-cookie'] || [];
  const patch = [];
  for (const line of Array.isArray(cookies) ? cookies : [cookies]) {
    const match = /^(new_api_refresh|new_api_has_session)=([^;]*)/.exec(String(line));
    if (match && match[2]) patch.push({ name: match[1], value: match[2] });
  }
  return patch;
}

async function requestCheckin(requester, url, { headers, agent, lookup }) {
  return new Promise((resolve, reject) => {
    const request = requester(url, { method: 'POST', headers, agent, lookup: (name, options, callback) => {
      if (options.all) callback(null, lookup);
      else callback(null, lookup[0].address, lookup[0].family);
    } }, response => {
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 262144) request.destroy(new CheckinRequestError('Response too large', 'response'));
        else chunks.push(chunk);
      });
      response.on('error', error => reject(requestFailure(error, 'response')));
      response.on('aborted', () => reject(new CheckinRequestError('Response interrupted', 'response')));
      response.on('end', () => {
        try {
          let buffer = Buffer.concat(chunks);
          const encoding = response.headers?.['content-encoding'];
          if (encoding === 'gzip') buffer = gunzipSync(buffer, { maxOutputLength: 262144 });
          else if (encoding === 'deflate') buffer = inflateSync(buffer, { maxOutputLength: 262144 });
          else if (encoding === 'br') buffer = brotliDecompressSync(buffer, { maxOutputLength: 262144 });
          else if (encoding && encoding !== 'identity') throw new Error('Unsupported response encoding');
          resolve({ statusCode: response.statusCode, text: buffer.toString('utf8'), headers: response.headers });
        } catch { resolve({ statusCode: response.statusCode, diagnostic: 'response' }); }
      });
    });
    const timer = setTimeout(() => request.destroy(new CheckinRequestError('Checkin timeout', 'timeout')), 20000);
    request.on('close', () => clearTimeout(timer));
    request.on('error', reject);
    request.end('{}');
  });
}

export async function sendCheckin(account, { proxyUrl, lookup = proxyUrl ? hostname => lookupCheckinViaProxy(hostname, proxyUrl) : resolveAddress, requester = https.request } = {}) {
  const issue = getCheckinConfigurationIssue(account);
  if (issue) return { status: 'unsupported', diagnostic: 'interface', message: issue };
  const url = new URL(account.baseUrl + account.checkinPath);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  let dnsTimer;
  let addresses;
  try {
    addresses = await Promise.race([lookup(hostname, { all: true, verbatim: true }), new Promise((resolve, reject) => { dnsTimer = setTimeout(() => reject(new CheckinRequestError('DNS timeout', 'timeout')), proxyUrl ? 10000 : 5000); })]);
  } catch (error) { throw requestFailure(error, 'dns'); }
  finally { clearTimeout(dnsTimer); }
  if (!addresses.length || addresses.some(value => !isPublicAddress(value.address))) throw new CheckinRequestError('Unsafe checkin address', 'unsafe_address');
  const selected = addresses[0];
  const agent = proxyUrl ? createCheckinProxyAgent(proxyUrl, { address: selected.address }) : false;
  const headers = { Accept: 'application/json', 'Accept-Encoding': 'identity', 'Content-Type': 'application/json', 'User-Agent': 'KN10-Checkin/1.0', 'Content-Length': '2' };
  if (account.userId) headers['New-Api-User'] = account.userId;
  if (account.authMode === 'cookie') headers.Cookie = account.cookie;
  else if (account.authMode === 'bearer') headers.Authorization = 'Bearer ' + account.token;
  let credentialPatch;
  try {
    if (account.authMode === 'refresh') {
      const refreshHeaders = { ...headers };
      delete refreshHeaders.Authorization;
      refreshHeaders.Cookie = account.cookie;
      const sid = /(?:^|;)\s*new_api_refresh=([^.;]+)/.exec(account.cookie)?.[1];
      if (sid) refreshHeaders['X-Auth-Session'] = sid;
      const refreshed = await requestCheckin(requester, new URL(account.baseUrl + '/api/user/auth/refresh'), { headers: refreshHeaders, agent, lookup: [selected] });
      let bundle;
      try { bundle = JSON.parse(refreshed.text); } catch {}
      const accessToken = bundle?.success === true ? bundle?.data?.access_token : undefined;
      if (typeof accessToken !== 'string' || !accessToken || accessToken.length > 16384 || /[\s]/.test(accessToken)) return { ...classifyCheckinResponse(refreshed.statusCode, refreshed.text ?? '', refreshed.headers), httpStatus: refreshed.statusCode };
      credentialPatch = refreshPatchFromHeaders(refreshed.headers);
      headers.Authorization = 'Bearer ' + accessToken;
      delete headers.Cookie;
    }
    const response = await requestCheckin(requester, url, { headers, agent, lookup: [selected] });
    if (response.diagnostic) return { status: 'error', diagnostic: response.diagnostic, httpStatus: response.statusCode };
    return { ...classifyCheckinResponse(response.statusCode, response.text, response.headers), httpStatus: response.statusCode, ...(credentialPatch?.length ? { credentialPatch } : {}) };
  } catch (error) { throw requestFailure(error, 'network'); }
  finally { if (agent) agent.destroy(); }
}

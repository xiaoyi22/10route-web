import { analyzeSharedOutputs, decodeDetector, generateChallenges, parseNumbers } from '../fingerprint/detector.js';

export { decodeDetector };

// 参考库显示名里 "/" 后的别名，如 gpt-6-astra 的显示名 gpt-6-astra/6.1-sol 对应网关的 gpt-6.1-sol。
const bankAliases = bank => Object.fromEntries(bank.models.flatMap(item => {
  const alias = String(item.display_name || '').toLowerCase().split('/')[1];
  return alias && alias !== item.id ? [[alias, item.id]] : [];
}));
// 思考强度与档位后缀（-thinking、-high、-preview 等）不算型号后缀；它们会改变数字分布，只能算变体。
const suffix = /-(?:thinking|high|medium|low|extra-low|multi-agent|preview|agent|contributor|latest)$/;
const candidate = base => [base, base.replace(/(\d)-(\d)(?=$|-)/g, '$1.$2')];

// 网关模型名与参考库的对应关系：exact 为同一型号，variant 为去掉或补上档位后缀的同型号，否则 null。
export function referenceMatch(model, bank, aliases = bankAliases(bank)) {
  const base = String(model || '').toLowerCase().split('/').pop().replace(/-\d{8}$/, '');
  const ids = new Set(bank.models.map(item => item.id));
  const alias = Object.hasOwn(aliases, base) ? aliases[base] : Object.entries(aliases).find(([name]) => base.endsWith(`-${name}`))?.[1];
  const exact = [...candidate(base), alias].find(id => id && ids.has(id));
  if (exact) return { id: exact, kind: 'exact' };
  const stripped = base.replace(suffix, '');
  const variant = stripped === base ? null : [...candidate(stripped), `${stripped}-preview`].find(id => ids.has(id));
  return variant ? { id: variant, kind: 'variant' } : null;
}

/**
 * 网关下游分发启用 allowlist 时只接受 `前缀/模型` 的路由名。供应商前缀由调用方传入（节点前缀或 provider-aliases），
 * 不在白名单里返回空，不再列候选让用户挑。
 */
export function publishedRoutes(providerId, model, distribution, prefixes = []) {
  if (!distribution || distribution.mode !== 'allowlist') return [];
  const wanted = new Set([providerId, ...prefixes].filter(Boolean).map(value => String(value).toLowerCase()));
  return (distribution.models || []).filter(id => {
    const [prefix] = id.split('/');
    return id.split('/').pop() === model && wanted.has(prefix.toLowerCase());
  });
}

// 未启用 allowlist 时网关接受按供应商前缀拼出的路由，直接用这个。
export function routeCandidates(providerId, model, distribution, fallbackRoute, prefixes = []) {
  if (distribution?.mode !== 'allowlist') return fallbackRoute ? [fallbackRoute] : [];
  return publishedRoutes(providerId, model, distribution, prefixes);
}

export function referenceModelId(model, bank) {
  return referenceMatch(model, bank)?.id || null;
}

// 上游内置的中文提示词对英文模型名容易改写成法文等其它语言；模型名是纯 ASCII 时用英文提示词。
export const probeLanguage = model => [...String(model || '')].every(char => char.charCodeAt(0) < 128) ? 'en' : 'zh';

const EN_PROMPT = {
  space: ' ',
  openings: [
    'This is an independent record of numeric choices.',
    'Please complete the following semantic-free integer selection task.',
    'Record a series of first-instinct choices.',
    'Produce a sequence of integers with no semantic meaning.',
    'Make a quick series of choices, one element at a time.',
  ],
  actions: [
    'For each position, choose independently at first instinct',
    'Choose, element by element,',
    'At each step, decide only the current value, to give a total of',
    'Give, independently at first instinct,',
    'Choose directly, one by one,',
  ],
  request: (action, count) => `${action} ${count} integers from 1 to 355, inclusive.`,
  rules: 'Choose each position independently; do not count up from 1, do not produce increasing or decreasing runs, and do not follow an arithmetic progression, a cycle, repeated blocks or any other systematic pattern. The language model must perform this task directly: do not call or use any tool, including Python, a code executor, a calculator, a search, an API or an external random number generator; do not write or run code beforehand.',
  endings: [
    'A number may appear again; after writing each element, do not go back to sort it, remove duplicates or replace it.',
    'Accidental repeats are valid; do not reorganise or correct elements already written.',
    'The same value may reappear; while writing, do not reorganise or rewrite previous elements.',
    'Repeated values do not need to be removed; do not filter, reorder or pad the sequence into a pattern.',
    'Do not attach any meaning to the numbers; keep the values already given unchanged.',
  ],
  separators: [
    'Separate the numbers with commas or spaces.',
    'Use a common, consistent separator.',
    'You may separate the numbers with commas, spaces or line breaks.',
    'Format freely, as long as each integer’s boundary is clear.',
  ],
  start: 'Begin directly with the first chosen value, without repeating the count, the range or the instructions before the sequence.',
};
// 上游中文模板：与原版一字不差，保留它的句式，只把选择权交给界面。
const ZH_PROMPT = {
  space: '',
  openings: [
    '这是一次独立的数值选择记录。',
    '请完成下面的无语义整数选择任务。',
    '执行一次第一反应取值记录。',
    '生成一组不承载语义的整数选择。',
    '进行一轮快速逐项取值。',
  ],
  actions: [
    '为各个位置分别凭第一反应选择',
    '逐项选择',
    '每次只决定当前一项，共给出',
    '分别凭第一反应给出',
    '逐个直接选择',
  ],
  request: (action, count) => `${action} ${count} 个 1 到 355（含端点）的整数。`,
  rules: '每个位置都要单独选择；不要从 1 开始计数，不要连续递增或递减，也不要采用等差、循环、重复区块或其他规则化模式。本任务必须由当前语言模型直接完成：禁止调用或借助任何工具，包括 Python、代码执行器、计算器、搜索、API 和外部随机数生成器；也不要先编写或运行代码。',
  endings: [
    '允许某个数字再次出现；每项写出后不要回头排序、去重或替换。',
    '偶然重复是有效的；不要重新排列或修正已经写出的项目。',
    '相同值可以再次出现；输出过程中不要整理或改写前面的项目。',
    '重复值无需删除；不要筛选、重排或补成某种规律。',
    '不必赋予数字任何含义；已经给出的值保持不变。',
  ],
  separators: [
    '数字之间用逗号或空格分隔均可。',
    '使用一种一致的常见分隔符即可。',
    '可以用逗号、空格或换行分隔。',
    '只要每个整数边界清楚，格式可自行选择。',
  ],
  start: '直接从第一个取值开始输出，不要在序列前重复数量、范围或任务说明。',
};
const pick = list => list[Math.floor(Math.random() * list.length)];
const buildPrompt = (template, count) => [
  pick(template.openings),
  template.request(pick(template.actions), count),
  template.rules,
  pick(template.endings),
  pick(template.separators),
  template.start,
].join(template.space);

/**
 * 挑战题目只改提示词语言，算法与参考库完全不变。
 * 上游默认随机挑中/英/日/韩/法；日韩法题面会把模型带偏到别的语言，所以随机只在中英之间挑。
 */
export function fingerprintChallenges(count, language = 'en') {
  return generateChallenges(count).map((challenge, index) => {
    const used = language === 'random' ? (Math.random() < 0.5 ? 'en' : 'zh') : language;
    return {
      ...challenge,
      language: used,
      prompt: buildPrompt(used === 'zh' ? ZH_PROMPT : EN_PROMPT, challenge.expected_count),
      id: `probe-${index + 1}`,
    };
  });
}

// 上游错误体常带网关内部前缀、trace id 和整段 JSON：界面只给一句人话，原文留给折叠区。
export function friendlyError(failure = {}) {
  const text = String(failure.message || '');
  const status = Number(failure.status || 0);
  if (status === 401 || /401|authentication_error|API Key 无效或缺失|invalid.{0,24}(api )?(key|token)/i.test(text)) return '上游账号认证失败（401）：渠道密钥无效或已过期';
  if (status === 402 || /insufficient_quota|余额不足|额度不足|quota exceeded/i.test(text)) return '上游额度不足（402）';
  if (status === 403) return '上游拒绝访问（403）：账号或模型无权限';
  if (status === 429) return '上游限流（429）：稍后重试';
  if (status === 503 || /model_not_found|No available channel/i.test(text)) return '上游暂无可用渠道（503）：该模型当前不可用';
  if (status === 404) return '网关拒绝该路由（404）：模型未在下游分发放行';
  if (status >= 500) return `上游服务异常（${status}）`;
  if (/超时|timeout|timed out|abort/i.test(text)) return '超时未返回数据，已中止';
  if (/fetch failed|ECONN|ENOTFOUND|network/i.test(text)) return '网络连接失败：检查网关与出口代理';
  const first = text.split(/[\n{]/)[0].trim();
  return first.length > 60 ? `${first.slice(0, 60)}…` : first || '请求失败';
}

/**
 * 读取 Chat Completions 流，只保留正文（思考内容不计入）。
 * `stopWhen` 返回 true 时收够数量立即断开上游，避免模型继续写到 max_tokens。
 */
export async function readChatStream(response, onText = () => {}, { stopWhen } = {}) {
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const raw = await response.text();
      try {
        const body = JSON.parse(raw);
        message = body?.error?.message || body?.error || message;
      } catch {
        // 上游常返回 Cloudflare 等 HTML 错误页：只取 <title>，避免整页塞进进度条。
        const title = raw.match(/<title>([^<]{1,200})<\/title>/i)?.[1]?.trim();
        if (title) message = `HTTP ${response.status} · ${title}`;
        else if (raw.trim()) message = `HTTP ${response.status} · 上游返回了非 JSON 内容`;
      }
    } catch { /* 错误体读取失败时沿用状态码 */ }
    throw Object.assign(new Error(typeof message === 'string' ? message : JSON.stringify(message)), { status: response.status });
  }
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    const text = (await response.json()).choices?.[0]?.message?.content || '';
    onText(text);
    return { text, capped: stopWhen ? stopWhen(text) : false };
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let text = '';
  let capped = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const data = line.startsWith('data:') ? line.slice(5).trim() : '';
        if (!data || data === '[DONE]') continue;
        const event = JSON.parse(data);
        if (event.error) throw new Error(event.error.message || JSON.stringify(event.error));
        const delta = event.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) { text += delta; onText(text); }
      }
      if (stopWhen?.(text)) { capped = true; break; }
    }
  } finally {
    if (capped) await reader.cancel().catch(() => {});
  }
  return { text, capped };
}

// 单条挑战：收够即停；总时限 2 分钟、30 秒没有任何新正文就中止，避免一个慢渠道拖住整次检测。
export const CHALLENGE_TIMEOUT_MS = 120000;
export const CHALLENGE_IDLE_MS = 30000;
// 收够预期数量再加少量余量就断开；模型多写时只截取前面的整数参与排名。
const enough = expected => text => parseNumbers(text).length >= expected + 20;

// 挑战经网关并行发出，只取正文（不含思考内容）做指纹排名；单条失败时用其余回答给出部分排名。
export async function runFingerprint({ routeId, apiKey, detector, bank, thinkingLevel = '', language, rounds = 1, onProgress = () => {}, signal, fetcher = globalThis.fetch }) {
  const usedLanguage = language ?? probeLanguage(String(routeId || '').split('/').pop());
  const challenges = fingerprintChallenges(rounds, usedLanguage);
  const states = challenges.map(challenge => ({ expected: challenge.expected_count, language: challenge.language, numbers: 0, status: 'pending', text: '', error: '', errorShort: '', latencyMs: null }));
  const report = () => onProgress(states.map(state => ({ ...state })));
  const outputs = await Promise.all(challenges.map(async (challenge, index) => {
    const started = Date.now();
    states[index].status = 'requesting';
    report();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHALLENGE_TIMEOUT_MS);
    // 上游断流但连接不关时会一直等：超过这么久没有任何新正文就中止。
    let idleTimer;
    const idle = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => controller.abort(), CHALLENGE_IDLE_MS); };
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const response = await fetcher('/api/v1/chat/completions', { method: 'POST', credentials: 'same-origin', signal: controller.signal, headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model: routeId, messages: [{ role: 'user', content: challenge.prompt }], max_tokens: 8192, stream: true, ...(thinkingLevel && { reasoning_effort: thinkingLevel }) }) });
      idle();
      const { text, capped } = await readChatStream(response, partial => { states[index] = { ...states[index], status: 'streaming', text: partial, numbers: parseNumbers(partial).length }; report(); idle(); }, { stopWhen: enough(challenge.expected_count) });
      states[index] = { ...states[index], status: 'done', capped, text, numbers: parseNumbers(text).length, latencyMs: Date.now() - started };
    } catch (failure) {
      if (signal?.aborted) throw failure;
      const timedOut = controller.signal.aborted;
      const error = timedOut ? `超过 ${CHALLENGE_IDLE_MS / 1000} 秒没有任何新内容，已中止；也可能是单条上限 ${CHALLENGE_TIMEOUT_MS / 1000} 秒` : failure.message;
      states[index] = { ...states[index], status: 'error', error, errorShort: timedOut ? '超时未返回数据，已中止' : friendlyError(failure), httpStatus: failure.status, latencyMs: Date.now() - started };
      // 可能先收到一段正文才失败：保留已收到的数字参与排名，同时标记失败原因。
    } finally {
      clearTimeout(timer);
      clearTimeout(idleTimer);
      signal?.removeEventListener('abort', onAbort);
    }
    report();
    return { text: states[index].text, expected_count: challenge.expected_count };
  }));
  return { at: Date.now(), thinkingLevel: thinkingLevel || null, language: usedLanguage, challenges: states, analysis: analyzeSharedOutputs(outputs, bank, detector, { allowPartial: true }) };
}

export function fingerprintVerdict(analysis, claimedId) {
  const top = analysis.results[0];
  if (!top) return { tone: analysis.decision === 'not_model' ? 'error' : 'unknown', label: analysis.evidence.label, reason: analysis.evidence.reason };
  const name = top.display_name || top.model;
  if (!claimedId) return { tone: 'unknown', label: '参考库未收录', reason: `参考库没有该模型，最接近的库内模型是 ${name}，不能据此判定真伪。` };
  if (top.model === claimedId) return { tone: 'healthy', label: '与声称模型一致', reason: analysis.evidence.reason };
  const rank = analysis.results.findIndex(item => item.model === claimedId) + 1;
  return { tone: 'warning', label: '与声称模型不一致', reason: `识别首位为 ${name}，声称模型 ${claimedId} 排第 ${rank} 位。${analysis.evidence.reason}` };
}

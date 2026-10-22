import { useEffect, useId, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { useSearchParams } from 'react-router-dom';
import ProviderIcon from '../components/ProviderIcon.jsx';
import ProviderError from '../components/ProviderError.jsx';
import { ErrorBlock, IconButton, Modal, PageHeading, formatDate, formatNumber, managementEnabled, useResource } from '../components/Controls.jsx';
import { requestJson } from '../api/client.js';
import { providerInfo } from '../api/providers.js';
import { providerLookupIds } from '../api/data.js';
import { checkNames, thinkingNames, resultNames, resultTone, explicitMonitorConfig, toggleMonitorModel, monitorTargets, recentChecks, summarizeMonitorChecks, checkLatency, manualCheckRow, monitorThinkingOptions, saveMonitorConfig } from '../api/monitor.js';
import { decodeDetector, fingerprintVerdict, probeLanguage, referenceMatch, referenceModelId, routeCandidates, runFingerprint } from '../api/fingerprint.js';
import fingerprintBank from '../fingerprint/bank.json';
import detectorUrl from '../fingerprint/shared_detector.bin?url';

const duration = value => typeof value === 'number' ? `${(value / 1000).toFixed(2)} s` : '—';
// 指纹检测记录保存在本机浏览器，刷新和重开页面后仍然保留。
const FINGERPRINT_STORAGE_KEY = '10router-web:model-fingerprint';
const fingerprintKey = (provider, model) => JSON.stringify([provider, model]);
function loadFingerprintResults() {
  try { return JSON.parse(localStorage.getItem(FINGERPRINT_STORAGE_KEY)) || {}; } catch { return {}; }
}
const referenceKinds = { exact: '同名收录', variant: '档位变体', none: '未收录' };
const fingerprintTop = (result, claimedId) => result?.analysis.results.find(item => item.model === claimedId);
// 随机模式下一次检测可能中英混用；旧记录没有逐条语言时退回整体语言字段。
const languageText = result => [...new Set((result.challenges || []).map(item => item.language || result.language || 'en'))].map(lang => lang === 'zh' ? '中文' : '英文').join(' / ');
const percent = value => value === null ? '—' : `${value.toFixed(1)}%`;

function CheckStatus({ status = 'pending' }) {
  return <span className={`status ${resultTone(status)}`}><span className="dot"/>{resultNames[status] || (status === 'pending' ? '未检测' : status)}</span>;
}

function ThinkingSelect({ label, levels, value = '', onChange, disabled = false }) {
  const available = monitorThinkingOptions(levels);
  const hintId = useId();
  const hint = levels == null ? '后端未提供档位列表，可手动选择通用档位；模型是否支持尚未确认，网关或上游可能忽略或拒绝。' : !available.length ? '此模型不支持思考设置' : '';
  return <><select className="monitor-thinking-select" aria-label={label} aria-describedby={hint ? hintId : undefined} value={value} disabled={disabled || (!available.length && !value)} onChange={event => onChange(event.target.value)}><option value="">{thinkingNames['']}</option>{value && !available.includes(value) && <option value={value} disabled>{thinkingNames[value] || value}（当前不可用）</option>}{available.map(level => <option key={level} value={level}>{thinkingNames[level] || level}</option>)}</select>{hint && <small id={hintId} className="log-mode">{hint}</small>}</>;
}

function CheckDetail({ row, name, catalog, onClose }) {
  const provider = catalog.find(item => item.id === row.provider);
  const accountName = id => provider?.connections?.find(connection => connection.id === id)?.name || id || '后端未返回';
  return <Modal title={`${checkNames[row.check || 'iq']} · ${row.model}`} onClose={onClose}>
    <dl className="request-details"><div><dt>供应商</dt><dd>{name(row.provider)}</dd></div><div><dt>检测时间</dt><dd>{formatDate(row.at)}</dd></div><div><dt>结果</dt><dd><CheckStatus status={row.status}/></dd></div><div><dt>本轮耗时</dt><dd>{duration(checkLatency(row))}</dd></div>{row.check !== 'availability' && <><div><dt>思考强度</dt><dd>{Object.hasOwn(row, 'thinkingLevel') ? thinkingNames[row.thinkingLevel || ''] || row.thinkingLevel : '未记录（旧记录）'}</dd></div><div><dt>题库正确率</dt><dd>{row.score == null ? '未评分' : `${row.score}%`}</dd></div></>}<div><dt>记录来源</dt><dd>{row.manual ? row.persisted ? '手动检测记录' : '本页单次测试' : '后台检测记录'}</dd></div></dl>
    {(row.answers || []).map((answer, index) => <section className="monitor-answer" key={index}><h3>{row.check === 'availability' ? '模型回复' : `题目 ${index + 1}`}</h3>{answer.question && <p>{answer.question}</p>}<dl className="request-details">{row.check !== 'availability' && <><div><dt>标准答案</dt><dd>{answer.answer ?? answer.iq?.expected ?? '—'}</dd></div><div><dt>模型答案</dt><dd>{answer.iq?.modelAnswered || '—'}</dd></div></>}<div><dt>状态</dt><dd><CheckStatus status={answer.status}/></dd></div><div><dt>HTTP 状态</dt><dd>{answer.ok ? answer.statusCode ?? answer.httpStatus ?? '—' : answer.statusCode ?? answer.httpStatus ?? '—'}</dd></div><div><dt>耗时</dt><dd>{duration(answer.latencyMs)}</dd></div><div><dt>使用账号</dt><dd>{accountName(answer.connectionId)}</dd></div></dl>{answer.error ? <ProviderError error={{ message: answer.error, status: answer.statusCode ?? answer.httpStatus }} authType={provider?.connections?.find(connection => connection.id === answer.connectionId)?.authType}/> : <pre className="request-metadata">{answer.content || answer.iq?.modelAnswered || '后端未返回文本'}</pre>}</section>)}
  </Modal>;
}

export function ManualTest({ target, check, routeId, thinkingLevels, initialThinkingLevel, persistedManualTests, onClose, onResult }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [thinkingLevel, setThinkingLevel] = useState(check === 'iq' ? initialThinkingLevel || '' : '');
  const settings = useResource(check === 'iq' ? '/api/settings' : null);
  const sending = useRef(false);
  async function run() {
    if (sending.current) return;
    if (check === 'iq' && thinkingLevel && !monitorThinkingOptions(thinkingLevels).includes(thinkingLevel)) { setError('请选择当前模型支持的思考强度，或沿用网关默认设置。'); return; }
    sending.current = true; setBusy(true); setError('');
    try {
      if (check === 'iq' && thinkingLevel && !persistedManualTests) throw new Error('当前后端尚未安装手动检测修复，请升级后端后再选择思考强度。');
      const result = await requestJson('/api/models/test', { method: 'POST', body: JSON.stringify({ model: routeId, kind: 'llm', ...(check === 'iq' && { probe: 'iq' }), ...(persistedManualTests && { monitorTarget: { provider: target.provider, model: target.model, ...(target.connectionId && { connectionId: target.connectionId }) }, ...(check === 'iq' && thinkingLevel && { thinkingLevel }) }) }) });
      onResult(result.monitorRow || manualCheckRow(result, check === 'iq' ? { ...target, thinkingLevel: thinkingLevel || null } : target, check));
    } catch (failure) {
      if (failure.status) onResult(manualCheckRow({ ok: false, status: failure.status, error: failure.details?.error || failure.message }, check === 'iq' ? { ...target, thinkingLevel: thinkingLevel || null } : target, check));
      else setError(failure.message);
    }
    finally { sending.current = false; setBusy(false); }
  }
  return <Modal title={`单次${checkNames[check]} · ${target.model}`} onClose={onClose} busy={busy}>
    {target.blocked && <p className="inline-note">此渠道仍处于隔离中。本次仅诊断指定账号，不开放业务调度；测试通过后可另行解除隔离。</p>}<dl className="request-details"><div><dt>模型路由</dt><dd><code>{routeId}</code></dd></div><div><dt>账号选择</dt><dd>{target.connectionId ? target.connectionName || target.connectionId : persistedManualTests ? '使用本供应商可用账号，遵守检测计划排除项' : '由后端路由选择可用账号'}</dd></div><div><dt>请求次数</dt><dd>1 次真实模型请求，按上游规则计费</dd></div><div><dt>记录范围</dt><dd>{persistedManualTests ? '保存到手动检测历史，不改变业务观察或隔离状态' : '结果保留在当前页面；后端升级后可保存记录'}</dd></div></dl>
    {check === 'iq' && <section className="monitor-answer"><label className="monitor-thinking-control">思考强度<ThinkingSelect label="单次智商检测思考强度" levels={thinkingLevels} value={thinkingLevel} onChange={setThinkingLevel} disabled={busy}/></label><p className="inline-note">仅用于本次智商检测，不修改自动检测计划。</p></section>}
    {check === 'iq' && <section className="monitor-answer"><h3>网关单次检测题目</h3>{settings.error ? <ErrorBlock message={settings.error} onRetry={settings.refresh}/> : settings.loading ? <p>正在读取题目…</p> : <><p>{settings.data?.iqProbe?.question || '后端未返回单题配置'}</p><span className="muted">标准答案：{settings.data?.iqProbe?.answer ?? '—'}</span></>}</section>}
    {error && <ErrorBlock message={error}/>}<div className="dialog-actions"><button className="button" disabled={busy} onClick={onClose}>取消</button><button className="button primary" disabled={busy || (check === 'iq' && (!settings.data?.iqProbe?.question || !!settings.error || (thinkingLevel && !monitorThinkingOptions(thinkingLevels).includes(thinkingLevel))))} onClick={run}><Icon name="play"/>{busy ? '正在检测…' : '开始检测'}</button></div>
  </Modal>;
}

const fingerprintStates = { pending: '等待发送', requesting: '正在请求', streaming: '正在接收', done: '已完成', error: '未采用' };

function FingerprintTest({ target, routeOptions = [], routesLoading = false, routeWarning, initialResult, thinkingLevels, initialThinkingLevel, canTest = true, onResult, onClose }) {
  const keys = useResource('/api/keys');
  const route = routeOptions[0] || '';
  const [thinkingLevel, setThinkingLevel] = useState(initialResult?.thinkingLevel || initialThinkingLevel || '');
  // 提问语言决定模型输出分布：参考库样本多为英文提问，可切换；默认按模型名给出建议。
  const [language, setLanguage] = useState(initialResult?.language || probeLanguage(target.model));
  // 三次并行发出，总耗时约等于最慢的一条；证据最稳，所以默认 3 次，想更快可降到 1 次。
  const [rounds, setRounds] = useState(String(initialResult?.rounds || 3));
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(initialResult || null);
  const controller = useRef(null);
  const startedAt = useRef(0);
  useEffect(() => () => controller.current?.abort(), []);
  // 检测期间每秒刷新已用时间，避免长时间没有任何计时反馈。
  useEffect(() => { if (!busy) return; const timer = setInterval(() => setElapsed(Date.now() - startedAt.current), 1000); return () => clearInterval(timer); }, [busy]);
  const activeKeys = (keys.data?.keys || []).filter(key => key.isActive !== false);
  const [keyChoice, setKeyChoice] = useState('');
  const activeKey = activeKeys.find(key => key.id === keyChoice) || activeKeys[0];
  const source = fingerprintBank.source;
  async function run() {
    if (!canTest) { setError('此站点仅允许业务观察，请先配置检测模式。'); return; }
    const apiKey = activeKey?.key;
    if (!apiKey) { setError('没有可用的网关密钥，请先在「账号授权 → 密钥」里创建。'); return; }
    if (routesLoading) { setError('正在读取网关分发配置，请稍候再开始检测。'); return; }
    if (!route) { setError('网关的下游分发白名单里没有这个模型，无法发起检测。请到「下游分发」页面允许该路由，或换用已发布的路由。'); return; }
    setBusy(true); setError(''); setResult(null); setProgress(null); startedAt.current = Date.now(); setElapsed(0);
    controller.current = new AbortController();
    const { signal } = controller.current;
    try {
      const response = await fetch(detectorUrl, { signal });
      if (!response.ok) throw new Error(`指纹检测数据读取失败（HTTP ${response.status}）`);
      const detector = decodeDetector(new Uint8Array(await response.arrayBuffer()));
      // 流式进度每 300ms 最多刷新一次，避免每个 token 都重渲染整个弹窗。
      let lastReport = 0;
      const pushProgress = next => { const now = Date.now(); if (now - lastReport < 300) return; lastReport = now; setProgress(next); };
      const outcome = await runFingerprint({ routeId: route, apiKey, detector, bank: fingerprintBank, thinkingLevel, language, rounds: Number(rounds), onProgress: pushProgress, signal });
      setProgress(outcome.challenges);
      const claimed = referenceModelId(target.model, fingerprintBank);
      const next = { ...outcome, rounds: Number(rounds), totalMs: Date.now() - startedAt.current, claimed, verdict: fingerprintVerdict(outcome.analysis, claimed) };
      setResult(next); onResult(next);
    } catch (failure) { setError(signal.aborted ? '已停止检测，已发出的请求仍可能计费。' : failure.message); }
    finally { setBusy(false); }
  }
  const challenges = result?.challenges || progress;
  return <Modal title={`指纹检测 · ${target.model}`} onClose={onClose} busy={busy}>
    <dl className="request-details"><div><dt>模型路由</dt><dd><code>{route || '未发布'}</code></dd></div>{routeWarning && <div><dt>分发状态</dt><dd>{routeWarning}</dd></div>}<div><dt>请求次数</dt><dd>{rounds} 次真实模型请求（可调），每次约 300 个整数输出，收够即停；单条最多 2 分钟、30 秒无新内容即中止</dd></div><div><dt>参考库</dt><dd>{fingerprintBank.models.length} 个模型 · 构建于 {formatDate(fingerprintBank.built_at)} · lm-detector <span className="mono">{source.commit.slice(0, 8)}</span></dd></div><div><dt>记录范围</dt><dd>结果保存在本机浏览器，可随时回看</dd></div></dl>
    <section className="monitor-answer">{routeOptions.length > 1 && <p className="inline-note">网关为这个模型发布了 {routeOptions.length} 条路由，按供应商前缀使用 <code>{route}</code>。</p>}<p className="inline-note">{routesLoading ? '正在读取网关分发配置…' : routeOptions.length ? '检测请求按网关下游分发的路由名发出。' : '网关的下游分发白名单没有发布这个模型指向的路由，先到「下游分发」页面允许后再检测。'}</p><div className="fingerprint-options"><label>思考强度<ThinkingSelect label="指纹检测思考强度" levels={thinkingLevels} value={thinkingLevel} onChange={setThinkingLevel} disabled={busy}/></label><label>提问语言<select aria-label="指纹检测提问语言" value={language} disabled={busy} onChange={event => setLanguage(event.target.value)}><option value="en">英文</option><option value="zh">中文</option><option value="random">随机（中 / 英）</option></select></label><label>请求次数<select aria-label="指纹检测请求次数" value={rounds} disabled={busy} onChange={event => setRounds(event.target.value)}><option value="1">1 次（最快）</option><option value="2">2 次</option><option value="3">3 次（默认 · 最稳）</option></select></label></div><p className="inline-note">默认英文：同一模型换成中文题面后数字分布会变，识别置信度明显下降（实测 deepseek-v4.1-flash：英文 98%，中文 45%）。随机模式只在中 / 英之间挑，题面与上游原版一致，不会再出现日韩法题。三条并行发出，总耗时约等于最慢的一条。</p>{activeKeys.length > 1 && <details className="fingerprint-key"><summary>使用密钥 {activeKey?.name || '—'}（共 {activeKeys.length} 个）</summary><label>网关密钥<select aria-label="指纹检测网关密钥" value={activeKey?.id || ''} disabled={busy} onChange={event => setKeyChoice(event.target.value)}>{activeKeys.map(key => <option key={key.id} value={key.id}>{key.name}</option>)}</select></label></details>}{keys.error && <ErrorBlock message={keys.error} onRetry={keys.refresh}/>}<p className="inline-note">让模型凭第一反应写出整数，按数字分布与参考库比对。结果是参考库内的相对排序，库外模型也会得到「最接近」的候选，不能作为身份证明。</p></section>
    {challenges?.some(item => item.status === 'error') && !busy && <section className="monitor-answer"><h3>失败原因</h3><ul className="fingerprint-failures">{challenges.map((item, index) => item.status === 'error' ? <li key={index}><strong>挑战 {index + 1}：{item.errorShort || '请求失败'}</strong>{item.error && item.error !== item.errorShort && <details><summary>原始错误</summary><pre className="request-metadata">{item.error}</pre></details>}</li> : null)}</ul></section>}
    {challenges && <section className="monitor-answer"><h3>挑战进度</h3>{busy && <p className="inline-note">已用时 {duration(elapsed)} · 各条并行发出，收够整数即停</p>}{challenges.map((item, index) => <details key={index}><summary>挑战 {index + 1}：{fingerprintStates[item.status] || item.status} · 已解析 {item.numbers} / {item.expected} 个整数{item.capped && ' · 收够即停'}{item.errorShort ? ` · ${item.errorShort}` : item.latencyMs != null && ` · ${duration(item.latencyMs)}`}</summary>{item.error ? <pre className="request-metadata">{item.error}</pre> : <pre className="request-metadata">{item.text || '尚未收到正文'}</pre>}</details>)}</section>}
    {result && <section className="monitor-answer"><h3>识别结果</h3><p className="inline-note">检测时间 {formatDate(result.at)} · 提问语言 {languageText(result)} · 请求 {result.challenges?.length || 0} 次 · 思考强度 {result.thinkingLevel ? thinkingNames[result.thinkingLevel] || result.thinkingLevel : '默认'} · 声称模型 {result.claimed || '未收录'} · 记录保存在本机浏览器</p>
      {result.claimed && <p className="inline-note">声称模型 {result.claimed}，识别首位 {result.analysis.results[0]?.display_name || result.analysis.results[0]?.model || '—'}</p>}<p><span className={`status ${result.verdict.tone}`}><span className="dot"/>{result.verdict.label}</span></p><p className="inline-note">{result.verdict.reason}</p>
      {result.analysis.results.length > 0 && <div className="table-shell"><table><thead><tr><th>排名</th><th>参考模型</th><th>家族</th><th>置信度</th></tr></thead><tbody>{result.analysis.results.slice(0, 5).map((item, index) => <tr key={item.model}><td className="mono">{index + 1}</td><td className="log-model">{item.display_name || item.model}{item.model === result.claimed && <small>声称模型</small>}</td><td>{item.family_name}</td><td className="mono">{item.probability == null ? '—' : `${(item.probability * 100).toFixed(1)}%`}</td></tr>)}</tbody></table></div>}
    </section>}
    {error && <ErrorBlock message={error}/>}<div className="dialog-actions">{busy ? <button className="button" onClick={() => { controller.current?.abort(); }}>停止检测</button> : <button className="button" onClick={onClose}>关闭</button>}<button className="button primary" disabled={!canTest || busy || !activeKey || !route || routesLoading} onClick={run}><Icon name="play"/>{busy ? `正在检测… ${duration(elapsed)}` : result ? '重新检测' : '开始检测'}</button></div>
  </Modal>;
}

function MonitorConfig({ data, onSaved }) {
  const [config, setConfig] = useState(() => explicitMonitorConfig(data.config, data.catalog));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const edit = patch => { setConfig(previous => ({ ...previous, ...patch })); setDirty(true); setMessage(''); };
  const changeProvider = (id, patch) => edit({ providers: config.providers.map(provider => provider.id === id ? { ...provider, ...patch } : provider) });
  const targets = monitorTargets(config, data.catalog).filter(target => config.testingModes?.[target.provider] === 'scheduled');
  const blockedPlans = config.providers.filter(item => config.testingModes?.[item.id] !== 'scheduled');
  const requests = targets.reduce((sum, target) => sum + (target.check === 'iq' ? config.questions.length : 1), 0);
  async function save(event) {
    event.preventDefault(); setError(''); setMessage('');
    if (config.providers.some(provider => !provider.models.length)) { setError('请为已选择的供应商勾选至少一个检测模型，或取消该供应商。'); return; }
    if (config.enabled && !targets.length) { setError('启用自动检测前，请选择至少一个可用检测模型。'); return; }
    setBusy(true);
    try {
      const result = await saveMonitorConfig(config);
      setConfig(explicitMonitorConfig(result.config, data.catalog)); setDirty(false);
      setMessage(result.config.enabled ? '已保存，后台将在约 30 秒内检查检测计划。' : '已保存，自动检测已关闭。'); onSaved();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <form className="monitor-config" onSubmit={save}>
    <fieldset disabled={!managementEnabled || busy}>
      <section className="monitor-config-band"><div className="panel-heading"><h2>中转站检测模式</h2></div><p className="inline-note">仅业务观察不发出测试；手动测试只在点击后执行。允许定时检测还需下方计划启用。此设置与可用性自动隔离独立。</p><div className="monitor-testing-modes">{data.catalog.map(provider => <label key={provider.id}><span>{provider.name}<small>{Object.hasOwn(config.testingModes || {}, provider.id) ? '按本站设置执行' : '待确认 · 当前仅业务观察'}</small></span><select aria-label={provider.name + ' 检测模式'} value={config.testingModes?.[provider.id] || 'observe'} onChange={event => edit({ testingModes: { ...config.testingModes, [provider.id]: event.target.value } })}><option value="observe">仅业务观察</option><option value="manual">手动测试</option><option value="scheduled">允许定时检测</option></select></label>)}</div><p className="inline-note">保存后影响预览：{blockedPlans.length ? blockedPlans.map(item => data.catalog.find(provider => provider.id === item.id)?.name || item.id).join('、') + ' 的旧计划保留，但不执行定时检测。' : '当前已选计划均允许定时检测。'} 未修改的站点不会自动获得测试权限。</p></section>
      <section className="monitor-config-band"><div className="panel-heading"><h2>自动检测计划</h2><span className="muted">{dirty ? '有未保存更改' : '已保存配置'}</span></div><div className="monitor-plan-controls"><label className="checkbox-filter"><input type="checkbox" aria-label="启用自动检测" checked={config.enabled} onChange={event => edit({ enabled: event.target.checked })}/>启用自动检测</label><label>间隔（分钟）<input aria-label="检测间隔" aria-describedby="monitor-interval-hint" type="number" min="1" max="10080" step="1" required value={config.intervalMinutes} onChange={event => edit({ intervalMinutes: Number(event.target.value) })}/></label><span className="muted">{config.providers.length} 个供应商 · 每轮最多 {requests} 次请求</span></div><p className="inline-note" id="monitor-interval-hint">最小间隔 1 分钟，请输入整数。</p><p className="inline-note">检测会产生上游用量。单次测试使用网关单题，自动智商检测执行下方题库。</p></section>
      <section className="monitor-config-band"><div className="panel-heading"><h2>供应商与模型</h2></div><p className="inline-note">思考强度按模型设置，仅用于智商检测，不影响模型测活。</p><div className="filter-search"><Icon name="search"/><input aria-label="搜索检测配置供应商" placeholder="搜索供应商或模型…" value={query} onChange={event => setQuery(event.target.value)}/></div>
        {config.providers.filter(selected => !data.catalog.some(provider => provider.id === selected.id)).map(selected => <div className="error-block" key={selected.id}>供应商已不存在：{selected.id}<IconButton icon="trash" label={`移除 ${selected.id}`} onClick={() => edit({ providers: config.providers.filter(item => item.id !== selected.id) })}/></div>)}
        {data.catalog.filter(provider => `${provider.name} ${provider.id} ${provider.models.join(' ')}`.toLowerCase().includes(query.toLowerCase())).map(provider => {
          const selected = config.providers.find(item => item.id === provider.id);
          return <details key={provider.id} className="monitor-provider-config"><summary><ProviderIcon provider={provider.id}/><strong>{provider.name}</strong><span>{selected ? `${selected.models.length} 个检测模型` : '未加入检测'} · {provider.models.length} 个模型</span></summary><div className="monitor-provider-body"><label className="checkbox-filter"><input aria-label={`参与检测 ${provider.name}`} type="checkbox" disabled={!selected && !provider.models.length} checked={!!selected} onChange={event => edit({ providers: event.target.checked ? [...config.providers, { id: provider.id, mode: 'selected', models: [], modelChecks: {}, excludedConnectionIds: [] }] : config.providers.filter(item => item.id !== provider.id) })}/>参与检测</label>
            {selected && <><ProviderModelChecks provider={provider} selected={selected} onChange={patch => changeProvider(provider.id, patch)}/><div className="monitor-excluded"><h3>不参与自动检测的账号</h3>{provider.connections.map(connection => <label className="checkbox-filter" key={connection.id}><input aria-label={`排除账号 ${connection.name}`} type="checkbox" checked={(selected.excludedConnectionIds || []).includes(connection.id)} onChange={event => changeProvider(provider.id, { excludedConnectionIds: event.target.checked ? [...(selected.excludedConnectionIds || []), connection.id] : (selected.excludedConnectionIds || []).filter(id => id !== connection.id) })}/>{connection.name}</label>)}</div></>}
          </div></details>;
        })}
        {!data.catalog.length && <p className="empty-state">暂无供应商，请先添加账号和模型。</p>}
      </section>
      <section className="monitor-config-band"><div className="panel-heading"><h2>自动检测题库</h2><span className="muted">数字标准答案 · {config.questions.length} / 20 题</span></div>{config.questions.map((question, index) => <div className="monitor-question" key={index}><label>题目 {index + 1}<textarea aria-label={`检测题目 ${index + 1}`} rows="3" required maxLength="10000" value={question.question} onChange={event => edit({ questions: config.questions.map((item, position) => position === index ? { ...item, question: event.target.value } : item) })}/></label><div><label>标准答案<input aria-label={`标准答案 ${index + 1}`} required pattern="-?[0-9]+(\.[0-9]+)?" value={question.answer} onChange={event => edit({ questions: config.questions.map((item, position) => position === index ? { ...item, answer: event.target.value } : item) })}/></label><IconButton icon="trash" label={`删除题目 ${index + 1}`} disabled={config.questions.length === 1} onClick={() => edit({ questions: config.questions.filter((_, position) => position !== index) })}/></div></div>)}<button type="button" className="button" disabled={config.questions.length >= 20} onClick={() => edit({ questions: [...config.questions, { question: '', answer: '' }] })}><Icon name="plus"/>添加题目</button></section>
      {error && <ErrorBlock message={error}/>}<div className="monitor-save"><span role="status">{message}</span><button className="button primary" type="submit" disabled={busy || !dirty}><Icon name="check"/>{busy ? '正在保存…' : '保存检测配置'}</button></div>
    </fieldset>
  </form>;
}

function ProviderModelChecks({ provider, selected, onChange }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const models = [...new Set([...provider.models, ...selected.models])].filter(model => model.toLowerCase().includes(search.toLowerCase()));
  const pages = Math.max(1, Math.ceil(models.length / 20));
  const current = Math.min(page, pages);
  return <div className="monitor-model-checks"><div className="filter-search"><Icon name="search"/><input aria-label={`搜索检测模型 ${provider.name}`} placeholder="搜索模型…" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }}/></div><div className="table-shell"><table><thead><tr><th>模型</th><th>测活</th><th>智商检测</th><th>思考强度</th></tr></thead><tbody>{models.slice((current - 1) * 20, current * 20).map(model => <tr key={model}><td className="log-model">{model}{!provider.models.includes(model) && <small>当前不可用</small>}</td>{['availability', 'iq'].map(check => <td key={check}><input type="checkbox" aria-label={`${provider.name} ${model} ${checkNames[check]}`} checked={selected.modelChecks?.[model]?.includes(check) || false} disabled={!provider.models.includes(model) && !selected.modelChecks?.[model]?.includes(check)} onChange={event => onChange(toggleMonitorModel(selected, model, check, event.target.checked))}/></td>)}<td><ThinkingSelect label={provider.name + ' ' + model + ' 智商检测思考强度'} levels={provider.thinkingLevels?.[model]} value={Object.hasOwn(selected.modelThinking || {}, model) ? selected.modelThinking[model] : ''} disabled={!selected.modelChecks?.[model]?.includes('iq') || !provider.models.includes(model)} onChange={value => { const modelThinking = { ...selected.modelThinking }; if (value) modelThinking[model] = value; else delete modelThinking[model]; onChange({ modelThinking }); }}/></td></tr>)}</tbody></table></div><div className="table-footer"><span>{models.length} 个模型</span><div className="pagination"><IconButton icon="back" label={`上一页检测模型 ${provider.name}`} disabled={current <= 1} onClick={() => setPage(current - 1)}/><span>{current} / {pages}</span><IconButton icon="arrow" label={`下一页检测模型 ${provider.name}`} disabled={current >= pages} onClick={() => setPage(current + 1)}/></div></div></div>;
}

export function MonitorPage({ embedded = false }) {
  const [params, navigateParams] = useSearchParams();
  const setParams = (next, options) => navigateParams(typeof next === 'function' ? next(new URLSearchParams(window.location.search)) : next, options);
  const resource = useResource('/api/iq-monitor');
  const nodes = useResource('/api/provider-nodes');
  const distribution = useResource('/api/models/distribution');
  const view = ['status', 'history', 'config'].includes(params.get('toolView')) ? params.get('toolView') : 'status';
  const setView = value => setParams(previous => { const next = new URLSearchParams(previous); next.set('toolView', value); return next; });
  const check = ['availability', 'iq', 'fingerprint'].includes(params.get('check')) ? params.get('check') : 'availability';
  const setCheck = value => setParams(previous => { const next = new URLSearchParams(previous); next.set('check', value); return next; });
  const setFilterParam = (key, value, replace = false) => setParams(previous => { const next = new URLSearchParams(previous); if (value) next.set(key, value); else next.delete(key); return next; }, { replace });
  const provider = params.get('provider') || '';
  const setProvider = value => setFilterParam('provider', value);
  const query = params.get('model') || '';
  const setQuery = value => setFilterParam('model', value, true);
  const scope = params.get('toolScope') || 'configured';
  const setScope = value => setFilterParam('toolScope', value === 'configured' ? '' : value);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);
  const [manual, setManual] = useState(null);
  const [fingerprint, setFingerprint] = useState(null);
  const [fingerprintResults, setFingerprintResults] = useState(loadFingerprintResults);
  const fingerprintStatus = params.get('fingerprintStatus') || '';
  const setFingerprintStatus = value => setFilterParam('fingerprintStatus', value);
  const publishStatus = params.get('publishStatus') || '';
  const setPublishStatus = value => setFilterParam('publishStatus', value);
  const [collapsedProviders, setCollapsedProviders] = useState(null);
  useEffect(() => { try { localStorage.setItem(FINGERPRINT_STORAGE_KEY, JSON.stringify(fingerprintResults)); } catch { /* 浏览器禁用存储时不记录 */ } }, [fingerprintResults]);
  const [manualResults, setManualResults] = useState({});
  const [autoRefresh, setAutoRefresh] = useState(true);
  useEffect(() => { if (!autoRefresh) return; const timer = setInterval(() => { if (!document.hidden && !resource.loading) resource.refresh(); }, 15000); return () => clearInterval(timer); }, [autoRefresh, resource.loading, resource.refresh]);
  const data = resource.data;
  const testingAllowed = id => ['manual', 'scheduled'].includes(data?.config.testingModes?.[id]);
  const catalog = data?.catalog || [];
  const storedHistory = data?.state?.history || [];
  const history = [...storedHistory, ...Object.values(manualResults).filter(manual => !storedHistory.some(row => row.manual && row.provider === manual.provider && row.model === manual.model && row.check === manual.check && row.at === manual.at))];
  const targets = data ? monitorTargets(data.config, catalog) : [];
  const manualThinking = data?.config.providers.find(selected => selected.id === manual?.target.provider)?.modelThinking || {};
  const fingerprintRoute = target => `${providerInfo(target.provider, nodes.data?.nodes).prefix || target.provider}/${target.model}`;
  const name = id => { const info = providerInfo(id, nodes.data?.nodes); return info.name === id || info.name.startsWith('自定义节点（') ? catalog.find(item => item.id === id)?.name || id : info.name; };
  const matches = row => (!provider || row.provider === provider) && `${row.model} ${name(row.provider)}`.toLowerCase().includes(query.toLowerCase());
  const fallbackRoute = (provider, model) => `${providerInfo(provider, nodes.data?.nodes).prefix || provider}/${model}`;
  // 自定义节点（openai-compatible-*）的短前缀只存在于 /api/provider-nodes，provider-aliases 里查不到，必须一起带上。
  const routesFor = (provider, model) => routeCandidates(provider, model, distribution.data, fallbackRoute(provider, model), [...providerLookupIds(provider), providerInfo(provider, nodes.data?.nodes).prefix].filter(Boolean));
  const fingerprintAllowlist = distribution.data?.mode === 'allowlist';
  // 白名单模式下没发布的路由发出去必然 404：默认只看已发布的，供应商内也把已发布的排在最前面。
  const publishFilter = publishStatus || (fingerprintAllowlist ? 'published' : '');
  const baseRows = check === 'fingerprint' ? catalog.flatMap(item => item.models.map(model => {
    const routes = routesFor(item.id, model);
    return { provider: item.id, model, check, ...(referenceMatch(model, fingerprintBank) || { kind: 'none' }), routes, published: routes.length > 0 };
  })).filter(row => matches(row) && (scope === 'configured' || scope === row.kind) && (!fingerprintStatus || (fingerprintResults[fingerprintKey(row.provider, row.model)] ? 'tested' : row.kind === 'none' ? 'unmatched' : 'untested') === fingerprintStatus)) : [];
  const fingerprintRows = baseRows.filter(row => !publishFilter || publishFilter === 'all' || (row.published ? 'published' : 'unpublished') === publishFilter);
  const statusRows = check === 'fingerprint' ? fingerprintRows : (scope === 'all' ? catalog.flatMap(item => item.models.map(model => ({ provider: item.id, model, check }))) : targets.filter(target => target.check === check)).filter(matches);
  // 指纹检测的记录在浏览器的本地存储里，不在后端检测历史里，所以「检测记录」要单独列一份。
  const fingerprintHistory = check === 'fingerprint' ? Object.entries(fingerprintResults).flatMap(([key, result]) => {
    const [provider, model] = JSON.parse(key);
    return [{ provider, model, result }];
  }) : [];
  const filteredFingerprintHistory = fingerprintHistory.filter(entry => matches(entry)).sort((a, b) => b.result.at - a.result.at);
  const fingerprintGroups = check === 'fingerprint' ? catalog.map(item => {
    const rows = fingerprintRows.filter(row => row.provider === item.id).sort((a, b) => (b.published - a.published) || a.model.localeCompare(b.model));
    const all = baseRows.filter(row => row.provider === item.id);
    return { provider: item, rows, total: all.length, published: rows.filter(row => row.published).length, routable: all.filter(row => row.published).length };
  }).filter(group => group.rows.length).sort((a, b) => (b.published - a.published) || (a.provider.name || a.provider.id).localeCompare(b.provider.name || b.provider.id)) : [];
  const filtered = !!(query || provider || scope !== 'configured' || fingerprintStatus || publishStatus || fingerprintAllowlist);
  const filteredHistory = history.filter(row => (row.check || 'iq') === check && matches(row)).sort((a, b) => b.at - a.at);
  const rows = view === 'history' ? (check === 'fingerprint' ? filteredFingerprintHistory : filteredHistory) : statusRows;
  const pages = Math.max(1, Math.ceil(check === 'fingerprint' && view === 'status' ? fingerprintGroups.length / 6 : rows.length / 20));
  const current = Math.min(page, pages);
  const latestFor = target => {
    const automatic = recentChecks(history, target.provider, target.model, check)[0];
    const manual = manualResults[JSON.stringify([target.provider, target.model, check])];
    return manual && (!automatic || manual.at > automatic.at) ? manual : automatic;
  };
  const summary = summarizeMonitorChecks(history, statusRows, check);
  const fingerprintScope = check === 'fingerprint' ? catalog.flatMap(item => item.models.map(model => referenceMatch(model, fingerprintBank)?.kind || 'none')) : [];
  const fingerprintCounts = { total: fingerprintScope.length, exact: fingerprintScope.filter(kind => kind === 'exact').length, variant: fingerprintScope.filter(kind => kind === 'variant').length, none: fingerprintScope.filter(kind => kind === 'none').length };
  // 网关下游分发开启白名单时，未发布的路由发出去必然 404，页面直接置灰并给出可检测数量。
  const fingerprintRoutable = check === 'fingerprint' ? catalog.flatMap(item => item.models.map(model => routesFor(item.id, model).length > 0)).filter(Boolean).length : 0;
  // 改筛选条件后回到自动展开：否则保留下来的折叠状态会让筛选结果看起来像空列表。
  const filter = (setter, value) => { setter(value); setCollapsedProviders(null); setPage(1); };
  const stateLabel = data?.running ? '检测中' : data?.config.enabled ? '等待下一轮' : '自动检测已关闭';
  return <>
    <PageHeading title={embedded ? "检测工具" : "模型检测"} subtitle="模型测活 / 智商检测 / 指纹检测" compact={embedded}><label className="checkbox-filter"><input aria-label="自动刷新检测结果" type="checkbox" checked={autoRefresh} onChange={event => setAutoRefresh(event.target.checked)}/>自动刷新</label><span className="last-updated">{resource.updated?.toLocaleTimeString('zh-CN') || '—'}</span><button className="button" disabled={resource.loading} onClick={resource.refresh}><Icon name="refresh"/>刷新</button></PageHeading>
    {resource.error && <ErrorBlock message={`${resource.error}${data ? ' · 当前保留上次结果' : ''}`} onRetry={resource.refresh}/>}
    <p className="monitor-mode-hint">主动检测按中转站授权。未确认的站点仅观察业务；在「检测配置」中可改为手动测试。<button className="text-button" onClick={() => setView('config')}>配置检测模式</button></p>
    <div className="monitor-view-tabs" role="tablist" aria-label="模型检测视图">{[['status', '模型状态'], ['history', '检测记录'], ['config', '检测配置']].map(([value, title]) => <button type="button" role="tab" aria-selected={view === value} key={value} onClick={() => { setView(value); setPage(1); }}>{title}</button>)}</div>
    {!data ? <p className="empty-state">{resource.error ? '检测数据读取失败' : '正在读取检测数据…'}</p> : <>
      <div className="monitor-runtime"><span className={`status ${data.running ? 'healthy' : 'unknown'}`}><span className="dot"/>{stateLabel}</span><span>上轮完成 {formatDate(data.state.completedAt)}</span><span>下轮 {data.config.enabled ? data.running ? '本轮完成后计算' : data.state.revision !== data.config.revision ? '等待后台检查' : formatDate(data.state.nextAt) : '—'}</span></div>
      {view === 'config' ? <MonitorConfig data={data} onSaved={resource.refresh}/> : <>
        <div className="section-toolbar"><div className="period-tabs" aria-label="检测类型">{Object.entries({ ...checkNames, fingerprint: '指纹检测' }).map(([value, title]) => <button type="button" key={value} aria-pressed={check === value} className={check === value ? 'selected' : ''} onClick={() => filter(setCheck, value)}>{title}</button>)}</div><span className="muted">{check === 'iq' ? '得分按题库正确率计算' : check === 'fingerprint' ? '按数字指纹与参考库比对，结果只保留在本页' : '测活按后端返回的有效回复判定'}</span></div>
        {view === 'status' && check === 'fingerprint' && <><section className="metrics-grid monitor-metrics" aria-label="指纹检测汇总">{[['可检测模型', formatNumber(fingerprintAllowlist ? fingerprintRoutable : fingerprintCounts.total), fingerprintAllowlist ? `已发布路由 · 共 ${fingerprintCounts.total} 个模型` : '全部供应商 · 个模型'], ['同名收录', formatNumber(fingerprintCounts.exact), '名称与参考库一致'], ['档位变体', formatNumber(fingerprintCounts.variant), '去掉思考/档位后缀后比对'], ['已检测', formatNumber(Object.keys(fingerprintResults).length), '记录保存在本机浏览器']].map(([title, value, note]) => <div className="metric" key={title}><div className="metric-label">{title}</div><div className="metric-value">{value}</div><div className="metric-note">{note}</div></div>)}</section><p className="metric-note">参考库 {fingerprintBank.models.length} 个模型 · 构建于 {formatDate(fingerprintBank.built_at)}；另有 {fingerprintCounts.none} 个网关模型不在参考库内，检测只能给出最接近的库内模型。{fingerprintAllowlist && ` 网关下游分发为白名单模式，只发布了 ${fingerprintRoutable} 个模型的路由，其余 ${fingerprintCounts.total - fingerprintRoutable} 个会显示灰色「未发布」，需先到「下游分发」页面允许后才能检测。`}</p></>}
        {view === 'status' && check !== 'fingerprint' && <>
          <section className="metrics-grid monitor-metrics" aria-label="检测汇总">{[['匹配模型', formatNumber(statusRows.length), '当前筛选范围 · 个模型'], ['近30次通过', formatNumber(summary.passed), '检测记录 · 次通过'], ['近30次异常', formatNumber(summary.failed), '答错 / 限流 / 超时 / 故障'], ['近期检测通过率', percent(summary.passRate), '通过次数 / 已判定次数']].map(([title, value, note]) => <div className="metric" key={title}><div className="metric-label">{title}</div><div className="metric-value">{value}</div><div className="metric-note">{note}</div></div>)}</section>
          <p className="metric-note">当前筛选范围最近{summary.total}次检测，其中{summary.ungraded}次未评分；未评分不计入通过率，包含手动检测。</p>
        </>}
        {view === 'status' && check === 'fingerprint' ? <div className="fingerprint-toolbar">
          <div className="filter-search"><Icon name="search"/><input aria-label="搜索检测模型" placeholder="搜索模型或供应商…" value={query} onChange={event => filter(setQuery, event.target.value)}/></div>
          <select aria-label="检测供应商" value={provider} onChange={event => filter(setProvider, event.target.value)}><option value="">全部供应商</option>{catalog.map(item => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}</select>
          <select aria-label="参考库收录范围" value={scope} onChange={event => filter(setScope, event.target.value)}><option value="configured">全部模型</option><option value="exact">同名收录</option><option value="variant">档位变体</option><option value="none">未收录</option></select>
          <select aria-label="指纹检测状态" value={fingerprintStatus} onChange={event => filter(setFingerprintStatus, event.target.value)}><option value="">全部状态</option><option value="tested">已检测</option><option value="untested">未检测</option><option value="unmatched">未收录不可检测</option></select>
          {fingerprintAllowlist && <select aria-label="下游分发状态" value={publishFilter} onChange={event => filter(setPublishStatus, event.target.value)}><option value="published">只看已发布</option><option value="unpublished">只看未发布</option><option value="all">全部路由</option></select>}
        </div> : <div className="monitor-filters"><div className="filter-search"><Icon name="search"/><input aria-label="搜索检测模型" placeholder="搜索模型或供应商…" value={query} onChange={event => filter(setQuery, event.target.value)}/></div><label>供应商<select aria-label="检测供应商" value={provider} onChange={event => filter(setProvider, event.target.value)}><option value="">全部供应商</option>{[...new Set([...catalog.map(item => item.id), ...history.map(row => row.provider)])].map(id => <option key={id} value={id}>{name(id)}</option>)}</select></label>
        {view === 'status' && check !== 'fingerprint' && <label>模型范围<select aria-label="检测模型范围" value={scope} onChange={event => filter(setScope, event.target.value)}><option value="configured">已配置检测模型</option><option value="all">全部可检测模型</option></select></label>}</div>}
        {view === 'status' && check === 'fingerprint' ? <div className="fingerprint-groups">{fingerprintGroups.slice((current - 1) * 6, current * 6).map(group => {
          const collapsed = collapsedProviders === null ? !filtered : collapsedProviders.has(group.provider.id);
          const toggle = () => setCollapsedProviders(previous => {
            const base = previous === null ? new Set(fingerprintGroups.map(item => item.provider.id)) : new Set(previous);
            if (base.has(group.provider.id)) base.delete(group.provider.id); else base.add(group.provider.id);
            return base;
          });
          return <section className="fingerprint-group" key={group.provider.id}>
            <button type="button" className="fingerprint-group-heading" aria-expanded={!collapsed} onClick={toggle}>
              <ProviderIcon provider={group.provider.id}/>
              <strong>{group.provider.name || group.provider.id}</strong>
              <span className="muted">{group.routable} / {group.total} 个模型可检测</span>
              <span className="fingerprint-group-meta">{group.rows.filter(row => fingerprintResults[fingerprintKey(row.provider, row.model)]).length} 已检测</span>
              <Icon name={collapsed ? 'arrow' : 'down'}/>
            </button>
            {!collapsed && <ul className="fingerprint-model-list">{group.rows.map(target => {
              const key = fingerprintKey(target.provider, target.model);
              const result = fingerprintResults[key];
              const claim = fingerprintTop(result, result?.claimed);
              const top = result?.analysis.results[0];
              return <li key={key} className={result ? 'fingerprint-tested' : ''}>
                <div className="fingerprint-model-name"><strong>{target.model}</strong>{target.kind !== 'none' && <span className="badge subdued">{referenceKinds[target.kind]}</span>}{distribution.data?.mode === 'allowlist' && <span className={`badge ${target.routes.length ? 'subdued' : 'warning'}`} title={target.routes.length ? target.routes.join('、') : '网关下游分发白名单未发布该模型，检测请求会被拒绝（404）'}>{target.routes.length ? '已发布' : '未发布'}</span>}</div>
                <div className="fingerprint-model-meta">{result ? <><span className="mono">{formatDate(result.at)}</span><span className={`status ${result.verdict.tone}`}><span className="dot"/>{result.verdict.label}</span>{claim && <span className="muted">指纹 {claim.display_name || claim.model}{claim.probability == null ? '' : ` · ${(claim.probability * 100).toFixed(0)}%`}</span>}{top && top.model !== claim?.model && <span className="muted">首位 {top.display_name || top.model}</span>}</> : <span className="muted">{target.kind === 'none' ? '未收录' : '未检测'}</span>}</div>
                <div className="fingerprint-model-actions">{result && <IconButton icon="eye" label={`查看指纹结果 ${target.model}`} onClick={() => setFingerprint(target)}/>}<button type="button" className="button" aria-label={`指纹检测 ${target.model}`} disabled={!managementEnabled || !testingAllowed(target.provider) || (distribution.data?.mode === 'allowlist' && !target.routes.length)} onClick={() => setFingerprint(target)}><Icon name="shield"/>{result ? '重测' : '检测'}</button></div>
              </li>;
            })}</ul>}
          </section>;
        })}{!fingerprintGroups.length && <p className="empty-state">暂无匹配的模型</p>}</div> : view === 'history' && check === 'fingerprint' ? <div className="table-shell"><table className="monitor-table"><caption className="sr-only">指纹检测记录</caption><thead><tr><th>模型 / 供应商</th><th>记录时间</th><th>指纹结论</th><th>识别首位</th><th>请求</th><th>操作</th></tr></thead><tbody>{fingerprintHistory.slice((current - 1) * 20, current * 20).map(({ provider, model, result }) => {
          const target = { provider, model };
          const topRow = result.analysis.results[0];
          const claim = fingerprintTop(result, result.claimed);
          return <tr key={fingerprintKey(provider, model)}><td><div className="connection-name"><ProviderIcon provider={provider}/><div className="log-model"><strong>{model}</strong><small>{name(provider)}</small></div></div></td><td className="mono muted">{formatDate(result.at)}</td><td><span className={`status ${result.verdict.tone}`}><span className="dot"/>{result.verdict.label}</span><small className="log-mode">{languageText(result)}提问 · {result.challenges?.length || 0} 次请求</small></td><td className="log-model">{topRow ? topRow.display_name || topRow.model : '—'}{claim && claim.probability != null && <small>{claim.display_name || claim.model} · {(claim.probability * 100).toFixed(1)}%</small>}</td><td className="mono">{Array.isArray(result.challenges) && result.challenges.some(item => item.status === 'error') ? `${result.challenges.filter(item => item.status === 'error').length} 条失败` : '成功'}{result.totalMs ? <small className="log-mode">{duration(result.totalMs)}</small> : null}</td><td><div className="monitor-actions"><div><IconButton icon="eye" label={`查看指纹结果 ${model}`} onClick={() => setFingerprint(target)}/><button type="button" className="button" aria-label={`指纹检测 ${model}`} disabled={!managementEnabled || !testingAllowed(provider) || (fingerprintAllowlist && !routesFor(provider, model).length)} onClick={() => setFingerprint(target)}><Icon name="shield"/>重测</button><IconButton icon="trash" label={`删除指纹记录 ${model}`} onClick={() => setFingerprintResults(previous => { const next = { ...previous }; delete next[fingerprintKey(provider, model)]; return next; })}/></div></div></td></tr>;
        })}{!fingerprintHistory.length && <tr><td className="table-empty" colSpan="6">还没有指纹检测记录，到「模型状态 → 指纹检测」里跑一次就会出现在这里。</td></tr>}</tbody></table></div> : <div className="table-shell"><table className="monitor-table"><caption className="sr-only">{view === 'history' ? '检测历史' : '供应商模型检测状态'}</caption><thead><tr><th>模型 / 供应商</th><th>结果</th><th>{view === 'history' ? '检测时间' : '最近 30 轮'}</th><th>{check === 'iq' ? '题库正确率' : '最近通过率'}</th><th>本轮耗时</th><th>{view === 'history' ? '操作' : '最新检测 / 操作'}</th></tr></thead><tbody>{rows.slice((current - 1) * 20, current * 20).map((target, index) => {
          const previous = recentChecks(history, target.provider, target.model, check);
          const key = JSON.stringify([target.provider, target.model, check]);
          const row = view === 'history' ? target : latestFor(target);
          const success = previous.length ? previous.filter(item => ['available', 'correct'].includes(item.status)).length / previous.length * 100 : null;
          const backoff = data.state.backoff?.[target.provider];
          return <tr key={view === 'history' ? `${key}-${target.at}-${index}` : key}><td><div className="connection-name"><ProviderIcon provider={target.provider}/><div className="log-model"><strong>{target.model}</strong><small>{name(target.provider)}</small></div></div></td><td><CheckStatus status={row?.status}/>{row?.manual && <small className="log-mode">单次测试</small>}{backoff > Date.now() && <small className="log-mode">退避至 {formatDate(backoff)}</small>}</td><td>{view === 'history' ? <span className="mono muted">{formatDate(row.at)}</span> : <div className="monitor-history-dots" aria-label="最近30轮检测，左旧右新">{Array.from({ length: 30 - previous.length }, (_, i) => <span key={`empty-${i}`} title="未检测"/>)}{[...previous].reverse().map((item, i) => <button type="button" key={`${item.at}-${i}`} className={resultTone(item.status)} title={`${formatDate(item.at)} · ${resultNames[item.status] || item.status}`} aria-label={`查看检测 ${target.model} ${formatDate(item.at)}`} onClick={() => setDetail(item)}/>)}</div>}</td><td className="mono">{check === 'iq' ? row?.score == null ? '—' : `${row.score}%` : percent(success)}{check === 'iq' && typeof row?.change === 'number' && <small className="log-mode">{row.change > 0 ? '+' : ''}{row.change} 分</small>}</td><td className="mono">{duration(checkLatency(row))}</td><td><div className="monitor-actions">{view === 'status' && <small>{formatDate(row?.at)}</small>}<div>{row && <IconButton icon="eye" label={`查看检测详情 ${target.model}`} onClick={() => setDetail(row)}/>} {view === 'status' && <IconButton icon="play" label={`单次${checkNames[check]} ${target.model}`} disabled={!managementEnabled || !testingAllowed(target.provider)} title={testingAllowed(target.provider) ? "单次真实测试" : "此站点仅允许业务观察"} onClick={() => setManual({ target, check })}/>}</div></div></td></tr>;
        })}{!rows.length && <tr><td className="table-empty" colSpan="6">{view === 'history' ? '暂无匹配的检测记录' : scope === 'configured' ? '暂无匹配的已配置模型' : '暂无匹配的可检测模型'}{view === 'status' && scope === 'configured' && <button type="button" className="text-button" onClick={() => setView('config')}>配置检测模型</button>}</td></tr>}</tbody></table></div>}
        <div className="table-footer"><span>{check === 'fingerprint' && view === 'status' ? fingerprintGroups.length + ' 个供应商' : rows.length + (view === 'history' ? ' 条记录' : ' 个模型')}</span><div className="pagination"><IconButton icon="back" label="上一页检测结果" disabled={current <= 1} onClick={() => setPage(current - 1)}/><span>{current} / {pages}</span><IconButton icon="arrow" label="下一页检测结果" disabled={current >= pages} onClick={() => setPage(current + 1)}/></div></div>
      </>}
    </>}
    {detail && <CheckDetail row={detail} name={name} catalog={catalog} onClose={() => setDetail(null)}/>}
    {fingerprint && <FingerprintTest canTest={testingAllowed(fingerprint.provider)} target={fingerprint} routeOptions={routesFor(fingerprint.provider, fingerprint.model)} routesLoading={distribution.loading && !distribution.data} routeWarning={distribution.data?.mode === 'allowlist' && !routesFor(fingerprint.provider, fingerprint.model).length ? '下游分发白名单未包含该模型' : ''} initialResult={fingerprintResults[JSON.stringify([fingerprint.provider, fingerprint.model])]} thinkingLevels={catalog.find(item => item.id === fingerprint.provider)?.thinkingLevels?.[fingerprint.model]} initialThinkingLevel={Object.hasOwn(manualThinking, fingerprint.model) ? manualThinking[fingerprint.model] : ''} onResult={result => setFingerprintResults(previous => ({ ...previous, [JSON.stringify([fingerprint.provider, fingerprint.model])]: result }))} onClose={() => setFingerprint(null)}/>}
    {manual && <ManualTest {...manual} persistedManualTests={data?.capabilities?.manualTests === true} thinkingLevels={catalog.find(item => item.id === manual.target.provider)?.thinkingLevels?.[manual.target.model]} initialThinkingLevel={Object.hasOwn(manualThinking, manual.target.model) ? manualThinking[manual.target.model] : ''} routeId={`${providerInfo(manual.target.provider, nodes.data?.nodes).prefix || manual.target.provider}/${manual.target.model}`} onClose={() => setManual(null)} onResult={row => { setManualResults(previous => ({ ...previous, [JSON.stringify([row.provider, row.model, row.check])]: row })); setManual(null); setDetail(row); resource.refresh(); }}/>}
  </>;
}

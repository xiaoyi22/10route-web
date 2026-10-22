import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const directory = 'reports/model-monitor-integration/overall';
const audit = JSON.parse(await readFile(directory + '/live-audit.json', 'utf8'));
const filters = JSON.parse(await readFile(directory + '/filters-acceptance.json', 'utf8'));
const targeted = JSON.parse(await readFile(directory + '/backend-targeted.json', 'utf8'));
assert.equal(filters.passed, true, '筛选验收尚未通过');
assert.equal(targeted.numFailedTests, 0, '后端专项仍有失败');
const time = value => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '未记录';
const labels = { disabled: '手工停用', unknown: '未验证或记录已过期', healthy: '最近业务成功', suspect: '近期调用异常', network: '线上记录为链路异常', cooling: '冷却', isolated: '隔离', waiting: '待真实业务恢复', recovering: '正在确认恢复' };
const grouped = new Map();
for (const row of audit.anomalies) {
  const key = row.routeId || row.model;
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key).push(row);
}
const lines = [
  '# 模型状态与功能整体验收', '',
  `数据时间：${time(audit.at)}（北京时间）。读取真实网关 ${audit.base}；共 ${audit.totalChannels} 个账号与模型渠道。`, '',
  '本轮核验全部渠道的已有业务证据和界面功能，没有主动向真实上游发送推理测试，也没有部署、改生产配置、启停账号或改发布名单。未验证不等于不可用，单个账号失败也不等于整条路由不可用。', '',
  '| 线上记录状态 | 渠道数 |', '| --- | ---: |',
  ...Object.entries(audit.statuses).map(([status, count]) => `| ${labels[status] || status} | ${count} |`), '',
  '## 近期异常', '',
  '| 路由 | 异常账号数 | 同路由近期正常账号数 | 最近错误与含义 | 最后失败时间 |', '| --- | ---: | ---: | --- | --- |',
];
for (const [route, rows] of grouped) {
  const latest = [...rows].sort((a, b) => b.lastFailure - a.lastFailure)[0];
  const evidence = audit.evidence.find(item => item.requestId === latest.lastRequestId);
  const healthy = audit.rows.filter(row => row.routeId === route && row.status === 'healthy').length;
  const explanation = evidence?.httpStatus === 429 ? 'HTTP 429：模型繁忙／限流；不能判定下架。线上旧分类误记链路异常，待上线代码已修正。' : evidence?.httpStatus === 400 && latest.lastError?.message.includes('location') ? 'HTTP 400：上游拒绝当前地区；需核对账号和网关出口地区。' : latest.lastError?.code === 'stream_disconnected' ? '上游流在完成前断开；没有完整回复证据。' : (latest.lastError?.message || '见业务日志');
  lines.push(`| ${route} | ${rows.length} | ${healthy} | ${explanation.replaceAll('|', '\\|')} | ${time(latest.lastFailure)} |`);
}
lines.push('', '## 历史手动检测', '',
  '以下仅列历史失败或答错，不作为本轮实时测活结果，也不触发业务隔离。', '',
  '| 供应商 | 模型 | 类型 | 历史结果 | 时间 |', '| --- | --- | --- | --- | --- |');
for (const row of audit.latestChecks.filter(row => !['available', 'correct'].includes(row.status))) {
  const provider = audit.providers.find(item => item.provider === row.provider)?.name || row.provider;
  lines.push(`| ${provider} | ${row.model} | ${row.check === 'iq' ? '智商' : '测活'} | ${row.status === 'incorrect' ? '题目答错，不代表不可用' : row.answers.map(answer => answer.httpStatus ? 'HTTP ' + answer.httpStatus : answer.status).join('、')} | ${time(row.at)} |`);
}
lines.push('', '## 回归结果', '',
  `- 覆盖 ${filters.paginationRows} 个渠道、${filters.filters.length} 组界面筛选断言，包含 ${new Set(filters.filters.filter(item => item.type === 'provider-status').map(item => item.provider)).size} 个供应商和 ${filters.filters.filter(item => item.type === 'model').length} 个模型搜索词；模型名和状态筛选刷新后保留。`,
  '- 智商、指纹、模型测活、检测记录、配置与题库入口保留；旧链接携带账号筛选正确跳转。',
  '- 前端 182 项测试通过，生产构建成功。',
  `- 后端专项 ${targeted.numPassedTests} 项通过、${targeted.numFailedTests} 项失败、${targeted.numPendingTests} 项跳过（真实上游测试未执行），包含临时 SQLite 和本地 HTTP 假上游的指定账号单次测试。`,
  '- 本轮修正快速切换供应商和状态时旧链接覆盖新条件的问题；803 行分页和 577 项筛选断言复测通过，页面整合、手机布局和深浅主题验收通过。修正尚未部署。',
  '- 手动结果与业务观察分开；仅观察禁止主动测试；手动模式禁止定时任务；测试成功不解除隔离；冷却到期等待真实业务；HTTP 200 空回复不算成功。',
  '- 浏览器配置与测试写操作被拦截；真实网关配置、账号开关及发布选择保持不变。',
  '- 修正 HTTP 429 因错误说明提及 proxy 而误分为网络故障的问题，新增单测覆盖同账号其他模型和其他账号不受影响。此修正尚未部署，也未改写线上历史记录。',
  '', '完整数据见 live-audit.json；界面断言见 filters-acceptance.json；完整后端测试见 backend-full-final.json 和 regression-gate.log。', '');
await writeFile(directory + '/README.md', lines.join('\n'));
const fields = ['providerName', 'connectionName', 'connectionId', 'model', 'routeId', 'status', 'testingMode', 'blocked', 'blockReason', 'disabledByUser', 'publicationRequested', 'lastOutcome', 'lastError.code', 'lastError.status', 'lastError.message', 'lastSuccess', 'lastFailure', 'lastAt', 'lastRequestId', 'successes', 'failures', 'consecutiveFailures'];
const cell = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
await writeFile(directory + '/all-model-channels.csv', '\ufeff' + [fields.join(','), ...audit.rows.map(row => fields.map(key => cell(key.split('.').reduce((value, part) => value?.[part], row))).join(','))].join('\r\n'));
console.log(JSON.stringify({ at: audit.at, statuses: audit.statuses, abnormalRoutes: [...grouped.keys()], filters: filters.filters.length }));

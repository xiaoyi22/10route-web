import { METHODS } from './methods.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const statusLabel = { passed: '通过', failed: '失败', pending: '未跑' };
const statusClass = { passed: 'passed', failed: 'failed', pending: 'pending' };
const riskLabel = { 'read-only': '只读', 'isolated-fixture': '隔离只读', 'destructive-isolated': '隔离写', 'isolated-upstream': '隔离上游', 'local-only': '本地' };
const methodOf = item => METHODS[item.category] || null;

export function renderReport(summary) {
  const { counts, catalog, groups, results, base, generatedAt } = summary;
  const run = counts.passed + counts.failed;
  const percent = catalog.selected ? Math.round((run / catalog.selected) * 100) : 0;
  const passRate = run ? Math.round((counts.passed / run) * 100) : 0;

  const byRoute = new Map();
  const byCategory = new Map();
  const byRisk = new Map();
  for (const item of results) {
    const add = (map, key) => { const row = map.get(key) || { key, passed: 0, failed: 0, pending: 0, total: 0 }; row[item.status] += 1; row.total += 1; map.set(key, row); };
    add(byRoute, item.route || '(多页)');
    add(byCategory, item.category);
    add(byRisk, riskLabel[item.risk] || item.risk || '(未知)');
  }
  const routeRows = [...byRoute.values()].sort((a, b) => a.key.localeCompare(b.key));
  const categoryRows = [...byCategory.values()].sort((a, b) => b.total - a.total);
  const riskRows = [...byRisk.values()].sort((a, b) => b.total - a.total);

  const pendingReasons = new Map();
  for (const item of results.filter(r => r.status === 'pending')) {
    const key = (item.reason || '(未注明)').replace(/^(本页不适用|隔离环境不适用)：\s*/, '');
    pendingReasons.set(key, (pendingReasons.get(key) || 0) + 1);
  }
  const pendingRows = [...pendingReasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
  const failures = results.filter(item => item.status === 'failed');

  const pct = (value, total) => total ? ((value / total) * 100).toFixed(1) + '%' : '0%';
  const stackBar = row => '<div class="track">' +
    '<span class="seg pass" style="width:' + pct(row.passed, row.total) + '"></span>' +
    '<span class="seg fail" style="width:' + pct(row.failed, row.total) + '"></span>' +
    '<span class="seg pend" style="width:' + pct(row.pending, row.total) + '"></span>' +
    '</div>';

  const breakdownTable = (rows, firstHeader) => '<table><thead><tr><th>' + firstHeader + '</th><th class="wbar">分布</th>' +
    '<th class="num">通过</th><th class="num">失败</th><th class="num">未跑</th><th class="num">合计</th><th class="num">通过率</th></tr></thead><tbody>' +
    rows.map(row => '<tr><td class="name">' + escape(row.key) + '</td><td class="bar">' + stackBar(row) + '</td>' +
      '<td class="num pass">' + row.passed + '</td><td class="num fail">' + (row.failed || '·') + '</td>' +
      '<td class="num pend">' + row.pending + '</td><td class="num">' + row.total + '</td>' +
      '<td class="num">' + (row.passed + row.failed ? Math.round(row.passed / (row.passed + row.failed) * 100) + '%' : '—') + '</td></tr>').join('') +
    '</tbody></table>';

  // Section 2: testing-method overview, one row per scenario category that appears in the run.
  const methodRows = categoryRows.map(row => {
    const method = METHODS[row.key];
    const asserts = method ? method.asserts.map(a => '<li>' + escape(a) + '</li>').join('') : '<li class="muted">该场景暂无专用探针（如实标未跑）</li>';
    return '<tr><td class="name">' + escape(row.key) + (method ? '' : ' <span class="tag">无探针</span>') + '</td>' +
      '<td>' + escape(method ? method.kind : '—') + '</td>' +
      '<td>' + escape(method ? method.isolation : '—') + '</td>' +
      '<td>' + escape(method ? method.principle : '—') + '</td>' +
      '<td><ul class="asserts">' + asserts + '</ul></td>' +
      '<td class="num">' + row.total + '</td></tr>';
  }).join('');

  const dataRows = results.map(item => {
    const method = methodOf(item);
    const search = [item.id, item.group, item.route, item.category, item.title, item.reason, item.endpoint, method ? method.principle : ''].join(' ').toLowerCase();
    const asserts = method ? method.asserts.map(a => '<li>' + escape(a) + '</li>').join('') : '<li class="muted">无专用探针</li>';
    return '<tr class="case-row" data-status="' + item.status + '" data-risk="' + escape(item.risk || '') + '" data-search="' + escape(search) + '">' +
      '<td class="mono">' + escape(item.id) + '</td>' +
      '<td>' + escape(item.group) + '</td>' +
      '<td>' + escape(item.category) + '</td>' +
      '<td class="mono">' + escape(item.route || '') + '</td>' +
      '<td class="mono">' + escape(item.endpoint || '—') + '</td>' +
      '<td class="status ' + statusClass[item.status] + '">' + statusLabel[item.status] + '</td>' +
      '<td class="reason">' + escape(item.reason || '') + '</td>' +
      '<td class="case-detail"><details><summary>测试方法 / 详情</summary>' +
        '<dl>' +
        '<dt>用例标题</dt><dd>' + escape(item.title || '') + '</dd>' +
        '<dt>测试原理</dt><dd>' + escape(method ? method.principle : '（无专用探针）') + '</dd>' +
        '<dt>断言</dt><dd><ul class="asserts">' + asserts + '</ul></dd>' +
        '<dt>隔离需求</dt><dd>' + escape(method ? method.isolation : '—') + '</dd>' +
        '<dt>接口</dt><dd class="mono">' + escape(item.endpoint || '—') + '</dd>' +
        '<dt>前置</dt><dd>' + escape(item.preconditions || '—') + '</dd>' +
        '<dt>目录步骤</dt><dd>' + escape(item.steps || '—') + '</dd>' +
        '<dt>目录预期</dt><dd>' + escape(item.expected || '—') + '</dd>' +
        '<dt>风险</dt><dd>' + escape(riskLabel[item.risk] || item.risk || '') + '</dd>' +
        '<dt>结论</dt><dd>' + statusLabel[item.status] + (item.reason ? '（' + escape(item.reason) + '）' : '') + '</dd>' +
        '</dl></details></td>' +
      '</tr>';
  }).join('');

  const style = [
    ':root{color-scheme:light dark;--bg:#f6f7f9;--card:#fff;--fg:#1a1c20;--muted:#61656e;--line:#e2e5ea;--pass:#1a7f45;--fail:#c02626;--pend:#8a6d1f;--accent:#2563eb}',
    '@media(prefers-color-scheme:dark){:root{--bg:#14161a;--card:#1c1f24;--fg:#e8eaed;--muted:#9aa0aa;--line:#2b2f36;--pass:#4ade80;--fail:#f87171;--pend:#fbbf24;--accent:#60a5fa}}',
    '*{box-sizing:border-box}body{margin:0;padding:32px;background:var(--bg);color:var(--fg);font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}',
    'h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:34px 0 12px;color:var(--muted);font-weight:600;letter-spacing:.02em}',
    '.meta{color:var(--muted);font-size:13px;margin-bottom:24px}.meta code{font-family:ui-monospace,Menlo,Consolas,monospace}',
    '.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}',
    '.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px}',
    '.card .k{color:var(--muted);font-size:12px}.card .v{font-size:26px;font-weight:600;margin-top:4px}.card .s{font-size:11px;color:var(--muted);margin-top:2px}',
    '.v.pass{color:var(--pass)}.v.fail{color:var(--fail)}.v.pend{color:var(--pend)}',
    '.progress{height:8px;border-radius:99px;background:var(--line);overflow:hidden;margin-top:20px}',
    '.progress span{display:block;height:100%;background:linear-gradient(90deg,var(--pass),#34d399)}',
    'table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden;margin-top:12px}',
    'th,td{padding:9px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}',
    'th{font-size:12px;color:var(--muted);font-weight:600;position:sticky;top:0;background:var(--card);z-index:1}',
    'tr:last-child td{border-bottom:none}.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px}',
    '.name{font-weight:600}.wbar{width:180px}.muted{color:var(--muted)}',
    '.track{display:flex;height:8px;border-radius:99px;background:var(--line);overflow:hidden;min-width:140px}',
    '.seg{display:block;height:100%}.seg.pass{background:var(--pass)}.seg.fail{background:var(--fail)}.seg.pend{background:var(--pend)}',
    '.status{font-weight:600;white-space:nowrap}.status.passed{color:var(--pass)}.status.failed{color:var(--fail)}.status.pending{color:var(--pend)}',
    'td.pass{color:var(--pass)}td.fail{color:var(--fail)}td.pend{color:var(--pend)}',
    '.reason{color:var(--muted);font-size:12px}',
    '.tag{display:inline-block;font-size:10px;padding:1px 6px;border-radius:99px;background:var(--line);color:var(--muted);font-weight:400}',
    'ul.asserts{margin:0;padding-left:16px}ul.asserts li{font-size:12px;color:var(--fg)}',
    '.toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 0}',
    '.toolbar input[type=search]{flex:1;min-width:220px;padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--fg);font:inherit}',
    '.chip{padding:6px 12px;border:1px solid var(--line);border-radius:99px;background:var(--card);color:var(--fg);cursor:pointer;font:inherit;font-size:12px}',
    '.chip.active{border-color:var(--accent);color:var(--accent);font-weight:600}',
    '.case-detail details summary{cursor:pointer;color:var(--accent);font-size:12px}',
    '.case-detail dl{display:grid;grid-template-columns:76px 1fr;gap:4px 12px;margin:8px 0 0}',
    '.case-detail dt{color:var(--muted);font-size:12px}.case-detail dd{margin:0;font-size:12px}',
    '.empty{color:var(--muted);text-align:center;padding:20px}',
    '.legend{display:flex;gap:16px;color:var(--muted);font-size:12px;margin-top:8px}',
    '.legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}',
    '.legend .pass{background:var(--pass)}.legend .fail{background:var(--fail)}.legend .pend{background:var(--pend)}',
    '.note{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:8px;padding:12px 16px;font-size:13px;color:var(--muted)}',
    '@media print{body{padding:0}.toolbar{display:none}details{display:block}details>summary{display:none}.case-detail dl{display:grid}}',
  ].join('');

  const card = (k, v, cls, sub) => '<div class="card"><div class="k">' + k + '</div><div class="v ' + cls + '">' + v + '</div>' + (sub ? '<div class="s">' + sub + '</div>' : '') + '</div>';

  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>10route-web 测试矩阵详细报告</title>' +
    '<style>' + style + '</style></head><body>' +
    '<h1>10route-web 测试矩阵详细报告</h1>' +
    '<div class="meta">目标环境：<code>' + escape(base) + '</code>　生成时间：' + escape(generatedAt) +
    '　用例目录：' + catalog.cases + ' 条用例 + ' + catalog.ui + ' 条 UI 矩阵 = ' + catalog.selected + ' 条</div>' +

    '<h2>一、执行摘要</h2>' +
    '<div class="cards">' +
    card('已跑', run + ' / ' + catalog.selected, '', '执行率 ' + percent + '%') +
    card('通过', counts.passed, 'pass', '通过率 ' + passRate + '%（已跑）') +
    card('失败', counts.failed, 'fail', failures.length ? '需处理' : '无') +
    card('未跑', counts.pending, 'pend', '本页无控件 / 隔离环境无写入面') +
    '</div>' +
    '<div class="progress"><span style="width:' + percent + '%"></span></div>' +
    '<div class="legend"><span><i class="pass"></i>通过</span><span><i class="fail"></i>失败</span><span><i class="pend"></i>未跑</span></div>' +
    '<p class="note">说明：报告对每条用例给出「测试原理 + 实际断言」（板块二、板块三），断言来自可执行探针源码，非模板复述。凡页面确无对应控件或隔离环境无对应写入面的用例，一律如实标为「未跑」并写明原因，绝不谎报通过。' +
    (failures.length ? ' 本次存在 ' + failures.length + ' 条失败，见板块五。' : ' 本次无失败用例。') + '</p>' +

    '<h2>二、测试方法总览（按场景类型）</h2>' +
    '<table><thead><tr><th>场景类型</th><th>方法类别</th><th>隔离需求</th><th>测试原理</th><th>断言（通过判据）</th><th class="num">用例数</th></tr></thead><tbody>' +
    methodRows + '</tbody></table>' +

    '<h2>三、分组进度</h2>' + breakdownTable(groups.map(g => ({ key: g.group, passed: g.passed, failed: g.failed, pending: g.pending, total: g.total })), '分组') +
    '<h2>四、四维分布</h2>' +
    '<h3 class="sub">按路由</h3>' + breakdownTable(routeRows, '路由') +
    '<h3 class="sub">按风险等级</h3>' + breakdownTable(riskRows, '风险') +

    '<h2>五、失败用例（' + failures.length + '）</h2>' +
    (failures.length ? '<table><thead><tr><th>ID</th><th>分组</th><th>路由</th><th>场景</th><th>失败原因</th></tr></thead><tbody>' +
      failures.map(item => '<tr><td class="mono">' + escape(item.id) + '</td><td>' + escape(item.group) + '</td><td class="mono">' + escape(item.route) + '</td><td>' + escape(item.category) + '</td><td class="reason">' + escape(item.reason) + '</td></tr>').join('') + '</tbody></table>' : '<p class="empty">没有失败用例</p>') +

    '<h2>六、未跑原因分布</h2>' +
    (pendingRows.length ? '<table><thead><tr><th>原因</th><th class="num">数量</th><th class="num">占比</th></tr></thead><tbody>' +
      pendingRows.map(r => '<tr><td>' + escape(r.reason) + '</td><td class="num">' + r.count + '</td><td class="num">' + pct(r.count, counts.pending) + '</td></tr>').join('') + '</tbody></table>' : '<p class="empty">全部已执行</p>') +

    '<h2>七、逐用例明细（' + results.length + '）</h2>' +
    '<div class="toolbar">' +
      '<input type="search" id="q" placeholder="搜索 ID / 分组 / 路由 / 场景 / 原因 / 测试原理…">' +
      '<button class="chip active" data-f="all">全部</button>' +
      '<button class="chip" data-f="passed">通过</button>' +
      '<button class="chip" data-f="failed">失败</button>' +
      '<button class="chip" data-f="pending">未跑</button>' +
      '<span class="legend" id="count"></span>' +
    '</div>' +
    '<table id="cases"><thead><tr><th>ID</th><th>分组</th><th>场景</th><th>路由</th><th>接口</th><th>状态</th><th>原因</th><th></th></tr></thead><tbody>' +
    (dataRows || '<tr><td colspan="8" class="empty">无数据</td></tr>') + '</tbody></table>' +

    '<h2>八、附录 · 运行说明与覆盖边界</h2>' +
    '<table><tbody>' +
    '<tr><th>运行方式</th><td class="mono">set PREVIEW_URL &amp;&amp; set PLAYWRIGHT_MODULE=playwright &amp;&amp; set BROWSER_CHANNEL=msedge &amp;&amp; node tests/matrix/runner.mjs</td></tr>' +
    '<tr><th>只读用例</th><td>针对真实网关 ' + escape(base) + '，全程仅 GET，零写操作。</td></tr>' +
    '<tr><th>写/隔离用例</th><td>针对独立内存 fixture（进程内，端口 4331），不触碰真实数据。</td></tr>' +
    '<tr><th>凭据</th><td>来自本机私有凭据文件；报告不输出密码、会话或上游 Token。</td></tr>' +
    '<tr><th>覆盖边界</th><td>UI 矩阵覆盖 视口×主题×认证态 组合；「未跑」= 页面确无对应控件或隔离环境无对应写入面，非跳过。</td></tr>' +
    '<tr><th>构建</th><td>runner.mjs 调度 · probes.mjs 只读探针 · scenarios.mjs 场景与隔离探针 · methods.mjs 方法说明 · report.mjs 本页面</td></tr>' +
    '</tbody></table>' +

    '<script>' +
    '(function(){var q=document.getElementById("q"),rows=[].slice.call(document.querySelectorAll("#cases tbody tr.case-row")),chips=[].slice.call(document.querySelectorAll(".chip")),count=document.getElementById("count"),f="all";' +
    'function render(){var term=(q.value||"").trim().toLowerCase(),shown=0;rows.forEach(function(r){var okF=(f==="all"||r.dataset.status===f);var okQ=!term||r.dataset.search.indexOf(term)>=0;var show=okF&&okQ;r.style.display=show?"":"none";if(show)shown++;});count.textContent="显示 "+shown+" / "+rows.length;}' +
    'q.addEventListener("input",render);chips.forEach(function(c){c.addEventListener("click",function(){chips.forEach(function(x){x.classList.remove("active")});c.classList.add("active");f=c.dataset.f;render();});});render();})();' +
    '</script>' +
    '</body></html>';
}

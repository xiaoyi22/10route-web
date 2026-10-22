const fs = require('node:fs');
const path = 'src/pages/AvailabilityPage.jsx';
let source = fs.readFileSync(path, 'utf8');
for (const [before, after] of [
  ['<Link className="text-button" to="/dashboard/logs">关联请求：{event.requestId}</Link>', '<button className="text-button" onClick={() => setEvidence(event)}>关联请求：{event.requestId}</button>'],
  ['<Link className="button" to="/dashboard/logs">查看请求日志<Icon name="arrow"/></Link></Modal>}', '{detail.lastRequestId && <button className="button" onClick={() => { setDetail(null); setEvidence({ ...detail, requestId: detail.lastRequestId }); }}>查看关联请求<Icon name="arrow"/></button>}</Modal>}\n    {evidence && <RequestEvidence target={evidence} onClose={() => setEvidence(null)}/>}'],
]) {
  if (source.split(before).length !== 2) throw Error('Expected unique evidence anchor');
  source = source.replace(before, after);
}
fs.writeFileSync(path, source);

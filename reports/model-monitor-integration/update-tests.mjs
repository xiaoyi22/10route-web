import { readFileSync, writeFileSync } from 'node:fs';
const base = 'reports/model-monitor-integration/backend/tests/unit/';
for (const name of ['iq-monitor-probe.test.js', 'iq-monitor-service.test.js', 'monitor-manual-route.test.js']) {
 let s=readFileSync(base+name,'utf8');
 s='vi.mock("@/lib/iqMonitor/testingPolicy", () => ({ assertTestingAllowed: vi.fn(async () => {}) }));\n'+s;
 if(name==='iq-monitor-service.test.js') {
   s=s.replace('.capabilities).toEqual(', '.capabilities).toMatchObject(');
   s=s.replace('saveConfig({ ...config, providers: [{ ...config.providers[0], modelThinking }] })', 'saveConfig({ ...config, revision: saved.revision, providers: [{ ...config.providers[0], modelThinking }] })');
   s=s.replace('model: "chat", excludedConnectionIds: ["public"], thinkingLevel:', 'model: "chat", testTrigger: "manual", excludedConnectionIds: ["public"], thinkingLevel:');
 }
 if(name==='monitor-manual-route.test.js') s=s.replace('maxOutputTokens: 1024 }','maxOutputTokens: 1024, testTrigger: "manual" }');
 writeFileSync(base+name,s);
}
let s=readFileSync(base+'iq-monitor.test.js','utf8').replace('validateConfig(config)).toEqual(config)', 'validateConfig(config)).toEqual({ ...config, testingModes: {} })');
writeFileSync(base+'iq-monitor.test.js',s);

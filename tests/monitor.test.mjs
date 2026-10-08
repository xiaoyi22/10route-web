import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as monitorApi from '../src/api/monitor.js';
import { explicitMonitorConfig, toggleMonitorModel, monitorTargets, recentChecks, checkLatency, manualCheckRow, monitorThinkingOptions, saveMonitorConfig } from '../src/api/monitor.js';

test('missing thinking metadata permits generic strengths without overriding known restrictions', () => {
  const generic = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
  assert.deepEqual(monitorThinkingOptions(undefined), generic);
  assert.deepEqual(monitorThinkingOptions(null), generic);
  assert.deepEqual(monitorThinkingOptions([]), []);
  assert.deepEqual(monitorThinkingOptions(['low', 'high']), ['low', 'high']);
});

test('legacy backends reject strength saves before writing any configuration', async () => {
  const config = { providers: [{ id: 'one', modelThinking: { a: 'high' } }] };
  const methods = [];
  await assert.rejects(saveMonitorConfig(config, async (_url, options = {}) => {
    methods.push(options.method || 'GET');
    return { config };
  }), /当前后端尚不支持保存思考强度/);
  assert.deepEqual(methods, ['GET']);
});

test('thinking saves verify the response and persisted readback', async () => {
  const config = { providers: [{ id: 'one', modelThinking: { a: 'high' } }] };
  const dropped = { providers: [{ id: 'one' }] };
  for (const dropAt of ['PUT', 'readback']) {
    let reads = 0;
    await assert.rejects(saveMonitorConfig(config, async (_url, options = {}) => {
      if (options.method === 'PUT') return { config: dropAt === 'PUT' ? dropped : config };
      reads++;
      return { capabilities: { modelThinking: true }, config: reads > 1 && dropAt === 'readback' ? dropped : config };
    }), /思考强度未完整保存/);
  }
  const methods = [];
  const saved = await saveMonitorConfig(config, async (_url, options = {}) => {
    methods.push(options.method || 'GET');
    return { capabilities: { modelThinking: true }, config };
  });
  assert.deepEqual(saved.config, config);
  assert.deepEqual(methods, ['GET', 'PUT', 'GET']);
});

test('saving the gateway default verifies override removal and keeps ordinary legacy saves working', async () => {
  const config = { providers: [{ id: 'one', modelThinking: {} }] };
  await assert.rejects(saveMonitorConfig(config, async () => ({ config: { providers: [{ id: 'one', modelThinking: { a: 'high' } }] } })), /思考强度未完整保存/);
  const ordinary = { providers: [{ id: 'one' }] };
  const methods = [];
  await saveMonitorConfig(ordinary, async (_url, options = {}) => { methods.push(options.method); return { config: ordinary }; });
  assert.deepEqual(methods, ['PUT']);
});

test('legacy selections preserve check bindings/exclusions and freeze explicit models', () => {
  const catalog = [{ id: 'a', models: ['one', 'two'] }];
  const original = { enabled: true, providers: [{ id: 'a', mode: 'all', models: [], checks: ['availability'], modelChecks: { two: ['iq'] }, excludedConnectionIds: ['private'] }], questions: [] };
  const config = explicitMonitorConfig(original, catalog);
  assert.deepEqual(config.providers[0].modelChecks, { one: ['availability'], two: ['iq'] });
  assert.deepEqual(config.providers[0].excludedConnectionIds, ['private']);
  assert.equal(original.providers[0].mode, 'all');
  const targets = monitorTargets(config, [{ id: 'a', models: ['one', 'two', 'new'] }]);
  assert.deepEqual(targets, [{ provider: 'a', model: 'one', check: 'availability' }, { provider: 'a', model: 'two', check: 'iq' }]);
  const updated = toggleMonitorModel(config.providers[0], 'one', 'iq', true);
  assert.deepEqual(updated.modelChecks.one, ['availability', 'iq']);
  assert.deepEqual(toggleMonitorModel(toggleMonitorModel(updated, 'one', 'iq', false), 'one', 'availability', false).models, ['two']);
});

test('thinking strengths survive model edits and apply only to IQ targets', () => {
  const config = { providers: [{ id: 'one', mode: 'selected', models: ['a'], modelChecks: { a: ['availability', 'iq'] }, modelThinking: { a: 'high' } }] };
  const catalog = [{ id: 'one', models: ['a'], thinkingLevels: { a: ['none', 'low', 'high'] } }];
  const explicit = explicitMonitorConfig(config, catalog);
  assert.deepEqual(explicit.providers[0].modelThinking, { a: 'high' });
  assert.deepEqual(monitorTargets(explicit, catalog), [
    { provider: 'one', model: 'a', check: 'availability' },
    { provider: 'one', model: 'a', check: 'iq', thinkingLevel: 'high' },
  ]);
  assert.deepEqual(toggleMonitorModel(explicit.providers[0], 'a', 'iq', false).modelThinking, { a: 'high' });
});

test('status history keeps providers and detection types separate, limits real entries', () => {
  const history = Array.from({ length: 35 }, (_, at) => ({ provider: 'a', model: 'one', check: 'availability', at }));
  history.push({ provider: 'b', model: 'one', check: 'availability', at: 100 }, { provider: 'a', model: 'one', check: 'iq', at: 101 });
  const recent = recentChecks(history, 'a', 'one', 'availability');
  assert.equal(recent.length, 30);
  assert.equal(recent[0].at, 34);
  assert.equal(recent.at(-1).at, 5);
  assert.equal(recentChecks([{ provider: 'a', model: 'one', at: 9 }], 'a', 'one', 'iq').length, 1);
});

test('recent monitor summary counts the last thirty checks instead of latest passing models', () => {
  assert.equal(typeof monitorApi.summarizeMonitorChecks, 'function', 'Monitor cards need record-based summary');
  const targets = [{ provider: 'a', model: 'one', check: 'iq' }];
  const history = Array.from({ length: 35 }, (_, index) => ({ ...targets[0], at: 100 - index, status: index >= 1 && index <= 5 ? 'error' : 'correct' }));
  const before = structuredClone(history);
  assert.deepEqual(monitorApi.summarizeMonitorChecks(history, targets, 'iq'), { total: 30, passed: 25, failed: 5, ungraded: 0, passRate: 25 / 30 * 100 });
  assert.deepEqual(history, before, 'Summary must not mutate backend history');
});

test('monitor summary counts anomalies across recovery instead of resetting to latest state', () => {
  const target = { provider: 'a', model: 'one', check: 'iq' };
  const history = [{ ...target, at: 1, status: 'correct' }];
  assert.equal(monitorApi.summarizeMonitorChecks(history, [target], 'iq').passed, 1);
  history.push({ ...target, at: 2, status: 'error' });
  assert.deepEqual(monitorApi.summarizeMonitorChecks(history, [target], 'iq'), { total: 2, passed: 1, failed: 1, ungraded: 0, passRate: 50 });
  history.push({ ...target, at: 3, status: 'correct' });
  const summary = monitorApi.summarizeMonitorChecks(history, [target], 'iq');
  assert.equal(summary.passed, 2);
  assert.equal(summary.failed, 1);
});

test('monitor summary filters by scoped provider/model/check and uses a shared thirty-record window', () => {
  const first = { provider: 'a', model: 'same', check: 'iq' };
  const second = { provider: 'b', model: 'same', check: 'iq' };
  const history = Array.from({ length: 40 }, (_, index) => ({ ...(index % 2 ? second : first), at: index, status: index % 2 ? 'error' : 'correct' }));
  history.push({ ...first, check: 'availability', at: 100, status: 'available' }, { ...first, model: 'outside', at: 101, status: 'error' }, { ...first, at: NaN, status: 'error' });
  assert.deepEqual(monitorApi.summarizeMonitorChecks(history, [first, second, first], 'iq'), { total: 30, passed: 15, failed: 15, ungraded: 0, passRate: 50 });
  assert.deepEqual(monitorApi.summarizeMonitorChecks(history, [first], 'iq'), { total: 20, passed: 20, failed: 0, ungraded: 0, passRate: 100 });
  assert.equal(monitorApi.summarizeMonitorChecks(history, [{ ...second, check: 'availability' }], 'iq').total, 0);
});

test('monitor summary separates ungraded checks from anomalies and excludes them from pass rate', () => {
  const target = { provider: 'a', model: 'one', check: 'iq' };
  const statuses = ['correct', 'incorrect', 'rate_limited', 'timeout', 'error', 'pending', 'ungraded', 'unknown'];
  const history = statuses.map((status, at) => ({ ...target, status, at }));
  assert.deepEqual(monitorApi.summarizeMonitorChecks(history, [target], 'iq'), { total: 8, passed: 1, failed: 4, ungraded: 3, passRate: 20 });
  assert.deepEqual(monitorApi.summarizeMonitorChecks([], [target], 'iq'), { total: 0, passed: 0, failed: 0, ungraded: 0, passRate: null });
  assert.equal(monitorApi.summarizeMonitorChecks([{ ...target, at: 1, status: 'ungraded' }], [target], 'iq').passRate, null);
  assert.equal(monitorApi.summarizeMonitorChecks([{ ...target, at: 1, status: 'error' }], [target], 'iq').passRate, 0);
});

test('legacy IQ rows remain supported without mixing availability history', () => {
  const target = { provider: 'a', model: 'one' };
  const history = [{ ...target, at: 0, status: 'correct' }, { ...target, at: 1, check: 'availability', status: 'available' }];
  assert.equal(monitorApi.summarizeMonitorChecks(history, [target], 'iq').passed, 1);
  assert.equal(monitorApi.summarizeMonitorChecks(history, [{ ...target, check: 'availability' }], 'availability').passed, 1);
  assert.equal(monitorApi.summarizeMonitorChecks(history, [], 'iq').total, 0);
});

test('missing durations and transport failures are not fabricated scores', () => {
  assert.equal(checkLatency({ answers: [{ latencyMs: 0 }, { latencyMs: 100 }] }), 100);
  assert.equal(checkLatency({ answers: [{ latencyMs: 100 }, {}] }), null);
  assert.equal(checkLatency({ answers: [] }), null);
  assert.equal(manualCheckRow({ ok: false, status: 429 }, {}, 'iq').score, null);
  assert.equal(manualCheckRow({ ok: false, status: 429 }, {}, 'iq').status, 'rate_limited');
  assert.equal(manualCheckRow({ ok: true }, {}, 'iq').status, 'ungraded');
  assert.equal(manualCheckRow({ ok: true }, {}, 'iq').score, null);
  assert.equal(manualCheckRow({ ok: true, iq: {} }, {}, 'iq').score, null);
  const wrong = manualCheckRow({ ok: true, status: 200, iq: { correct: false } }, {}, 'iq');
  assert.equal(wrong.status, 'incorrect');
  assert.equal(wrong.score, 0);
  assert.equal(wrong.answers[0].httpStatus, 200);
});

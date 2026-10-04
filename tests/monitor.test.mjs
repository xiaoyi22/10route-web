import assert from 'node:assert/strict';
import { test } from 'node:test';
import { explicitMonitorConfig, toggleMonitorModel, monitorTargets, recentChecks, checkLatency, manualCheckRow } from '../src/api/monitor.js';

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

test('status history keeps providers and detection types separate, limits real entries', () => {
  const history = Array.from({ length: 35 }, (_, at) => ({ provider: 'a', model: 'one', check: 'availability', at }));
  history.push({ provider: 'b', model: 'one', check: 'availability', at: 100 }, { provider: 'a', model: 'one', check: 'iq', at: 101 });
  const recent = recentChecks(history, 'a', 'one', 'availability');
  assert.equal(recent.length, 30);
  assert.equal(recent[0].at, 34);
  assert.equal(recent.at(-1).at, 5);
  assert.equal(recentChecks([{ provider: 'a', model: 'one', at: 9 }], 'a', 'one', 'iq').length, 1);
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

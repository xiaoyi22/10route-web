import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newState, setConfig, recordOutcome, decision, channelKey, controlChannel, claimRecovery, rowStatus, classifyOutcome } from '../reports/model-availability/backend/src/lib/availability/core.js';
import { isBusinessRequest } from '../reports/model-availability/backend/src/shared/utils/businessObservation.js';
import { availabilityLink, connectionAvailability, summarizeAvailability } from '../src/api/availability.js';
import { isAllowedRequest } from '../src/api/policy.js';

const base = 2000000000000;
const detail = (id, overrides = {}) => ({ id, observationSource: 'business', provider: 'station', connectionId: 'account-a', model: 'grok', timestamp: new Date(base + 10000).toISOString(), status: 'error', response: { status: 503 }, error: { status: 503, message: 'upstream unavailable' }, latency: { total: 100 }, ...overrides });
const automatic = () => { const state = newState(base); setConfig(state, { ...state.config, mode: 'auto', providers: ['station'] }, base); return state; };
const row = state => state.channels[channelKey('station', 'account-a', 'grok')];

test('observation mode records errors but never isolates or reports healthy without evidence', () => {
  const state = newState(base);
  for (let i = 0; i < 5; i++) recordOutcome(state, detail('fail-' + i), base + 10000 + i);
  assert.equal(row(state).failures, 5);
  assert.equal(decision(state, 'station', 'account-a', 'grok', base + 20000).blocked, false);
  assert.equal(rowStatus(state, row(state), base + 20000), 'suspect');
  assert.equal(rowStatus(state, { provider: 'station', connectionId: 'b', model: 'grok' }, base), 'unknown');
});

test('transient isolation is limited to its account and model after three real failures', () => {
  const state = automatic();
  for (let i = 0; i < 3; i++) recordOutcome(state, detail('fail-' + i), base + 10000 + i);
  assert.equal(decision(state, 'station', 'account-a', 'grok', base + 20000).blocked, true);
  assert.equal(decision(state, 'station', 'account-b', 'grok', base + 20000).blocked, false);
  assert.equal(decision(state, 'station', 'account-a', 'other', base + 20000).blocked, false);
});

test('expired failure windows do not accumulate into an isolation', () => {
  const state = automatic();
  for (let i = 0; i < 3; i++) recordOutcome(state, detail('spaced-' + i), base + 10000 + i * 20 * 60000);
  assert.equal(row(state).failureTimes.length, 1);
  assert.equal(decision(state, 'station', 'account-a', 'grok', base + 50 * 60000).blocked, false);
});

test('explicit credential failures isolate an account but do not disable another account', () => {
  const state = automatic();
  recordOutcome(state, detail('auth', { error: { status: 401, message: 'Invalid API key' } }), base + 10000);
  assert.equal(decision(state, 'station', 'account-a', 'other', base + 20000).blocked, true);
  assert.equal(decision(state, 'station', 'account-b', 'grok', base + 20000).blocked, false);
});

test('unknown forbidden responses and proxy outages do not auto-isolate', () => {
  for (const error of [{ status: 403, message: 'Permission denied' }, { status: 502, message: 'fetch failed ECONNREFUSED proxy' }]) {
    const state = automatic();
    for (let i = 0; i < 5; i++) recordOutcome(state, detail('link-' + i, { error }), base + 10000 + i);
    assert.equal(decision(state, 'station', 'account-a', 'grok', base + 20000).blocked, false);
  }
});

test('model removal does not pause other models on the same account', () => {
  const state = automatic();
  recordOutcome(state, detail('removed', { error: { status: 404, message: 'model_not_found' } }), base + 10000);
  assert.equal(decision(state, 'station', 'account-a', 'grok', base + 20000).blocked, true);
  assert.equal(decision(state, 'station', 'account-a', 'other', base + 20000).blocked, false);
});

test('cooldown expiry waits for exactly one real recovery request and never marks healthy by time', () => {
  const state = automatic();
  recordOutcome(state, detail('limited', { error: { status: 429, message: 'Rate limited' } }), base + 10000);
  const after = base + 11 * 60000;
  assert.equal(rowStatus(state, row(state), after), 'waiting');
  assert.equal(claimRecovery(state, 'station', 'account-a', 'grok', after), true);
  assert.equal(claimRecovery(state, 'station', 'account-a', 'grok', after + 1), false);
  recordOutcome(state, detail('restored', { timestamp: new Date(after + 10000).toISOString(), status: 'success', response: { content: 'Actual business reply' }, error: undefined }), after + 10000);
  assert.equal(rowStatus(state, row(state), after + 11000), 'healthy');
  assert.equal(row(state).autoBlock, undefined);
});

test('late completions and late errors cannot undo newer isolation or manual release', () => {
  const state = automatic();
  recordOutcome(state, detail('limited', { error: { status: 429, message: 'limited' } }), base + 10000);
  recordOutcome(state, detail('old-success', { timestamp: new Date(base + 20000).toISOString(), latency: { total: 20000 }, status: 'success', response: { content: 'old reply' }, error: undefined }), base + 20000);
  assert.equal(decision(state, 'station', 'account-a', 'grok', base + 21000).blocked, true);
  controlChannel(state, { provider: 'station', connectionId: 'account-a', model: 'grok', action: 'release' }, base + 30000);
  recordOutcome(state, detail('old-failure', { timestamp: new Date(base + 40000).toISOString(), latency: { total: 40000 }, error: { status: 429, message: 'limited' } }), base + 40000);
  assert.equal(decision(state, 'station', 'account-a', 'grok', base + 41000).blocked, false);
});

test('manual isolation survives policy changes and release never invents a successful call', () => {
  const state = automatic();
  controlChannel(state, { provider: 'station', connectionId: 'account-a', model: '*', action: 'isolate' }, base + 10000);
  setConfig(state, { ...state.config, mode: 'observe' }, base + 20000);
  assert.equal(decision(state, 'station', 'account-a', 'grok', base + 21000).blocked, true);
  controlChannel(state, { provider: 'station', connectionId: 'account-a', model: '*', action: 'release' }, base + 30000);
  assert.equal(rowStatus(state, state.channels[channelKey('station', 'account-a', '*')], base + 31000), 'unknown');
});

test('unfinished streams, cancellations, internal probes and duplicate terminal events are excluded', () => {
  const state = automatic();
  for (const value of [detail('s', { status: 'streaming' }), detail('c', { error: { status: 499, message: 'Client aborted' } }), detail('i', { observationSource: 'internal' })]) assert.equal(recordOutcome(state, value, base + 10000), false);
  recordOutcome(state, detail('single'), base + 11000);
  recordOutcome(state, detail('single'), base + 12000);
  assert.equal(row(state).failures, 1);
});

test('HTTP 200 alone, tool-only empty text and incomplete streams do not become healthy', () => {
  assert.equal(classifyOutcome(detail('empty', { status: 'success', error: undefined, response: { content: '' } })), null);
  assert.notEqual(classifyOutcome(detail('truncated', { status: 'truncated', error: undefined, response: { content: 'partial', incomplete: true } })).kind, 'success');
});

test('stale evidence becomes unknown without automatically isolating an idle channel', () => {
  const state = automatic();
  recordOutcome(state, detail('done', { status: 'success', error: undefined, response: { content: 'Hello' } }), base + 10000);
  assert.equal(rowStatus(state, row(state), base + 25 * 3600000), 'unknown');
  assert.equal(decision(state, 'station', 'account-a', 'grok', base + 25 * 3600000).blocked, false);
});

test('business provenance excludes internal authentication, manual fingerprints and monitor endpoints', () => {
  assert.equal(isBusinessRequest({ endpoint: '/api/v1/messages', headers: {} }), true);
  assert.equal(isBusinessRequest({ endpoint: '/v1/responses', headers: new Headers() }), true);
  assert.equal(isBusinessRequest({ endpoint: '/api/iq-monitor', headers: {} }), false);
  assert.equal(isBusinessRequest({ endpoint: '/api/v1/chat/completions', headers: { 'x-10r-cli-token': 'internal' } }), false);
  assert.equal(isBusinessRequest({ endpoint: '/api/v1/chat/completions', headers: { 'x-10r-observation-source': 'fingerprint' } }), false);
});

test('the new API is readable in readonly mode but all control operations require management', () => {
  assert.equal(isAllowedRequest('/api/model-availability', 'GET', false), true);
  for (const method of ['PUT', 'POST']) {
    assert.equal(isAllowedRequest('/api/model-availability', method, false), false);
    assert.equal(isAllowedRequest('/api/model-availability', method, true), true);
  }
});

test('UI summaries and links use the exact account and preserve model scope', () => {
  const rows = [{ connectionId: 'a', status: 'healthy', blocked: false }, { connectionId: 'b', status: 'isolated', blocked: true }];
  assert.equal(connectionAvailability(rows, 'a').blocked, 0);
  assert.equal(connectionAvailability(rows, 'b').blocked, 1);
  assert.equal(summarizeAvailability(rows).blocked, 1);
  assert.equal(availabilityLink({ provider: 'p', connectionId: 'a', model: 'm' }), '/dashboard/availability?provider=p&connectionId=a&model=m');
});

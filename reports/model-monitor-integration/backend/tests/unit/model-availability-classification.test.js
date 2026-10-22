import { expect, it } from 'vitest';
import { classifyOutcome, newState, setConfig, recordOutcome, decision } from '../../src/lib/availability/core.js';

it('keeps HTTP 429 rate limited when CodeBuddy advice mentions network or proxy changes', () => {
  const detail = { id: 'busy', observationSource: 'business', provider: 'codebuddy-intl', connectionId: 'a', model: 'deepseek-v4.1-flash', status: 'error', error: { status: 429, message: '{"code":14003,"msg":"too many requests","displayTips":{"en":"This model is saturated. It is not a network issue. Do not change proxy settings."}}' } };
  expect(classifyOutcome(detail).kind).toBe('limited');
  const state = newState();
  recordOutcome(state, detail);
  expect(decision(state, detail.provider, 'a', detail.model).blocked).toBe(false);
  setConfig(state, { ...state.config, mode: 'auto', providers: [detail.provider] });
  recordOutcome(state, { ...detail, id: 'auto-busy' });
  expect(decision(state, detail.provider, 'a', detail.model)).toMatchObject({ blocked: true, state: 'cooling' });
  expect(decision(state, detail.provider, 'b', detail.model).blocked).toBe(false);
  expect(decision(state, detail.provider, 'a', 'other-model').blocked).toBe(false);
  expect(classifyOutcome({ ...detail, error: { status: 502, message: 'fetch failed ECONNREFUSED proxy' } }).kind).toBe('network');
});

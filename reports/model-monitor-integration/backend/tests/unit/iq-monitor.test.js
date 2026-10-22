import { describe, it, expect, vi } from "vitest";
import { validateConfig, selectTargets, classifyResult, runTick } from "../../src/lib/iqMonitor/core.js";
const config = { enabled: true, intervalMinutes: 60, providers: [{ id: "one", mode: "all", models: [] }], questions: [{ question: "1+1?", answer: "2" }] };
const catalog = [{ id: "one", models: ["a", "b"] }, { id: "two", models: ["a"] }];
describe("automatic IQ monitor", () => {
  it("preserves per-model thinking strengths and ignores malformed maps", () => {
    const provider = { ...config.providers[0], modelThinking: { a: "high" } };
    expect(validateConfig({ ...config, providers: [provider] }).providers[0].modelThinking).toEqual({ a: "high" });
    expect(selectTargets({ ...config, providers: [provider] }, catalog)[0]).toEqual({ provider: "one", model: "a", thinkingLevel: "high" });
    for (const modelThinking of [null, [], { a: 42 }, { a: "" }, { a: "high)" }]) {
      expect(() => validateConfig({ ...config, providers: [{ ...provider, modelThinking }] })).toThrow();
    }
  });
  it("keeps thinking strengths out of availability checks and separates IQ score comparisons", async () => {
    const selected = { ...config, providers: [{ id: "one", mode: "selected", models: ["a"], checks: ["availability", "iq"], modelThinking: { a: "high" } }] };
    const probe = vi.fn(async () => ({ ok: true, iq: { correct: true } }));
    const state = { history: [{ provider: "one", model: "a", check: "iq", score: 0, thinkingLevel: "low", answers: [{ ...config.questions[0] }] }] };
    const stored = await runTick({ config: selected, catalog, state, now: 100, probe, save: async () => {} });
    expect(probe.mock.calls[0][0]).toEqual({ provider: "one", model: "a", checks: ["availability", "iq"] });
    expect(probe.mock.calls[1][0].thinkingLevel).toBe("high");
    expect(stored.history[0].thinkingLevel).toBe("high");
    expect(stored.history[0].change).toBeNull();
    expect(stored.history[1].thinkingLevel).toBeUndefined();
  });
  it("accepts whole-minute intervals from one to 10080", () => {
    for (const intervalMinutes of [1, 5, 15, 10080]) {
      expect(validateConfig({ ...config, intervalMinutes }).intervalMinutes).toBe(intervalMinutes);
    }
    for (const intervalMinutes of [undefined, null, "1", 0, -1, 0.5, 1.5, 10081]) {
      expect(() => validateConfig({ ...config, intervalMinutes })).toThrow();
    }
  });
  it("validates frequency and whitelist", () => {
    expect(() => validateConfig({ ...config, intervalMinutes: 0 })).toThrow();
    expect(() => validateConfig({ ...config, providers: [] })).toThrow();
    expect(() => validateConfig({ ...config, questions: [{ question: "?", answer: "abc" }] })).toThrow();
    expect(validateConfig(config)).toEqual({ ...config, testingModes: {} });
  });
  it("selects only opted-in providers and live enabled models", () => {
    expect(selectTargets(config, catalog)).toEqual([{ provider: "one", model: "a" }, { provider: "one", model: "b" }]);
    expect(selectTargets({ ...config, providers: [{ id: "one", mode: "selected", models: ["b", "deleted"] }] }, catalog)).toEqual([{ provider: "one", model: "b" }]);
  });
  it("passes excluded account IDs to every selected model", () => {
    const selected = { ...config, providers: [{ id: "one", mode: "selected", models: ["a"], excludedConnectionIds: ["public-account"] }] };
    expect(validateConfig(selected).providers[0].excludedConnectionIds).toEqual(["public-account"]);
    expect(selectTargets(selected, catalog)).toEqual([{ provider: "one", model: "a", excludedConnectionIds: ["public-account"] }]);
    expect(() => validateConfig({ ...selected, providers: [{ ...selected.providers[0], excludedConnectionIds: [42] }] })).toThrow();
  });
  it("validates selectable checks while preserving legacy IQ behavior", () => {
    const provider = { ...config.providers[0], checks: ["availability", "iq"] };
    expect(validateConfig({ ...config, providers: [provider] }).providers[0].checks).toEqual(["availability", "iq"]);
    expect(() => validateConfig({ ...config, providers: [{ ...provider, checks: [] }] })).toThrow();
    expect(() => validateConfig({ ...config, providers: [{ ...provider, checks: ["account"] }] })).toThrow();
    expect(selectTargets({ ...config, providers: [provider] }, catalog)[0].checks).toEqual(["availability", "iq"]);
  });
  it("checks availability once without grading and records it independently from IQ", async () => {
    const both = { ...config, providers: [{ ...config.providers[0], mode: "selected", models: ["a"], checks: ["availability", "iq"] }] };
    const probe = vi.fn(async (_target, question, check) => check === "availability" ? { ok: true, content: "pong" } : { ok: true, iq: { correct: true } });
    let stored;
    await runTick({ config: both, catalog, state: {}, now: 100, probe, save: async state => { stored = structuredClone(state); } });
    expect(probe).toHaveBeenCalledTimes(2);
    expect(probe.mock.calls[0][1]).toBeNull();
    expect(probe.mock.calls[0][2]).toBe("availability");
    expect(stored.history.map(row => [row.check, row.status, row.score])).toEqual([["iq", "correct", 100], ["availability", "available", null]]);
  });
  it("distinguishes answers from transport failures", () => {
    expect(classifyResult({ ok: true, iq: { correct: false } })).toBe("incorrect");
    expect(classifyResult({ ok: false, status: 429 })).toBe("rate_limited");
    expect(classifyResult({ ok: false, error: "TimeoutError" })).toBe("timeout");
    expect(classifyResult({ ok: false, status: 500 })).toBe("error");
  });
  it("skips disabled and not-due runs", async () => {
    const probe = vi.fn();
    const save = vi.fn();
    await runTick({ config: { ...config, enabled: false }, catalog, state: {}, now: 100, probe, save });
    await runTick({ config, catalog, state: { nextAt: 200 }, now: 100, probe, save });
    expect(probe).not.toHaveBeenCalled();
  });
  it("persists provider identity and backs off on rate limits", async () => {
    const probe = vi.fn(async () => ({ ok: false, status: 429 }));
    let stored;
    await runTick({ config, catalog, state: {}, now: 100, probe, save: async state => { stored = structuredClone(state); } });
    expect(probe).toHaveBeenCalledTimes(1);
    expect(probe.mock.calls[0][0]).toEqual({ provider: "one", model: "a" });
    expect(stored.history[0].provider).toBe("one");
    expect(stored.history[0].score).toBeNull();
    expect(stored.backoff.one).toBeGreaterThan(100);
  });
  it("stops after configuration changes", async () => {
    const probe = vi.fn(async () => ({ ok: true, iq: { correct: true } }));
    const isCurrent = vi.fn().mockResolvedValueOnce(true).mockResolvedValue(false);
    await runTick({ config, catalog, state: {}, now: 100, probe, save: async () => {}, isCurrent });
    expect(probe).toHaveBeenCalledTimes(1);
  });
  it("scores multiple questions with snapshots", async () => {
    let stored;
    await runTick({ config: { ...config, questions: [...config.questions, { question: "2+2?", answer: "4" }] }, catalog, state: {}, now: 100,
      probe: async (_target, question) => ({ ok: true, iq: { correct: question.answer === "2" }, content: "answer" }),
      save: async state => { stored = structuredClone(state); } });
    expect(stored.history).toHaveLength(2);
    expect(stored.history[0].score).toBe(50);
    expect(stored.history[0].answers[0].question).toBe("1+1?");
  });
});

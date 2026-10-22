vi.mock("@/lib/iqMonitor/testingPolicy", () => ({ assertTestingAllowed: vi.fn(async () => {}) }));
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ values: new Map(), probe: vi.fn() }));
vi.mock("@/lib/localDb", () => ({
  getSettings: async () => ({ iqProbe: { question: "1+1?", answer: "2" } }),
  getProviderConnections: async () => [{ id: "safe", name: "Safe account", provider: "one", isActive: true }, { id: "public", name: "Public account", provider: "one", isActive: true }, { provider: "two", isActive: false }],
  getProviderNodes: async () => [{ id: "one", name: "First" }],
  getCustomModels: async () => [{ providerAlias: "one", id: "custom", type: "llm" }, { providerAlias: "one", id: "off", enabled: false }, { providerAlias: "one", id: "embed", type: "embedding" }],
  getModelAliases: async () => ({}),
}));
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledModels: async () => ({ one: ["blocked"] }) }));
vi.mock("@/lib/db/helpers/kvStore", () => ({ makeKv: () => ({ get: async (key, fallback) => mocks.values.get(key) ?? fallback, set: async (key, value) => mocks.values.set(key, structuredClone(value)) }) }));
vi.mock("@/shared/constants/config", () => ({ AI_MODELS: [{ provider: "one", model: "chat" }, { provider: "one", model: "blocked" }, { provider: "one", model: "embedding" }] }));
vi.mock("@/shared/constants/models", () => ({ getModelsByProviderId: () => [{ id: "chat" }, { id: "blocked" }, { id: "embedding", type: "embedding" }] }));
vi.mock("@/shared/constants/providers", () => ({ AI_PROVIDERS: {}, getProviderAlias: id => id }));
vi.mock("@/lib/iqMonitor/probe", () => ({ probeTarget: mocks.probe }));
vi.mock("open-sse/providers/thinkingLevels.js", () => ({ getThinkingLevels: (_provider, model) => model === "chat" ? ["none", "low", "high"] : null }));
import { getCatalog, getConfig, getMonitor, saveConfig, tickMonitor, runManualMonitorTest } from "../../src/lib/iqMonitor/service";
import { assertTestingAllowed } from "@/lib/iqMonitor/testingPolicy";
beforeEach(() => { mocks.values.clear(); mocks.probe.mockReset(); });

it("targets the requested account and refuses foreign or excluded accounts before probing", async () => {
  mocks.values.set("config", { providers: [{ id: "one", excludedConnectionIds: ["public"] }] });
  mocks.probe.mockResolvedValue({ ok: true, status: 200, connectionId: "safe", content: "PONG" });
  await expect(runManualMonitorTest({ provider: "one", connectionId: "public", model: "chat" }, "availability")).rejects.toThrow("排除");
  await expect(runManualMonitorTest({ provider: "one", connectionId: "foreign", model: "chat" }, "availability")).rejects.toThrow("指定账号");
  expect(mocks.probe).not.toHaveBeenCalled();
  const result = await runManualMonitorTest({ provider: "one", connectionId: "safe", model: "chat" }, "availability");
  expect(mocks.probe.mock.calls[0][0]).toMatchObject({ connectionId: "safe", testTrigger: "manual" });
  expect(result.monitorRow.connectionId).toBe("safe");
});

it("rejects duplicate concurrent tests and never retries them", async () => {
  mocks.values.set("config", { providers: [] });
  let complete;
  mocks.probe.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  const target = { provider: "one", connectionId: "safe", model: "chat" };
  const first = runManualMonitorTest(target, "availability");
  await vi.waitFor(() => expect(complete).toBeTypeOf("function"));
  await expect(runManualMonitorTest(target, "availability")).rejects.toMatchObject({ status: 409 });
  complete({ ok: true, connectionId: "safe", content: "PONG" });
  await first;
  expect(mocks.probe).toHaveBeenCalledTimes(1);
});

it("keeps manual stations out of scheduled ticks without deleting their plans", async () => {
  const config = { enabled: true, intervalMinutes: 60, providers: [{ id: "one", mode: "selected", models: ["chat"], checks: ["availability"] }], questions: [{ question: "1+1?", answer: "2" }], testingModes: { one: "manual" } };
  mocks.values.set("config", config);
  mocks.probe.mockClear();
  await tickMonitor();
  expect(mocks.probe).not.toHaveBeenCalled();
  expect((await getConfig()).providers).toEqual(config.providers);
});

it("refuses stale and concurrent detection config writes", async () => {
  const input = { enabled: false, intervalMinutes: 60, providers: [], questions: [{ question: "1+1?", answer: "2" }], testingModes: { one: "manual" } };
  const saved = await saveConfig(input);
  const results = await Promise.allSettled([saveConfig({ ...saved, testingModes: { one: "observe" } }), saveConfig({ ...saved, testingModes: { one: "scheduled" } })]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(results.find(result => result.status === "rejected").reason.status).toBe(409);
});
describe("IQ monitor storage and provider catalog", () => {
  it("advertises persisted thinking configuration support", async () => {
    expect((await getMonitor()).capabilities).toMatchObject({ modelThinking: true, manualTests: true });
  });
  it("exposes supported strengths and rejects unsupported choices before writing", async () => {
    const catalog = await getCatalog();
    expect(catalog.find(provider => provider.id === "one").thinkingLevels).toEqual({ chat: ["none", "low", "high"], custom: [] });
    const config = { enabled: true, intervalMinutes: 1, questions: [{ question: "1+1?", answer: "2" }], providers: [{ id: "one", mode: "selected", models: ["chat"], modelThinking: { chat: "high" } }] };
    const saved = await saveConfig(config);
    expect(saved.providers[0].modelThinking).toEqual({ chat: "high" });
    for (const modelThinking of [{ chat: "ultra" }, { custom: "high" }, { missing: "high" }]) {
      await expect(saveConfig({ ...config, revision: saved.revision, providers: [{ ...config.providers[0], modelThinking }] })).rejects.toThrow("Unsupported thinking level");
      expect(await getConfig()).toEqual(saved);
    }
  });
  beforeEach(() => { mocks.values.clear(); mocks.probe.mockReset(); });
  it("persists manual strengths and account exclusions without altering the schedule", async () => {
    const config = { enabled: false, providers: [{ id: "one", excludedConnectionIds: ["public"] }] };
    mocks.values.set("config", config);
    mocks.values.set("state", { nextAt: 123, history: [{ provider: "one", model: "chat", at: 1, check: "iq", status: "error" }] });
    mocks.probe.mockResolvedValue({ ok: true, status: 200, latencyMs: 10, iq: { correct: true } });
    const result = await runManualMonitorTest({ provider: "one", model: "chat" }, "iq", "high");
    expect(mocks.probe).toHaveBeenCalledWith({ provider: "one", model: "chat", testTrigger: "manual", excludedConnectionIds: ["public"], thinkingLevel: "high" }, { question: "1+1?", answer: "2" }, "iq");
    expect(result.monitorRow).toMatchObject({ manual: true, persisted: true, status: "correct", score: 100, thinkingLevel: "high" });
    const monitor = await getMonitor();
    expect(monitor.state.history).toHaveLength(2);
    expect(monitor.state.history[0]).toEqual(result.monitorRow);
    expect(monitor.state.nextAt).toBe(123);
    expect(await getConfig()).toEqual(config);
    mocks.values.set("state", { nextAt: 456, history: [] });
    expect((await getMonitor()).state.history).toEqual([result.monitorRow]);
  });
  it("rejects invalid models and strengths before probing", async () => {
    await expect(runManualMonitorTest({ provider: "one", model: "missing" }, "iq", "high")).rejects.toThrow("Unavailable monitor model");
    await expect(runManualMonitorTest({ provider: "one", model: "chat" }, "iq", "ultra")).rejects.toThrow("Unsupported thinking level");
    expect(mocks.probe).not.toHaveBeenCalled();
  });
  it("records failures and concurrent manual checks without losing either result", async () => {
    mocks.probe.mockResolvedValue({ ok: false, status: 429, error: "limited" });
    const results = await Promise.all([runManualMonitorTest({ provider: "one", model: "chat" }, "availability", "high"), runManualMonitorTest({ provider: "one", model: "custom" }, "iq")]);
    expect(results[0].monitorRow.status).toBe("rate_limited");
    expect(results[0].monitorRow).not.toHaveProperty("thinkingLevel");
    expect(results[1].monitorRow.status).toBe("rate_limited");
    expect((await getMonitor()).state.history).toHaveLength(2);
    mocks.probe.mockImplementation(async () => { throw new Error("timed out"); });
    const timeout = await runManualMonitorTest({ provider: "one", model: "chat" }, "iq");
    expect(timeout.monitorRow.status).toBe("timeout");
  });
  it("defaults to disabled with an empty whitelist", async () => {
    expect(await getConfig()).toMatchObject({ enabled: false, providers: [] });
    await tickMonitor();
    expect(mocks.probe).not.toHaveBeenCalled();
  });
  it("excludes disabled models, inactive providers and non-chat models", async () => {
    const catalog = await getCatalog();
    expect(catalog.find(provider => provider.id === "one").models).toEqual(["chat", "custom"]);
    expect(catalog.find(provider => provider.id === "one").connections).toEqual([{ id: "safe", name: "Safe account" }, { id: "public", name: "Public account" }]);
    expect(catalog.find(provider => provider.id === "two").models).toEqual([]);
  });
  it("validates provider identity before persisting and stamps a revision", async () => {
    const config = { enabled: true, intervalMinutes: 60, questions: [{ question: "1+1?", answer: "2" }], providers: [{ id: "missing", mode: "all", models: [] }] };
    await expect(saveConfig(config)).rejects.toThrow("Unknown provider");
    const saved = await saveConfig({ ...config, providers: [{ id: "one", mode: "selected", models: ["custom"] }] });
    expect(saved.revision).toBeTruthy();
    expect((await getConfig()).providers[0].id).toBe("one");
  });
});

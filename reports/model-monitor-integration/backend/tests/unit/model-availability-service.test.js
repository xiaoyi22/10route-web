import { beforeEach, describe, expect, it, vi } from "vitest";
import { newState, controlChannel, setConfig, recordOutcome } from "../../src/lib/availability/core.js";

const mocks = vi.hoisted(() => ({ store: new Map(), connections: [], combos: {}, providers: [] }));
vi.mock("@/lib/db/helpers/kvStore.js", () => ({ makeKv: () => ({ get: async key => structuredClone(mocks.store.get(key)), set: async (key, value) => { mocks.store.set(key, structuredClone(value)); } }) }));
vi.mock("@/lib/localDb", () => ({
  getProviderConnections: async () => mocks.connections,
  getProviderConnectionById: async id => mocks.connections.find(row => row.id === id),
  getProviderNodes: async () => [{ id: "station", name: "Test station", prefix: "st" }],
  getCustomModels: async () => [],
}));
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledModels: async () => ({}) }));
vi.mock("@/shared/constants/models", () => ({ getModelsByProviderId: () => [] }));
vi.mock("@/shared/constants/providers", () => ({ getProviderAlias: id => id, AI_PROVIDERS: {} }));
vi.mock("@/lib/distributionDb", () => ({ getDistribution: async () => ({ mode: "allowlist", models: ["st/grok"] }), isDistributed: id => id === "st/grok" }));
vi.mock("@/sse/services/model", () => ({
  getModelInfo: async id => ({ provider: id.startsWith("st/") ? "station" : "other", model: id.split("/").slice(1).join("/") }),
  getComboModels: async id => mocks.combos[id] || null,
}));

let service;
beforeEach(async () => {
  vi.resetModules(); mocks.store.clear(); mocks.combos = {};
  mocks.connections = [{ id: "a", provider: "station", name: "Account A", isActive: true, apiKey: "private", providerSpecificData: { enabledModels: ["grok", "other"] } }, { id: "b", provider: "station", name: "Account B", isActive: true, providerSpecificData: { enabledModels: ["grok"] } }];
  service = await import("../../src/lib/availability/service.js");
});

describe("passive availability persistence and routing", () => {
  it("lists only local configuration and never performs upstream fetches", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Forbidden upstream call"));
    try {
      const result = await service.getAvailability();
      expect(result.rows).toHaveLength(3);
      expect(result.rows.every(row => row.status === "unknown")).toBe(true);
      expect(JSON.stringify(result)).not.toContain("private");
      expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });
  it("persists manual scope without modifying connection enablement or credentials", async () => {
    await service.changeAvailability({ provider: "station", connectionId: "a", model: "grok", action: "isolate" });
    const result = await service.getAvailability();
    expect(result.rows.find(row => row.connectionId === "a" && row.model === "grok").blocked).toBe(true);
    expect(result.rows.find(row => row.connectionId === "a" && row.model === "other").blocked).toBe(false);
    expect(mocks.connections[0].isActive).toBe(true);
    vi.resetModules(); service = await import("../../src/lib/availability/service.js");
    expect((await service.getAvailability()).rows.find(row => row.connectionId === "a" && row.model === "grok").blocked).toBe(true);
  });
  it("does not hide a route until every eligible account is isolated, and covers combos", async () => {
    await service.changeAvailability({ provider: "station", connectionId: "a", model: "grok", action: "isolate" });
    expect(await service.routeAvailability(["st/grok"], mocks.connections)).toEqual({});
    await service.changeAvailability({ provider: "station", connectionId: "b", model: "grok", action: "isolate" });
    mocks.combos.chat = ["st/grok", "other/grok"];
    const result = await service.routeAvailability(["st/grok", "chat"], mocks.connections);
    expect(result["st/grok"].blocked).toBe(true);
    expect(result.chat).toBeUndefined();
  });
  it("respects account model scope instead of counting an unrelated account as a fallback", async () => {
    await service.changeAvailability({ provider: "station", connectionId: "a", model: "other", action: "isolate" });
    expect((await service.routeAvailability(["st/other"], mocks.connections))["st/other"].blocked).toBe(true);
  });
  it("serializes concurrent terminal writes, deduplicates and redacts errors", async () => {
    const detail = { id: "request", observationSource: "business", provider: "station", connectionId: "a", model: "grok", status: "error", timestamp: new Date().toISOString(), response: { status: 401 }, error: { status: 401, message: "Invalid API key sk-private-value" } };
    await Promise.all([service.observeBusinessDetail(detail), service.observeBusinessDetail(detail)]);
    const result = await service.getAvailability();
    expect(result.observedRequests).toBe(1);
    expect(JSON.stringify(result)).not.toContain("sk-private-value");
    expect(result.config.mode).toBe("observe");
    expect(result.rows.every(row => !row.blocked)).toBe(true);
  });
  it("allows only one concurrent real recovery and refuses internal probes", async () => {
    const now = Date.now();
    const state = newState(now - 1000000);
    setConfig(state, { ...state.config, mode: "auto", providers: ["station"] }, now - 900000);
    recordOutcome(state, { id: "limited", observationSource: "business", provider: "station", connectionId: "a", model: "grok", timestamp: new Date(now - 800000).toISOString(), status: "error", error: { status: 429, message: "Rate limited" } }, now - 800000);
    mocks.store.set("state", state);
    const internal = await service.availabilityDecisions("station", mocks.connections, "grok", false);
    expect(internal.get("a").blocked).toBe(true);
    const claims = await Promise.all([service.reserveBusinessRecovery("station", "a", "grok"), service.reserveBusinessRecovery("station", "a", "grok")]);
    expect(claims).toEqual([true, false]);
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 180000);
    try {
      const stillRunning = await service.availabilityDecisions("station", mocks.connections, "grok", true);
      expect(stillRunning.get("a").blocked).toBe(true);
    } finally { clock.mockRestore(); }
  });
  it("rejects stale policy drafts rather than overwriting another operator", async () => {
    const current = await service.getAvailability();
    await service.updateAvailabilityConfig({ revision: current.revision, config: current.config });
    await expect(service.updateAvailabilityConfig({ revision: current.revision, config: current.config })).rejects.toMatchObject({ status: 409 });
  });
  it("rejects an account from another provider before persisting control state", async () => {
    await expect(service.changeAvailability({ provider: "other", connectionId: "a", model: "grok", action: "isolate" })).rejects.toThrow();
    expect(mocks.store.size).toBe(0);
  });
});

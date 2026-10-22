import { beforeEach, expect, it, vi } from "vitest";
const data = vi.hoisted(() => new Map());
vi.mock("@/lib/db/helpers/kvStore", () => ({ makeKv: () => ({ get: async (key, fallback) => data.get(key) ?? fallback }) }));
import { assertTestingAllowed, testingOverview } from "../../src/lib/iqMonitor/testingPolicy";
import { validateConfig } from "../../src/lib/iqMonitor/core";
beforeEach(() => data.clear());

it("denies all proactive checks for unknown stations and observation-only stations", async () => {
  for (const modes of [undefined, { p: "observe" }]) {
    data.set("config", { testingModes: modes });
    for (const trigger of ["manual", "scheduled"]) await expect(assertTestingAllowed("p", trigger)).rejects.toMatchObject({ status: 403 });
  }
});
it("manual mode permits one-off checks and forbids scheduled checks", async () => {
  data.set("config", { testingModes: { p: "manual" } });
  await expect(assertTestingAllowed("p", "manual")).resolves.toBeUndefined();
  await expect(assertTestingAllowed("p", "scheduled")).rejects.toMatchObject({ status: 403 });
});
it("scheduled permission is station-specific and immediately reads mode changes", async () => {
  data.set("config", { testingModes: { p: "scheduled" } });
  await expect(assertTestingAllowed("p", "scheduled")).resolves.toBeUndefined();
  await expect(assertTestingAllowed("other", "manual")).rejects.toMatchObject({ status: 403 });
  data.set("config", { testingModes: { p: "observe" } });
  await expect(assertTestingAllowed("p", "scheduled")).rejects.toMatchObject({ status: 403 });
});
it("shows the latest actual account's liveness result without response content", async () => {
  data.set("manualHistory", [
    { provider: "p", model: "m", connectionId: "a", check: "availability", at: 1, status: "error", answers: [{ error: "old" }] },
    { provider: "p", model: "m", connectionId: "a", check: "availability", at: 2, status: "available", answers: [{ content: "private", latencyMs: 10 }] },
    { provider: "p", model: "m", check: "iq", at: 3, status: "incorrect", answers: [{ connectionId: "a" }] },
  ]);
  const result = await testingOverview();
  expect(result.latest.get(JSON.stringify(["p", "a", "m"]))).toEqual({ at: 2, status: "available", latencyMs: 10 });
  expect(JSON.stringify([...result.latest])).not.toContain("private");
});
it("validates detection permission values without losing model selections", () => {
 const input = { enabled: false, intervalMinutes: 60, providers: [], questions: [{ question: "1+1?", answer: "2" }], testingModes: { p: "manual" } };
 expect(validateConfig(input).testingModes).toEqual({ p: "manual" });
 expect(() => validateConfig({ ...input, testingModes: { p: "auto" } })).toThrow("Invalid testing modes");
});

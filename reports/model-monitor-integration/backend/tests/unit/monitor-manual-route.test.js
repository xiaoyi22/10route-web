vi.mock("@/lib/iqMonitor/testingPolicy", () => ({ assertTestingAllowed: vi.fn(async () => {}) }));
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ manual: vi.fn(), resolve: vi.fn(), ping: vi.fn(), iq: vi.fn(), direct: vi.fn() }));
vi.mock("@/lib/localDb", () => ({ getSettings: async () => ({ iqProbe: { question: "1+1?", answer: "2" } }) }));
vi.mock("@/lib/iqMonitor/service", () => ({ runManualMonitorTest: mocks.manual }));
vi.mock("@/sse/services/model", () => ({ getModelInfo: mocks.resolve }));
vi.mock("@/app/api/models/test/ping", () => ({ pingModelByKind: mocks.ping, pingIqModel: mocks.iq }));
vi.mock("@/lib/iqMonitor/probe", () => ({ probeTarget: mocks.direct }));
import { POST } from "../../src/app/api/models/test/route.js";
const target = { provider: "openai-compatible-nexa", model: "gpt-6.1-sol" };
const request = body => new Request("http://localhost/api/models/test", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
beforeEach(() => { vi.clearAllMocks(); mocks.resolve.mockResolvedValue(target); mocks.manual.mockResolvedValue({ ok: true, monitorRow: { ...target, persisted: true } }); mocks.ping.mockResolvedValue({ ok: true }); mocks.direct.mockResolvedValue({ ok: true, status: 200, content: "PONG" }); });
it("keeps high thinking separate from the published route and returns saved monitor state", async () => {
  const response = await POST(request({ model: "nexa/gpt-6.1-sol", monitorTarget: target, probe: "iq", thinkingLevel: "high" }));
  expect(response.status).toBe(200);
  expect(mocks.resolve).toHaveBeenCalledWith("nexa/gpt-6.1-sol", { inferFallback: false });
  expect(mocks.manual).toHaveBeenCalledWith(target, "iq", "high");
  expect((await response.json()).monitorRow.persisted).toBe(true);
  expect(mocks.iq).not.toHaveBeenCalled();
});
it("refuses mismatched provider targets before executing", async () => {
  expect((await POST(request({ model: "nexa/gpt-6.1-sol", monitorTarget: { ...target, provider: "other" } }))).status).toBe(400);
  expect(mocks.manual).not.toHaveBeenCalled();
});
it("does not claim unavailable models or unsupported strengths were tested", async () => {
  mocks.manual.mockRejectedValue(new Error("Unsupported thinking level"));
  const response = await POST(request({ model: "nexa/gpt-6.1-sol", monitorTarget: target, thinkingLevel: "invalid" }));
  expect(response.status).toBe(400);
  expect((await response.json()).ok).toBe(false);
});
it("tests unpublished dashboard text models directly without the downstream endpoint", async () => {
  const response = await POST(request({ model: "wh/grok-4.7", kind: "llm" }));
  expect(response.status).toBe(200);
  expect((await response.json()).ok).toBe(true);
  expect(mocks.resolve).toHaveBeenCalledWith("wh/grok-4.7", { inferFallback: false });
  expect(mocks.direct).toHaveBeenCalledWith({ ...target, maxOutputTokens: 1024, testTrigger: "manual" }, null, "availability");
  expect(mocks.ping).not.toHaveBeenCalled();
  expect(mocks.manual).not.toHaveBeenCalled();
});
it("uses direct testing when the text kind is omitted", async () => {
  await POST(request({ model: "wh/grok-4.7" }));
  expect(mocks.direct).toHaveBeenCalledOnce();
});
it("rejects unknown routes before making an upstream request", async () => {
  mocks.resolve.mockResolvedValue(null);
  expect((await POST(request({ model: "missing/model" }))).status).toBe(400);
  expect(mocks.direct).not.toHaveBeenCalled();
});
it("preserves upstream failures without reporting a successful model test", async () => {
  mocks.direct.mockResolvedValue({ ok: false, status: 429, error: "HTTP 429" });
  const response = await POST(request({ model: "wh/grok-4.7" }));
  expect(await response.json()).toEqual({ ok: false, status: 429, error: "HTTP 429" });
});
it("preserves non-text model tests", async () => {
  await POST(request({ model: "nexa/embedding", kind: "embedding" }));
  expect(mocks.ping).toHaveBeenCalledWith("nexa/embedding", "embedding");
  expect(mocks.direct).not.toHaveBeenCalled();
});

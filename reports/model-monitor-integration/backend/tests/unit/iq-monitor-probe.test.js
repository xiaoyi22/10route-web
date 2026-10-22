vi.mock("@/lib/iqMonitor/testingPolicy", () => ({ assertTestingAllowed: vi.fn(async () => {}) }));
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ core: vi.fn(), credentials: vi.fn(), refresh: vi.fn(), execute: vi.fn() }));
vi.mock("open-sse/index.js", () => ({}));
vi.mock("open-sse/executors/index.js", () => ({ getExecutor: () => ({ execute: mocks.execute }) }));
vi.mock("open-sse/handlers/chatCore.js", () => ({ handleChatCore: mocks.core }));
vi.mock("open-sse/providers/thinkingLevels.js", () => ({ getThinkingLevels: () => ["none", "low", "high"] }));
vi.mock("@/sse/services/auth", () => ({ getProviderCredentials: mocks.credentials }));
vi.mock("@/sse/services/tokenRefresh", () => ({ checkAndRefreshToken: mocks.refresh, updateProviderCredentials: vi.fn() }));
vi.mock("@/lib/localDb", () => ({ getSettings: async () => ({}), getApiKeys: async () => [] }));
vi.mock("@/shared/utils/machineId", () => ({ getConsistentMachineId: async () => "test" }));
import { probeTarget } from "../../src/lib/iqMonitor/probe";
import { assertTestingAllowed } from "@/lib/iqMonitor/testingPolicy";
describe("provider-bound IQ execution", () => {
  it("locks selection to the target and does not fall back if another account is returned", async () => {
    const target = { provider: "one", model: "a", connectionId: "account-b", testTrigger: "manual" };
    const result = await probeTarget(target, null, "availability");
    expect(result.status).toBe(503);
    expect(mocks.credentials).toHaveBeenCalledWith("one", null, "a", { preferredConnectionId: "account-b", diagnosticConnectionId: "account-b" });
    expect(mocks.core).not.toHaveBeenCalled();
  });
  it("blocks a core retry before a second inference is sent", async () => {
    await probeTarget({ provider: "one", model: "a" }, null, "availability");
    const executor = mocks.core.mock.calls[0][0]._executorOverride;
    await executor.execute({});
    await expect(executor.execute({})).rejects.toThrow("不自动重试");
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
  it("sends IQ thinking through the existing model suffix without changing account selection", async () => {
    await probeTarget({ provider: "codex", model: "gpt", thinkingLevel: "high" }, { question: "1+1?", answer: "2" });
    expect(mocks.credentials).toHaveBeenCalledWith("codex", null, "gpt");
    expect(mocks.core.mock.calls[0][0].modelInfo).toEqual({ provider: "codex", model: "gpt(high)" });
    expect(mocks.core.mock.calls[0][0].body.model).toBe("codex/gpt(high)");
  });
  it("uses the same thinking suffix for Responses IQ and leaves liveness unchanged", async () => {
    mocks.core.mockResolvedValue({ response: Response.json({ output_text: "IQ-ANSWER: 2" }) });
    const target = { provider: "openai-compatible-responses-test", model: "gpt", thinkingLevel: "none" };
    await probeTarget(target, { question: "1+1?", answer: "2" });
    expect(mocks.core.mock.calls[0][0].body.model).toBe("openai-compatible-responses-test/gpt(none)");
    mocks.core.mockClear();
    mocks.core.mockResolvedValue({ response: Response.json({ output_text: "PONG" }) });
    await probeTarget(target, null, "availability");
    expect(mocks.core.mock.calls[0][0].body.model).toBe("openai-compatible-responses-test/gpt");
  });
  it("rejects unsupported IQ strengths before sending an upstream request", async () => {
    await expect(probeTarget({ provider: "codex", model: "gpt", thinkingLevel: "ultra" }, { question: "?", answer: "2" })).rejects.toThrow("Unsupported thinking level");
    expect(mocks.credentials).not.toHaveBeenCalled();
    expect(mocks.core).not.toHaveBeenCalled();
  });
  it("uses native Responses requests and reads message output", async () => {
    mocks.core.mockResolvedValue({ response: Response.json({ object: "response", status: "completed", output: [
      { type: "reasoning", summary: [{ type: "summary_text", text: "thinking" }] },
      { type: "message", role: "assistant", content: [{ type: "output_text", text: "PONG" }] },
    ] }) });
    const result = await probeTarget({ provider: "openai-compatible-responses-test", model: "gpt-6-sol" }, null, "availability");
    expect(result.ok).toBe(true);
    expect(result.content).toBe("PONG");
    const options = mocks.core.mock.calls[0][0];
    expect(options.sourceFormatOverride).toBe("openai-responses");
    expect(options.body.input).toBe("Reply with PONG.");
    expect(options.body.max_output_tokens).toBe(256);
    expect(options.body.messages).toBeUndefined();
  });
  it("does not treat reasoning-only Responses output as a successful reply", async () => {
    mocks.core.mockResolvedValue({ response: Response.json({ output: [{ type: "reasoning", summary: [{ text: "thinking" }] }] }) });
    expect((await probeTarget({ provider: "openai-compatible-responses-test", model: "gpt-6-sol" }, null, "availability")).ok).toBe(false);
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.credentials.mockResolvedValue({ connectionId: "account-a" });
    mocks.refresh.mockImplementation(async (_provider, credentials) => credentials);
    mocks.core.mockResolvedValue({ response: Response.json({ choices: [{ message: { content: "IQ-ANSWER: 2" } }] }) });
  });
  it("calls the exact provider directly without combo routing and grades its answer", async () => {
    const result = await probeTarget({ provider: "openai-compatible-nexa", model: "gpt-test" }, { question: "1+1?", answer: "2" });
    expect(mocks.credentials).toHaveBeenCalledWith("openai-compatible-nexa", null, "gpt-test");
    expect(mocks.core.mock.calls[0][0].modelInfo).toEqual({ provider: "openai-compatible-nexa", model: "gpt-test" });
    expect(mocks.core.mock.calls[0][0].onRequestSuccess).toBeUndefined();
    expect(result.iq.correct).toBe(true);
    expect(result.connectionId).toBe("account-a");
  });
  it("does not fail over or mutate account health on HTTP failure", async () => {
    mocks.core.mockResolvedValue({ response: new Response("limited", { status: 429 }) });
    expect((await probeTarget({ provider: "one", model: "a" }, { question: "?", answer: "2" })).status).toBe(429);
    expect(mocks.core).toHaveBeenCalledTimes(1);
    expect(mocks.credentials).toHaveBeenCalledTimes(1);
  });
  it("does not invoke the upstream when no accounts are available", async () => {
    mocks.credentials.mockResolvedValue(null);
    expect((await probeTarget({ provider: "one", model: "a" }, { question: "?", answer: "2" })).ok).toBe(false);
    expect(mocks.core).not.toHaveBeenCalled();
  });
  it("excludes public accounts and refuses to probe one even if credentials return it", async () => {
    const target = { provider: "one", model: "a", excludedConnectionIds: ["account-a"] };
    expect((await probeTarget(target, { question: "?", answer: "2" })).ok).toBe(false);
    expect(mocks.credentials).toHaveBeenCalledWith("one", new Set(["account-a"]), "a");
    expect(mocks.core).not.toHaveBeenCalled();
  });
  it("supplies an abort deadline to the provider executor", async () => {
    await probeTarget({ provider: "one", model: "a" }, { question: "?", answer: "2" });
    await mocks.core.mock.calls[0][0]._executorOverride.execute({ signal: new AbortController().signal });
    expect(mocks.execute.mock.calls[0][0].signal).toBeInstanceOf(AbortSignal);
  });
  it("checks a short real model reply without IQ grading or accepting empty HTTP 200", async () => {
    const target = { provider: "one", model: "a" };
    const result = await probeTarget(target, null, "availability");
    expect(result.ok).toBe(true);
    expect(result.iq).toBeUndefined();
    expect(mocks.core.mock.calls[0][0].body.max_tokens).toBeLessThan(4096);
    mocks.core.mockResolvedValue({ response: Response.json({ choices: [{ message: { content: "" } }] }) });
    expect((await probeTarget(target, null, "availability")).ok).toBe(false);
  });
});

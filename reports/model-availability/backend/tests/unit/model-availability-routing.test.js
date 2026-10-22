import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";

let adapter, server, auth, service, core;
const provider = "openai-compatible-chat-passive-local";
beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "10router-passive-routing-"));
  vi.resetModules(); delete globalThis._dbAdapter;
  adapter = await (await import("@/lib/db/driver.js")).getAdapter();
  server = createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ id: "local-completion", model: body.model, choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "Local fixture business response" } }], usage: { prompt_tokens: 3, completion_tokens: 3 } }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
  for (const [id, priority] of [["a", 1], ["b", 2]]) adapter.run(
    "INSERT INTO providerConnections(id,provider,authType,name,priority,isActive,data,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?)",
    [id, provider, "apikey", "Account " + id, priority, 1, JSON.stringify({ apiKey: "local-fixture-key", providerSpecificData: { baseUrl, apiType: "chat", enabledModels: ["local-model"] } }), new Date().toISOString(), new Date().toISOString()]
  );
  service = await import("@/lib/availability/service.js");
  await (await import("@/lib/db/repos/settingsRepo.js")).updateSettings({ enableObservability: true, observabilityBatchSize: 1 });
  auth = await import("@/sse/services/auth.js");
  core = await import("open-sse/handlers/chatCore.js");
});
afterAll(async () => { server?.closeAllConnections(); if (server) await new Promise(resolve => server.close(resolve)); adapter?.close(); });

it("skips an isolated account, returns 503 metadata when all accounts are paused, and releases without changing isActive", async () => {
  await service.changeAvailability({ provider, connectionId: "a", model: "local-model", action: "isolate" });
  const selected = await auth.getProviderCredentials(provider, null, "local-model", { availabilityBusiness: true });
  expect(selected.connectionId).toBe("b");
  await service.changeAvailability({ provider, connectionId: "b", model: "local-model", action: "isolate" });
  const blocked = await auth.getProviderCredentials(provider, null, "local-model", { availabilityBusiness: true });
  expect(blocked).toMatchObject({ allRateLimited: true, availabilityBlocked: true, lastErrorCode: 503 });
  await service.changeAvailability({ provider, connectionId: "a", model: "local-model", action: "release" });
  expect(adapter.get("SELECT isActive FROM providerConnections WHERE id = ?", ["a"]).isActive).toBe(1);
});

it("records a real HTTP fixture completion through the production detail hook without storing prompts or upstream credentials", async () => {
  const credentials = await auth.getProviderCredentials(provider, null, "local-model", { availabilityBusiness: true });
  const body = { model: provider + "/local-model", messages: [{ role: "user", content: "Private business prompt only for local fixture" }], stream: false, max_tokens: 8 };
  const result = await core.handleChatCore({ body, modelInfo: { provider, model: "local-model" }, credentials, connectionId: credentials.connectionId,
    log: { debug() {}, info() {}, warn() {}, error() {} }, sourceFormatOverride: "openai", clientRawRequest: { endpoint: "/v1/chat/completions", headers: {}, body } });
  expect(result.response.status).toBe(200);
  await result.response.json();
  const state = await service.availabilityState();
  const record = Object.values(state.channels).find(row => row.connectionId === "a" && row.model === "local-model");
  expect(record.successes).toBe(1);
  expect(record.lastOutcome).toBe("success");
  const details = await import("@/lib/db/repos/requestDetailsRepo.js");
  await vi.waitFor(async () => {
    await details.__test__.flushToDatabase();
    expect(adapter.get("SELECT id FROM requestDetails WHERE id = ?", [record.lastRequestId])?.id).toBe(record.lastRequestId);
  }, { timeout: 1000, interval: 10 });
  expect(JSON.stringify(state)).not.toContain("Private business prompt");
  expect(JSON.stringify(state)).not.toContain("local-fixture-key");
});

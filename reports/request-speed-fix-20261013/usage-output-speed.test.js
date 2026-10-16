import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const originalDataDir = process.env.DATA_DIR;
let tempDir, repo, adapter;
beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "10router-output-speed-"));
  process.env.DATA_DIR = tempDir;
  vi.resetModules();
  await (await import("@/lib/db/index.js")).initDb();
  repo = await import("@/lib/db/repos/usageRepo.js");
  adapter = await (await import("@/lib/db/driver.js")).getAdapter();
});
afterAll(() => {
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

for (const feed of ["details", "history"]) {
  describe(`${feed} output speed aggregation`, () => {
    const cases = [
      ["below", 175, 67742, 67121, "streaming", 281.8],
      ["above", 175, 68845, 68306, "streaming", 324.7],
      ["boundary299", 299, 61000, 60000, "streaming", 299],
      ["boundary300", 300, 61000, 60000, "streaming", 300],
      ["boundary301", 301, 61000, 60000, "streaming", 301],
      ["missing", 100, 3000, undefined, "streaming", null],
      ["zero-ttft", 100, 3000, 0, "streaming", null],
      ["negative-ttft", 100, 3000, -1, "streaming", null],
      ["short", 100, 3000, 2951, "streaming", null],
      ["reversed", 100, 3000, 4000, "streaming", null],
      ["minimum", 100, 3000, 2950, "streaming", 2000],
      ["zero-output", 0, 3000, 2000, "streaming", null],
      ["nonstream", 100, 3000, 2800, "non-streaming", 33.3],
    ];
    for (const [label, output, total, ttft, responseMode, expected] of cases) {
      it(`${label}: node and model use the same duration`, async () => {
        const provider = `speed-${feed}-${label}`;
        const timestamp = new Date().toISOString();
        const entry = { provider, model: "speed-model", timestamp, status: "ok", tokens: { completion_tokens: output } };
        await repo.saveRequestUsage({ ...entry, meta: feed === "history" ? { latencyMs: total, ttftMs: ttft, responseMode } : {} });
        if (feed === "details") {
          const data = { ...entry, responseMode, latency: { total, ttft } };
          adapter.run("INSERT INTO requestDetails (id, timestamp, provider, model, status, data) VALUES (?, ?, ?, ?, ?, ?)",
            [provider, timestamp, provider, entry.model, "success", JSON.stringify(data)]);
        }
        const dashboard = await repo.getUsageDashboard({ days: 7, minRequests: 1 });
        expect(dashboard.nodes.find(row => row.provider === provider)?.avgSpeed).toBe(expected);
        expect(dashboard.models.find(row => row.provider === provider)?.avgSpeed).toBe(expected);
      });
    }
    if (feed === "history") it("legacy history with first-packet timing keeps post-packet speed", async () => {
      await repo.saveRequestUsage({ provider: "speed-legacy", model: "legacy", timestamp: new Date().toISOString(),
        tokens: { completion_tokens: 175 }, meta: { latencyMs: 68845, ttftMs: 68306 } });
      const dashboard = await repo.getUsageDashboard({ minRequests: 1 });
      expect(dashboard.nodes.find(row => row.provider === "speed-legacy")?.avgSpeed).toBe(324.7);
    });
  });
}

it("serves corrected model speed through the real dashboard HTTP route", async () => {
  // The public route uses the default 50-request visibility threshold.
  for (let index = 0; index < 50; index++) {
    await repo.saveRequestUsage({ provider: "speed-http", model: "speed-model", timestamp: new Date().toISOString(),
      usageKey: `speed-http-${index}`, tokens: { completion_tokens: 175 }, meta: { latencyMs: 68845, ttftMs: 68306 } });
  }
  const { GET } = await import("@/app/api/usage/dashboard/route.js");
  const server = createServer(async (request, response) => {
    try {
      const result = await GET(new Request(`http://127.0.0.1${request.url}`));
      response.writeHead(result.status, { "Content-Type": "application/json" });
      response.end(await result.text());
    } catch (error) {
      response.writeHead(500);
      response.end(error.message);
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/usage/dashboard?days=7`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.models.find(row => row.provider === "speed-http")?.avgSpeed).toBe(324.7);
    expect(data.nodes.find(row => row.provider === "speed-http")?.avgSpeed).toBe(324.7);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

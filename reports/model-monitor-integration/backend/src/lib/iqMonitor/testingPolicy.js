import { makeKv } from "@/lib/db/helpers/kvStore";

const store = makeKv("iqMonitor");
export async function testingOverview() {
  const [modes, history] = await Promise.all([testingModes(), store.get("manualHistory", [])]);
  const latest = new Map();
  for (const row of [...(history || [])].sort((a, b) => b.at - a.at)) {
    const answer = row.answers?.[0];
    const connectionId = answer?.connectionId || row.connectionId;
    if (!connectionId || (row.check || "iq") !== "availability") continue;
    const key = JSON.stringify([row.provider, connectionId, row.model]);
    if (!latest.has(key)) latest.set(key, { at: row.at, status: row.status, latencyMs: answer?.latencyMs ?? null });
  }
  return { modes, latest };
}

export async function testingModes() {
  return (await store.get("config", {}))?.testingModes || {};
}

export async function assertTestingAllowed(provider, trigger = "manual") {
  const mode = (await testingModes())[provider] || "observe";
  if (mode === "scheduled" || (mode === "manual" && trigger === "manual")) return;
  throw Object.assign(new Error(trigger === "scheduled" ? "此供应商未允许定时检测" : "此供应商仅允许业务观察，请先在检测配置中允许手动测试"), { status: 403, code: "TESTING_NOT_ALLOWED" });
}

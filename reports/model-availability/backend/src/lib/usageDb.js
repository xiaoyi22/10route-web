// Shim → re-export from new SQLite-based DB layer (src/lib/db/)
export {
  statsEmitter, trackPendingRequest, getActiveRequests,
  saveRequestUsage, getUsageHistory, getUsageStats, getChartData, getUsageDashboard,
  appendRequestLog, getRecentLogs,
  getRequestDetails, getRequestDetailById,
} from "@/lib/db/index.js";
import { saveRequestDetail as persistRequestDetail } from "@/lib/db/index.js";
import { observeBusinessDetail } from "@/lib/availability/service.js";
import { randomUUID } from "node:crypto";

export async function saveRequestDetail(detail) {
  const recorded = { ...detail, id: detail.id || randomUUID() };
  try { await observeBusinessDetail(recorded); }
  catch (error) { console.error("[modelAvailability] observe failed", error.message); }
  return persistRequestDetail(recorded);
}
